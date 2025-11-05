import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * PUT /api/annotations/{id}
 * 
 * Обновить отдельную аннотацию (bbox)
 * Используется для быстрого обновления is_overlapped, is_bottle_up и других полей
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const annotationId = parseInt(id)
    const body = await request.json()

    if (isNaN(annotationId)) {
      return NextResponse.json(
        { error: 'Invalid annotation ID' },
        { status: 400 }
      )
    }

    // Разрешенные поля для обновления
    const allowedFields = [
      'bbox_x1', 'bbox_y1', 'bbox_x2', 'bbox_y2',
      'object_type', 'object_subtype',
      'dish_index',
      'is_overlapped',
      'is_bottle_up',
      'is_error',
      'source'
    ]

    const updates: Record<string, unknown> = {}
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    })

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // Обновляем аннотацию
    const { data, error } = await supabase
      .from('annotations')
      .update(updates)
      .eq('id', annotationId)
      .select()
      .single()

    if (error) {
      console.error('Error updating annotation:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

