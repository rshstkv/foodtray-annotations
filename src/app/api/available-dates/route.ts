import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/available-dates - вернуть список дат (YYYY-MM-DD), где есть данные, с учетом фильтров
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Обработка фильтров, логика аналогична /api/clarifications
    const stateFilterRaw = searchParams.get('state')
    const stateFilterValues = stateFilterRaw ? stateFilterRaw.split(',') : []
    const hasEmptyState = stateFilterValues.includes('не задано')
    const actualStateValues = stateFilterValues.filter(s => s !== 'не задано')

    const clarificationStatesSelect = (!hasEmptyState && actualStateValues.length > 0)
      ? 'clarification_states!inner(state)'
      : 'clarification_states(state)'

    let query = supabase
      .from('clarifications')
      .select(`
        orders!inner(
          start_dtts
        ),
        ${clarificationStatesSelect}
      `)

    // Фильтры по orders
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

    // Поиск по EAN: только среди сопоставленных товаров
    if (searchParams.get('ean_search')) {
      const eanSearch = searchParams.get('ean_search')!
      query = query.contains('ean_matched', [{ external_id: eanSearch }])
    }

    // Фильтры по состояниям
    if (stateFilterValues.length > 0) {
      if (hasEmptyState && actualStateValues.length > 0) {
        query = query.or(`clarification_states.state.in.(${actualStateValues.join(',')}),clarification_states.state.is.null`)
      } else if (hasEmptyState) {
        query = query.is('clarification_states.state', null)
      } else {
        query = query.in('clarification_states.state', actualStateValues)
      }
    }

    // Получаем достаточно большую выборку, так как нам нужны только даты
    const { data, error } = await query
      .order('orders(start_dtts)', { ascending: false })
      .limit(10000)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    type Row = {
      orders:
        | { start_dtts: string }
        | Array<{ start_dtts: string }>
    }

    const datesSet = new Set<string>()
    ;(data as Row[] | undefined)?.forEach((row) => {
      const order = Array.isArray(row.orders) ? row.orders[0] : row.orders
      const iso = order?.start_dtts
      if (iso) {
        const d = new Date(iso)
        const yyyy = d.getUTCFullYear()
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(d.getUTCDate()).padStart(2, '0')
        datesSet.add(`${yyyy}-${mm}-${dd}`)
      }
    })

    return NextResponse.json({ dates: Array.from(datesSet).sort() })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json({ error: 'Failed to load available dates' }, { status: 500 })
  }
}


