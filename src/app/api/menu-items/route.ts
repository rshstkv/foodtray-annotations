import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search')?.trim()
  const limit = parseInt(searchParams.get('limit') || '500')
  const dateFilter = searchParams.get('date') // Для фильтрации по активной дате

  try {
    let query = supabase
      .from('menu_items')
      .select('id, proto_name, ean, super_class, product_name, english_name, reference_image_url')
      .limit(limit)

    if (search) {
      // Check if search looks like an EAN (numeric)
      const isEAN = /^\d+$/.test(search)

      if (isEAN) {
        // Exact EAN match
        query = query.eq('ean', search)
      } else {
        // Fuzzy search by product name (case-insensitive)
        query = query.ilike('product_name', `%${search}%`)
      }
    }

    query = query.order('product_name', { ascending: true })

    const { data, error } = await query

    if (error) {
      console.error('Error fetching menu items:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      items: data || [],
      count: data?.length || 0
    })
  } catch (error) {
    console.error('Unexpected error in menu-items API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

