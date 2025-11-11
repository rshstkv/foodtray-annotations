import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/admin/bottle-orientation-eans
 * 
 * Получить список всех настроенных EAN для bottle orientation задач
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('bottle_orientation_eans')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching bottle orientation EANs:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(data || [])

  } catch (error) {
    console.error('Unexpected error in GET bottle-orientation-eans:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/bottle-orientation-eans
 * 
 * Добавить новый EAN в список bottle orientation
 * 
 * Body:
 *   - ean: string (required)
 *   - description: string (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ean, description } = body

    if (!ean || typeof ean !== 'string' || ean.trim() === '') {
      return NextResponse.json(
        { error: 'EAN is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('bottle_orientation_eans')
      .insert({ 
        ean: ean.trim(), 
        description: description || null 
      })
      .select()
      .single()

    if (error) {
      // Проверка на дубликат
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'EAN уже существует в списке' },
          { status: 409 }
        )
      }

      console.error('Error adding bottle orientation EAN:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    console.log(`Added bottle orientation EAN: ${ean}`)

    return NextResponse.json(data, { status: 201 })

  } catch (error) {
    console.error('Unexpected error in POST bottle-orientation-eans:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/bottle-orientation-eans?id=123
 * 
 * Удалить EAN из списка bottle orientation
 * 
 * Query params:
 *   - id: number (required)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'ID parameter is required' },
        { status: 400 }
      )
    }

    const idNum = parseInt(id, 10)
    if (isNaN(idNum)) {
      return NextResponse.json(
        { error: 'ID must be a valid number' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('bottle_orientation_eans')
      .delete()
      .eq('id', idNum)

    if (error) {
      console.error('Error deleting bottle orientation EAN:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    console.log(`Deleted bottle orientation EAN id: ${idNum}`)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Unexpected error in DELETE bottle-orientation-eans:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

