#!/usr/bin/env tsx
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// Подхватываем переменные из .env.local (без зависимости от dotenv)
function loadEnvFromFile(envPath: string) {
  try {
    if (!fs.existsSync(envPath)) return
    const raw = fs.readFileSync(envPath, 'utf8')
    raw.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) return
      const key = trimmed.slice(0, eqIdx).trim()
      let value = trimmed.slice(eqIdx + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        value = value.slice(1, -1)
      }
      // Всегда переопределяем значениями из файла, чтобы исключить невалидные значения окружения
      process.env[key] = value
    })
  } catch (_) {
    // ignore parse errors, rely on process.env
  }
}

// Загружаем .env.local из корня проекта
loadEnvFromFile(path.resolve(__dirname, '..', '.env.local'))

// Настройки Supabase из ENV с безопасными дефолтами для локалки
const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
// Нормализуем: Studio->API, localhost->127.0.0.1
const supabaseUrl = rawUrl
  .replace('localhost', '127.0.0.1')
  .replace(':54323', ':54321')
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || ''
if (!supabaseServiceKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY не найден. Использую анонимный ключ из ENV, операции могут быть ограничены.')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

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

async function importClarifications() {
  try {
    console.log('🚀 Starting orders and clarifications import...')

    // Путь к JSON файлу (аргумент CLI либо дефолтный путь)
    const cliArgPath = process.argv[2]
    const filePath = cliArgPath
      ? path.resolve(cliArgPath)
      : path.join(__dirname, '..', '..', 'assisted_orders', 'assisted_clarifications.json')
    
    if (!fs.existsSync(filePath)) {
      console.error('❌ File not found:', filePath)
      return
    }

    // Читаем и парсим JSON
    console.log('📖 Reading JSON file...')
    const fileContent = fs.readFileSync(filePath, 'utf8')
    const clarificationsData: ClarificationData[] = JSON.parse(fileContent)

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

    // Подготавливаем данные orders
    const ordersToInsert = Array.from(ordersMap.entries()).map(([txnId, items]) => {
      const firstItem = items[0] // берем первый элемент для общих данных заказа
      return {
        pos_transaction_id: txnId,
        device_canteen_name: firstItem.device_canteen_name,
        start_dtts: firstItem.start_dtts,
        // Только true/false: null/undefined → false, иначе оставляем исходное значение
        has_assistant_events: ((): any => {
          const v = (firstItem as any).has_assistant_events
          return (v === null || v === undefined) ? false : v
        })(),
        image_url_main: firstItem.image_url_main,
        image_url_qualifying: firstItem.image_url_qualifying,
        sign: firstItem.sign
      }
    })

    // Вставляем orders
    console.log('💾 Inserting orders...')
    const { data: insertedOrders, error: ordersError } = await supabase
      .from('orders')
      .upsert(ordersToInsert, { onConflict: 'pos_transaction_id' })
      .select('id, pos_transaction_id')

    if (ordersError) {
      console.error('❌ Error inserting orders:', ordersError)
      return
    }

    console.log(`✅ Inserted ${insertedOrders?.length || ordersToInsert.length} orders`)

    // Создаем map order_id по pos_transaction_id
    const orderIdMap = new Map<string, number>()
    if (insertedOrders) {
      insertedOrders.forEach(order => {
        orderIdMap.set(order.pos_transaction_id, order.id)
      })
    }

    // Обрабатываем дубликаты:
    // - Если все записи с одинаковым clarification_id идентичны — оставляем ПОСЛЕДНЮЮ и логируем уведомление
    // - Если записи различаются — не можем вставить все из-за UNIQUE(clarification_id) в БД,
    //   поэтому берём ПОСЛЕДНЮЮ версию и формируем отчёт о конфликте

    function stableStringify(value: any): string {
      if (value === null || value === undefined) return String(value)
      const t = typeof value
      if (t !== 'object') return JSON.stringify(value)
      if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
      const keys = Object.keys(value).sort()
      return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((value as any)[k])).join(',') + '}'
    }

    type ConflictReportItem = {
      clarification_id: string
      total_count: number
      unique_variants: number
      kept_variant: 'last'
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
    const conflictReport: ConflictReportItem[] = []

    for (const [id, group] of groups.entries()) {
      if (group.items.length === 1) {
        clarificationsResolved.push(group.items[0])
        continue
      }

      const normalized = group.items.map(stableStringify)
      const uniqueNorm = new Set(normalized)
      if (uniqueNorm.size === 1) {
        // Все идентичны — оставляем ПОСЛЕДНЮЮ
        identicalDupIds.push({ clarification_id: id, count: group.items.length })
        clarificationsResolved.push(group.items[group.items.length - 1])
      } else {
        // Конфликтующие дубли — из-за UNIQUE(clarification_id) берём ПОСЛЕДНЮЮ,
        // остальное фиксируем в отчёте для пользователя
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
      console.log(`ℹ️ Identical duplicates detected for ${identicalDupIds.length} clarification_id; kept last, removed ${totalRemoved}.`)
    }
    if (conflictReport.length) {
      try {
        const reportPath = path.join(__dirname, '..', 'import-conflicts.json')
        fs.writeFileSync(reportPath, JSON.stringify({
          generated_at: new Date().toISOString(),
          note: 'Due to UNIQUE(clarification_id) in DB, kept the last variant for each conflicting group.',
          conflicts: conflictReport
        }, null, 2))
        console.warn(`⚠️ Conflicting duplicates detected for ${conflictReport.length} clarification_id; kept last variants. Detailed report: ${reportPath}`)
      } catch (e) {
        console.warn('⚠️ Failed to write conflict report file:', e)
      }
    }
    console.log(`🔄 Clarifications after duplicate handling: ${clarificationsResolved.length} (from ${clarificationsData.length})`)

    // Подготавливаем данные clarifications
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
        }
      }
    })

    // Вставляем clarifications пачками
    console.log('💾 Inserting clarifications...')
    const batchSize = 1000
    let insertedClarifications = 0

    for (let i = 0; i < clarificationsToInsert.length; i += batchSize) {
      const batch = clarificationsToInsert.slice(i, i + batchSize)
      
      const { error } = await supabase
        .from('clarifications')
        .upsert(batch, { onConflict: 'clarification_id' })

      if (error) {
        console.error(`❌ Error inserting clarifications batch ${Math.floor(i/batchSize) + 1}:`, error)
        continue
      }

      insertedClarifications += batch.length
      console.log(`✅ Inserted ${insertedClarifications}/${clarificationsToInsert.length} clarifications`)
    }

    console.log(`🎉 Import completed!`)
    console.log(`📦 Orders: ${insertedOrders?.length || ordersToInsert.length}`)
    console.log(`🍽️ Clarifications: ${insertedClarifications}`)

    // Проверяем результат
    const { count: ordersCount } = await supabase.from('orders').select('*', { count: 'exact', head: true })
    const { count: clarificationsCount } = await supabase.from('clarifications').select('*', { count: 'exact', head: true })

    console.log(`📈 Total in database - Orders: ${ordersCount}, Clarifications: ${clarificationsCount}`)

  } catch (error) {
    console.error('💥 Import failed:', error)
  }
}

// Запускаем импорт
importClarifications()
