import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/clarifications - получить данные кларификаций из БД с пагинацией и фильтрами
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Подготовим информацию о фильтре состояний до построения SELECT,
    // чтобы динамически выбрать тип джойна для clarification_states
    const stateFilterRaw = searchParams.get('state')
    const stateFilterValues = stateFilterRaw ? stateFilterRaw.split(',') : []
    const hasEmptyState = stateFilterValues.includes('не задано')
    const actualStateValues = stateFilterValues.filter(s => s !== 'не задано')
    // Если фильтруем только по конкретным состояниям (yes/no) без "не задано",
    // используем INNER JOIN для ускорения и корректной фильтрации
    const clarificationStatesSelect = (!hasEmptyState && actualStateValues.length > 0)
      ? 'clarification_states!inner(\n          state,\n          created_at,\n          updated_at\n        )'
      : 'clarification_states(\n          state,\n          created_at,\n          updated_at\n        )'
    
    // Поиск по EAN (используем для постфильтрации ниже)
    const eanSearchParam = (searchParams.get('ean_search') || '').trim()

    // Параметры пагинации
    const page = parseInt(searchParams.get('page') || '0')
    const limit = parseInt(searchParams.get('limit') || '25')
    const from = page * limit
    const to = from + limit - 1

    // Начинаем построение запроса
    let query = supabase
      .from('clarifications')
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
        orders!inner(
          pos_transaction_id,
          device_canteen_name,
          start_dtts,
          has_assistant_events
        ),
        ${clarificationStatesSelect}
        
      `, { count: 'exact' })

    // Применяем фильтры для заказов
    if (searchParams.get('device_canteen_name')) {
      const names = searchParams.get('device_canteen_name')!.split(',')
      query = query.in('orders.device_canteen_name', names)
    }

    const startFrom = searchParams.get('start_dtts_from')
    const startTo = searchParams.get('start_dtts_to')

    if (startFrom && startTo && startFrom === startTo) {
      // Одиночный день: [date, date + 1 day)
      const nextDay = new Date(`${startTo}T00:00:00Z`)
      nextDay.setUTCDate(nextDay.getUTCDate() + 1)
      query = query
        .gte('orders.start_dtts', startFrom)
        .lt('orders.start_dtts', nextDay.toISOString())
    } else {
      if (startFrom) {
        query = query.gte('orders.start_dtts', startFrom)
      }
      if (startTo) {
        query = query.lte('orders.start_dtts', startTo)
      }
    }

    if (searchParams.get('has_assistant_events') !== null) {
      const value = searchParams.get('has_assistant_events') === 'true'
      query = query.eq('orders.has_assistant_events', value)
    }

    // Не применяем SQL-фильтры по ean_matched/available_products, чтобы избежать 22P02 и несовместимости операторов
    // Поиск по POS_TXN — лёгкий, можно фильтровать на SQL
    const posSearchParam = (searchParams.get('pos_search') || '').trim()
    if (posSearchParam) {
      // Точное совпадение по POS_TXN
      query = query.eq('orders.pos_transaction_id', posSearchParam)
    }

    // Фильтры по состояниям (работа с LEFT/INNER JOIN в зависимости от фильтра)
    if (stateFilterValues.length > 0) {
      if (hasEmptyState && actualStateValues.length > 0) {
        // Нужны и пустые и конкретные состояния
        query = query.or(`clarification_states.state.in.(${actualStateValues.join(',')}),clarification_states.state.is.null`)
      } else if (hasEmptyState) {
        // Только пустые состояния
        query = query.is('clarification_states.state', null)
      } else {
        // Только конкретные состояния
        query = query.in('clarification_states.state', actualStateValues)
      }
    }


    // Применяем сортировку. Если есть ean_search — забираем побольше строк и фильтруем в JS
    let fetchResult
    if (eanSearchParam) {
      fetchResult = await query
        .order('orders(start_dtts)', { ascending: false })
        .limit(10000)
    } else {
      fetchResult = await query
        .order('orders(start_dtts)', { ascending: false })
        .range(from, to)
    }

    const { data, count, error } = fetchResult

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Преобразуем данные в формат, ожидаемый фронтендом
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
      orders:
        | {
            device_canteen_name: string
            pos_transaction_id: string
            start_dtts: string
            has_assistant_events: boolean
          }
        | Array<{
            device_canteen_name: string
            pos_transaction_id: string
            start_dtts: string
            has_assistant_events: boolean
          }>
      clarification_states?: Array<{ state: 'yes' | 'no'; created_at: string; updated_at: string }>
    }

    let transformedData = (data as Row[] | undefined)?.map((item) => {
      const order = Array.isArray(item.orders) ? item.orders[0] : item.orders
      return {
        db_id: item.id,
        clarification_id: item.clarification_id,
        device_canteen_name: order?.device_canteen_name,
        pos_transaction_id: order?.pos_transaction_id,
        start_dtts: order?.start_dtts,
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
        // Добавляем информацию о состоянии
        state: item.clarification_states?.[0]?.state || undefined,
        state_created_at: item.clarification_states?.[0]?.created_at || undefined,
        state_updated_at: item.clarification_states?.[0]?.updated_at || undefined
      }
    }) || []

    // Точная фильтрация по ean_matched: оставляем только те,
    // где среди сопоставленных товаров есть нужный external_id
    if (eanSearchParam) {
      const needle = eanSearchParam
      type EanMatch = { external_id?: string }
      transformedData = transformedData.filter((row) => {
        const list = Array.isArray(row.ean_matched) ? (row.ean_matched as EanMatch[]) : []
        return list.some((x) => x && typeof x === 'object' && String(x.external_id) === needle)
      })
    }

    return NextResponse.json({
      data: transformedData,
      count: eanSearchParam ? transformedData.length : (count || 0),
      page,
      limit,
      hasMore: eanSearchParam ? false : ((count || 0) > to + 1)
    })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json({ error: 'Failed to load clarifications data' }, { status: 500 })
  }
}
