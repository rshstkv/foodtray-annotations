import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/annotations/dish-eans
 * 
 * Получить список EAN блюд из dish_ean_metadata
 * Query params:
 *   - requires_bottle_orientation: boolean - фильтр по необходимости проверки ориентации
 * 
 * Response:
 * [
 *   { ean: "123456", dish_name: "Вино красное", requires_bottle_orientation: true },
 *   ...
 * ]
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const requiresBottleOrientation = searchParams.get('requires_bottle_orientation')

    let query = supabase
      .from('dish_ean_metadata')
      .select('ean, dish_name, requires_bottle_orientation')
      .order('dish_name')

    // Фильтр по requires_bottle_orientation
    if (requiresBottleOrientation === 'true') {
      query = query.eq('requires_bottle_orientation', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching dish EANs:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(data || [])

  } catch (error) {
    console.error('Unexpected error in dish-eans endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

