import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/clarifications - получить данные кларификаций из БД с пагинацией и фильтрами
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    console.log('API clarifications called with params:', Object.fromEntries(searchParams.entries()))

    // Поиск по EAN (используем для постфильтрации ниже)
    const eanSearchParam = (searchParams.get('ean_search') || '').trim()

    // Параметры пагинации
    const page = parseInt(searchParams.get('page') || '0')
    const limit = parseInt(searchParams.get('limit') || '25')
    const from = page * limit
    const to = from + limit - 1

    // ЕДИНСТВЕННЫЙ запрос - всегда используем view clarifications_with_bucket
    let query = supabase
      .from('clarifications_with_bucket')
      .select(`
        id,
        clarification_id,
        rectangle,
        clarification_type,
        image_found,
        product_name,
        superclass,
        hyperclass,
        ean_matched,
        ean_matched_count,
        available_products,
        metadata,
        image_url_main,
        image_url_qualifying,
        sign,
        pos_transaction_id,
        device_canteen_name,
        start_dtts,
        has_assistant_events,
        state,
        state_created_at,
        state_updated_at,
        bucket
      `, { count: 'exact' })

    // Применяем фильтры (view имеет плоские поля)
    if (searchParams.get('device_canteen_name')) {
      const names = searchParams.get('device_canteen_name')!.split(',')
      query = query.in('device_canteen_name', names)
    }

    const startFrom = searchParams.get('start_dtts_from')
    const startTo = searchParams.get('start_dtts_to')

    if (startFrom && startTo && startFrom === startTo) {
      // Одиночный день: [date, date + 1 day)
      const nextDay = new Date(`${startTo}T00:00:00Z`)
      nextDay.setUTCDate(nextDay.getUTCDate() + 1)
      query = query
        .gte('start_dtts', startFrom)
        .lt('start_dtts', nextDay.toISOString())
    } else {
      if (startFrom) {
        query = query.gte('start_dtts', startFrom)
      }
      if (startTo) {
        query = query.lte('start_dtts', startTo)
      }
    }

    if (searchParams.get('has_assistant_events') !== null) {
      const value = searchParams.get('has_assistant_events') === 'true'
      query = query.eq('has_assistant_events', value)
    }

    // Поиск по POS_TXN
    const posSearchParam = (searchParams.get('pos_search') || '').trim()
    if (posSearchParam) {
      query = query.eq('pos_transaction_id', posSearchParam)
    }

    // Фильтры по состояниям (простая логика)
    const stateFilterRaw = searchParams.get('state')
    const stateFilterValues = stateFilterRaw ? stateFilterRaw.split(',') : []
    const hasEmptyState = stateFilterValues.includes('не задано')
    const actualStateValues = stateFilterValues.filter(s => s !== 'не задано')

    if (stateFilterValues.length > 0) {
      if (hasEmptyState && actualStateValues.length > 0) {
        query = query.or(`state.in.(${actualStateValues.join(',')}),state.is.null`)
      } else if (hasEmptyState) {
        query = query.is('state', null)
      } else {
        query = query.in('state', actualStateValues)
      }
    }

    // Переносим фильтрацию по EAN в SQL
    if (eanSearchParam) {
      query = query.filter('ean_matched', 'cs', JSON.stringify([{ external_id: eanSearchParam }]))
    }

    // Фильтр по частотному бакету
    const freqBucket = (searchParams.get('freq_bucket') || '').trim()
    if (freqBucket) {
      query = query.eq('bucket', freqBucket)
    }

    // Пагинация и сортировка по дате заказа
    const fetchResult = await query
      .order('start_dtts', { ascending: false })
      .range(from, to)

    const { data, count, error } = fetchResult

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Простая трансформация данных (view имеет плоские поля)
    type Row = {
      id: number
      clarification_id: string
      rectangle: string
      clarification_type: string
      ean_matched: unknown
      product_name: string
      superclass?: string
      hyperclass?: string
      image_found?: boolean
      ean_matched_count?: number
      available_products: Array<{ price: number; description: string; external_id: string }>
      image_url_main?: string
      image_url_qualifying?: string
      sign?: string
      device_canteen_name: string
      pos_transaction_id: string
      start_dtts: string
      has_assistant_events: boolean
      state?: 'yes' | 'no' | 'bbox_error' | 'unknown'
      state_created_at?: string
      state_updated_at?: string
      bucket?: string
    }

    const transformedData = (data as Row[] | undefined)?.map((item) => {
      return {
        db_id: item.id,
        clarification_id: item.clarification_id,
        device_canteen_name: item.device_canteen_name,
        pos_transaction_id: item.pos_transaction_id,
        start_dtts: item.start_dtts,
        rectangle: item.rectangle,
        clarification_type: item.clarification_type,
        image_url_main: item.image_url_main,
        image_url_qualifying: item.image_url_qualifying,
        ean_matched: item.ean_matched,
        product_name: item.product_name,
        sign: item.sign,
        superclass: item.superclass,
        hyperclass: item.hyperclass,
        image_found: item.image_found,
        ean_matched_count: item.ean_matched_count,
        d: {
          details: item.available_products
        },
        // Состояние уже плоское из view
        state: item.state || undefined,
        state_created_at: item.state_created_at || undefined,
        state_updated_at: item.state_updated_at || undefined,
        // Частотный бакет
        freq_bucket: item.bucket || undefined
      }
    }) || []

    // Простая статистика для отображения  
    const yesCount = transformedData.filter(item => item.state === 'yes').length
    const noCount = transformedData.filter(item => item.state === 'no').length
    const bboxErrorCount = transformedData.filter(item => item.state === 'bbox_error').length
    const unknownCount = transformedData.filter(item => item.state === 'unknown').length
    const checkedCount = yesCount + noCount + bboxErrorCount + unknownCount

    return NextResponse.json({
      data: transformedData,
      count: (count || 0),
      page,
      limit,
      hasMore: ((count || 0) > to + 1),
      stats: {
        checked: checkedCount,
        total: (count || 0),
        yes: yesCount,
        no: noCount
      }
    })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json({ error: 'Failed to load clarifications data' }, { status: 500 })
  }
}
