import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const is_mistake = searchParams.get('is_mistake')
    const date_from = searchParams.get('date_from')
    const date_to = searchParams.get('date_to')
    const main_min = searchParams.get('main_min')
    const main_max = searchParams.get('main_max')
    const qualifying_min = searchParams.get('qualifying_min')
    const qualifying_max = searchParams.get('qualifying_max')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit
    
    let query = supabase
      .from('recognitions_with_stats')
      .select('*', { count: 'exact' })

    // Применяем фильтры
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    
    if (is_mistake === 'true') {
      query = query.eq('is_mistake', true)
    } else if (is_mistake === 'false') {
      query = query.eq('is_mistake', false)
    }
    
    if (date_from) {
      query = query.gte('recognition_date', date_from)
    }
    
    if (date_to) {
      query = query.lte('recognition_date', date_to)
    }
    
    // Фильтры по количеству аннотаций
    if (main_min) {
      query = query.gte('main_count', parseInt(main_min))
    }
    
    if (main_max) {
      query = query.lte('main_count', parseInt(main_max))
    }
    
    if (qualifying_min) {
      query = query.gte('qualifying_count', parseInt(qualifying_min))
    }
    
    if (qualifying_max) {
      query = query.lte('qualifying_count', parseInt(qualifying_max))
    }

    // Сортировка и пагинация
    query = query
      .order('recognition_date', { ascending: false })
      .order('recognition_id', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching recognitions:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

