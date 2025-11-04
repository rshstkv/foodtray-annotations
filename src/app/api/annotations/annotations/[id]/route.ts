import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const annotationId = parseInt(params.id)
    const body = await request.json()

    const updates: any = {}
    
    if (body.bbox_x1 !== undefined) updates.bbox_x1 = body.bbox_x1
    if (body.bbox_y1 !== undefined) updates.bbox_y1 = body.bbox_y1
    if (body.bbox_x2 !== undefined) updates.bbox_x2 = body.bbox_x2
    if (body.bbox_y2 !== undefined) updates.bbox_y2 = body.bbox_y2
    if (body.is_overlapped !== undefined) updates.is_overlapped = body.is_overlapped
    if (body.is_bottle_up !== undefined) updates.is_bottle_up = body.is_bottle_up
    if (body.is_error !== undefined) updates.is_error = body.is_error
    if (body.object_subtype !== undefined) updates.object_subtype = body.object_subtype
    if (body.dish_index !== undefined) updates.dish_index = body.dish_index

    // Валидация координат если они обновляются
    const bbox_x1 = updates.bbox_x1 !== undefined ? updates.bbox_x1 : body.current_bbox_x1
    const bbox_y1 = updates.bbox_y1 !== undefined ? updates.bbox_y1 : body.current_bbox_y1
    const bbox_x2 = updates.bbox_x2 !== undefined ? updates.bbox_x2 : body.current_bbox_x2
    const bbox_y2 = updates.bbox_y2 !== undefined ? updates.bbox_y2 : body.current_bbox_y2

    if (bbox_x2 <= bbox_x1 || bbox_y2 <= bbox_y1) {
      return NextResponse.json({ error: 'Invalid bbox coordinates' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('annotations')
      .update(updates)
      .eq('id', annotationId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const annotationId = parseInt(params.id)

    const { error } = await supabase
      .from('annotations')
      .delete()
      .eq('id', annotationId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

