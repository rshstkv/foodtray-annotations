#!/usr/bin/env tsx
/**
 * Process clarifications from clarifications_data_raw and insert into orders + clarifications tables
 * Usage: npx tsx scripts/process-raw-to-db.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const supabase = createClient(supabaseUrl, supabaseKey)

interface ClarificationData {
  clarification_id: string
  device_canteen_name: string
  pos_transaction_id: string
  start_dtts: string
  has_assistant_events: boolean
  d: {
    details: Array<{
      price: number
      description: string
      external_id: string
    }>
    is_buzzer: boolean
    rectangle: string
    buzzer_type?: string | null
    buzzer_color?: string | null
    is_auto_chosen: boolean
    clarification_type: string
  }
  rectangle: string
  clarification_type: string
  image_found: boolean
  sign: string
  image_url_main?: string
  image_url_qualifying?: string
  ean_matched: Array<{
    external_id: string
    final_product_count: number
    product_count_array: number[]
  }>
  ean_matched_count: number
  product_name: string
  superclass?: string
  hyperclass?: string
}

async function processRawData() {
  try {
    console.log('🚀 Starting data processing from clarifications_data_raw...')

    // Читаем все данные из clarifications_data_raw
    console.log('📖 Reading raw data from database...')
    const { data: rawRecords, error: fetchError } = await supabase
      .from('clarifications_data_raw')
      .select('data')

    if (fetchError) {
      console.error('❌ Error fetching raw data:', fetchError)
      return
    }

    if (!rawRecords || rawRecords.length === 0) {
      console.log('ℹ️ No data found in clarifications_data_raw')
      return
    }

    // Извлекаем данные из JSONB поля
    const clarificationsData: ClarificationData[] = rawRecords.map(r => r.data as ClarificationData)

    console.log(`📊 Found ${clarificationsData.length} clarifications`)

    // Группируем по pos_transaction_id для создания orders
    const ordersMap = new Map<string, ClarificationData[]>()
    
    clarificationsData.forEach(item => {
      const txnId = item.pos_transaction_id
      if (!ordersMap.has(txnId)) {
        ordersMap.set(txnId, [])
      }
      ordersMap.get(txnId)!.push(item)
    })

    console.log(`📦 Found ${ordersMap.size} unique orders`)

    // Подготавливаем данные orders (без image полей - они переехали в clarifications)
    const ordersToInsert = Array.from(ordersMap.entries()).map(([txnId, items]) => {
      const firstItem = items[0]
      return {
        pos_transaction_id: txnId,
        device_canteen_name: firstItem.device_canteen_name,
        start_dtts: firstItem.start_dtts,
        has_assistant_events: firstItem.has_assistant_events === null || firstItem.has_assistant_events === undefined 
          ? false 
          : firstItem.has_assistant_events
      }
    })

    // Проверяем какие orders уже существуют
    console.log('🔍 Checking for existing orders...')
    const existingTxnIds = ordersToInsert.map(o => o.pos_transaction_id)
    const { data: existingOrders, error: checkError } = await supabase
      .from('orders')
      .select('id, pos_transaction_id')
      .in('pos_transaction_id', existingTxnIds)

    if (checkError) {
      console.error('❌ Error checking existing orders:', checkError)
      return
    }

    // Создаем map order_id по pos_transaction_id для существующих
    const orderIdMap = new Map<string, number>()
    if (existingOrders) {
      existingOrders.forEach(order => {
        orderIdMap.set(order.pos_transaction_id, order.id)
      })
    }

    // Фильтруем - вставляем только новые orders
    const newOrders = ordersToInsert.filter(o => !orderIdMap.has(o.pos_transaction_id))

    if (newOrders.length > 0) {
      console.log(`💾 Inserting ${newOrders.length} new orders...`)
      const { data: insertedOrders, error: ordersError } = await supabase
        .from('orders')
        .insert(newOrders)
        .select('id, pos_transaction_id')

      if (ordersError) {
        console.error('❌ Error inserting orders:', ordersError)
        return
      }

      // Добавляем новые orders в map
      if (insertedOrders) {
        insertedOrders.forEach(order => {
          orderIdMap.set(order.pos_transaction_id, order.id)
        })
      }

      console.log(`✅ Inserted ${insertedOrders?.length || newOrders.length} new orders`)
    } else {
      console.log(`ℹ️ All ${ordersToInsert.length} orders already exist`)
    }

    // Обработка дубликатов
    function stableStringify(value: any): string {
      if (value === null || value === undefined) return String(value)
      const t = typeof value
      if (t !== 'object') return JSON.stringify(value)
      if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
      const keys = Object.keys(value).sort()
      return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((value as any)[k])).join(',') + '}'
    }

    const groups = new Map<string, { items: ClarificationData[], idx: number[] }>()
    clarificationsData.forEach((item, index) => {
      const id = item.clarification_id
      if (!groups.has(id)) groups.set(id, { items: [], idx: [] })
      const g = groups.get(id)!
      g.items.push(item)
      g.idx.push(index)
    })

    const clarificationsResolved: ClarificationData[] = []
    const identicalDupIds: Array<{ clarification_id: string, count: number }> = []
    const conflictReport: Array<{
      clarification_id: string
      total_count: number
      unique_variants: number
      kept_variant: 'last'
    }> = []

    for (const [id, group] of groups.entries()) {
      if (group.items.length === 1) {
        clarificationsResolved.push(group.items[0])
        continue
      }

      const normalized = group.items.map(stableStringify)
      const uniqueNorm = new Set(normalized)
      if (uniqueNorm.size === 1) {
        identicalDupIds.push({ clarification_id: id, count: group.items.length })
        clarificationsResolved.push(group.items[group.items.length - 1])
      } else {
        conflictReport.push({
          clarification_id: id,
          total_count: group.items.length,
          unique_variants: uniqueNorm.size,
          kept_variant: 'last'
        })
        clarificationsResolved.push(group.items[group.items.length - 1])
      }
    }

    if (identicalDupIds.length) {
      const totalRemoved = identicalDupIds.reduce((acc, x) => acc + (x.count - 1), 0)
      console.log(`ℹ️ Identical duplicates: ${identicalDupIds.length} groups; kept last, removed ${totalRemoved}.`)
    }
    if (conflictReport.length) {
      const reportPath = path.join(__dirname, '..', 'import-conflicts.json')
      fs.writeFileSync(reportPath, JSON.stringify({
        generated_at: new Date().toISOString(),
        note: 'Kept last variant for each conflicting group.',
        conflicts: conflictReport
      }, null, 2))
      console.warn(`⚠️ Conflicting duplicates: ${conflictReport.length} groups; report: ${reportPath}`)
    }
    console.log(`🔄 After duplicate handling: ${clarificationsResolved.length} (from ${clarificationsData.length})`)

    // Подготавливаем clarifications
    const clarificationsToInsert = clarificationsResolved.map(item => {
      const orderId = orderIdMap.get(item.pos_transaction_id)
      if (!orderId) {
        throw new Error(`Order ID not found for transaction ${item.pos_transaction_id}`)
      }

      return {
        order_id: orderId,
        clarification_id: item.clarification_id,
        rectangle: item.rectangle,
        clarification_type: item.clarification_type,
        image_found: item.image_found,
        product_name: item.product_name,
        superclass: item.superclass,
        hyperclass: item.hyperclass,
        ean_matched: item.ean_matched,
        ean_matched_count: item.ean_matched_count,
        available_products: item.d.details,
        metadata: {
          is_buzzer: item.d.is_buzzer,
          buzzer_type: item.d.buzzer_type,
          buzzer_color: item.d.buzzer_color,
          is_auto_chosen: item.d.is_auto_chosen
        },
        // Image fields (moved to clarifications table)
        image_url_main: item.image_url_main,
        image_url_qualifying: item.image_url_qualifying,
        sign: item.sign
      }
    })

    // Проверяем какие clarifications уже существуют
    console.log('🔍 Checking for existing clarifications...')
    const existingClarIds = clarificationsToInsert.map(c => c.clarification_id)
    const { data: existingClarifications, error: checkClarError } = await supabase
      .from('clarifications')
      .select('clarification_id')
      .in('clarification_id', existingClarIds)

    if (checkClarError) {
      console.error('❌ Error checking existing clarifications:', checkClarError)
      return
    }

    const existingClarIdsSet = new Set(existingClarifications?.map(c => c.clarification_id) || [])
    const newClarifications = clarificationsToInsert.filter(c => !existingClarIdsSet.has(c.clarification_id))

    // Вставляем clarifications пачками (только новые)
    console.log(`💾 Inserting ${newClarifications.length} new clarifications...`)
    const batchSize = 100
    let insertedClarifications = 0

    for (let i = 0; i < newClarifications.length; i += batchSize) {
      const batch = newClarifications.slice(i, i + batchSize)
      
      const { error } = await supabase
        .from('clarifications')
        .insert(batch)

      if (error) {
        console.error(`❌ Error inserting batch ${Math.floor(i/batchSize) + 1}:`, error)
        continue
      }

      insertedClarifications += batch.length
      console.log(`✅ Inserted ${insertedClarifications}/${newClarifications.length} clarifications`)
    }

    if (existingClarIdsSet.size > 0) {
      console.log(`ℹ️ Skipped ${existingClarIdsSet.size} existing clarifications`)
    }

    console.log(`\n🎉 Processing completed!`)
    console.log(`📦 New Orders: ${newOrders.length} (Total: ${ordersToInsert.length})`)
    console.log(`🍽️ New Clarifications: ${insertedClarifications} (Total: ${clarificationsToInsert.length})`)

    // Проверяем результат
    const { count: ordersCount } = await supabase.from('orders').select('*', { count: 'exact', head: true })
    const { count: clarificationsCount } = await supabase.from('clarifications').select('*', { count: 'exact', head: true })

    console.log(`📈 Total in database - Orders: ${ordersCount}, Clarifications: ${clarificationsCount}`)

  } catch (error) {
    console.error('💥 Processing failed:', error)
  }
}

// Запускаем обработку
processRawData()

