import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/clarifications - получить данные кларификаций из БД с пагинацией и фильтрами
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Параметры пагинации
    const page = parseInt(searchParams.get('page') || '0')
    const limit = parseInt(searchParams.get('limit') || '25')
    const from = page * limit
    const to = from + limit - 1

    // Начинаем построение запроса
    let query = supabase
      .from('clarifications')
      .select(`
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
        orders!inner(
          pos_transaction_id,
          device_canteen_name,
          start_dtts,
          has_assistant_events,
          image_url_main,
          image_url_qualifying,
          sign
        ),
        clarification_states(
          state,
          created_at,
          updated_at
        )
      `, { count: 'exact' })

    // Применяем фильтры для заказов
    if (searchParams.get('device_canteen_name')) {
      const names = searchParams.get('device_canteen_name')!.split(',')
      query = query.in('orders.device_canteen_name', names)
    }

    if (searchParams.get('start_dtts_from')) {
      query = query.gte('orders.start_dtts', searchParams.get('start_dtts_from'))
    }

    if (searchParams.get('start_dtts_to')) {
      query = query.lte('orders.start_dtts', searchParams.get('start_dtts_to'))
    }

    if (searchParams.get('has_assistant_events') !== null) {
      const value = searchParams.get('has_assistant_events') === 'true'
      query = query.eq('orders.has_assistant_events', value)
    }


    // Поиск по EAN
    if (searchParams.get('ean_search')) {
      const eanSearch = searchParams.get('ean_search')!
      query = query.or(`ean_matched.cs.${eanSearch},available_products.cs.${eanSearch}`)
    }

    // Фильтры по состояниям (работа с LEFT JOIN)
    if (searchParams.get('state')) {
      const states = searchParams.get('state')!.split(',')
      
      // Проверяем есть ли 'не задано' в фильтре
      const hasEmpty = states.includes('не задано')
      const actualStates = states.filter(s => s !== 'не задано')
      
      if (hasEmpty && actualStates.length > 0) {
        // Если нужны и пустые и конкретные состояния
        query = query.or(`clarification_states.state.in.(${actualStates.join(',')}),clarification_states.state.is.null`)
      } else if (hasEmpty) {
        // Только пустые состояния
        query = query.is('clarification_states.state', null)
      } else {
        // Только конкретные состояния
        query = query.in('clarification_states.state', actualStates)
      }
    }


    // Применяем пагинацию и сортировку
    const { data, count, error } = await query
      .order('orders(start_dtts)', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Преобразуем данные в формат, ожидаемый фронтендом
    const transformedData = data?.map(item => ({
      clarification_id: item.clarification_id,
      device_canteen_name: item.orders.device_canteen_name,
      pos_transaction_id: item.orders.pos_transaction_id,
      start_dtts: item.orders.start_dtts,
      rectangle: item.rectangle,
      clarification_type: item.clarification_type,
      image_url_main: item.orders.image_url_main,
      image_url_qualifying: item.orders.image_url_qualifying,
      ean_matched: item.ean_matched,
      product_name: item.product_name,
      sign: item.orders.sign,
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
    }))

    return NextResponse.json({
      data: transformedData || [],
      count: count || 0,
      page,
      limit,
      hasMore: (count || 0) > to + 1
    })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json({ error: 'Failed to load clarifications data' }, { status: 500 })
  }
}
