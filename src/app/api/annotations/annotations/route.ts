import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      image_id,
      object_type,
      object_subtype,
      dish_index,
      bbox_x1,
      bbox_y1,
      bbox_x2,
      bbox_y2,
      is_overlapped,
      is_bottle_up,
      is_error
    } = body

    // Валидация
    if (!image_id || !object_type || bbox_x1 === undefined || bbox_y1 === undefined || 
        bbox_x2 === undefined || bbox_y2 === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (bbox_x2 <= bbox_x1 || bbox_y2 <= bbox_y1) {
      return NextResponse.json({ error: 'Invalid bbox coordinates' }, { status: 400 })
    }

    // Получаем recognition_id для обновления статуса
    const { data: image, error: imgError } = await supabase
      .from('recognition_images')
      .select('recognition_id')
      .eq('id', image_id)
      .single()

    if (imgError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('annotations')
      .insert({
        image_id,
        object_type,
        object_subtype: object_subtype || null,
        dish_index: dish_index !== undefined ? dish_index : null,
        bbox_x1,
        bbox_y1,
        bbox_x2,
        bbox_y2,
        is_overlapped: is_overlapped || false,
        is_bottle_up: is_bottle_up || null,
        is_error: is_error || false,
        source: 'manual'
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Обновляем recognition: workflow_state "в работе" и флаг модификаций
    const { data: recognition } = await supabase
      .from('recognitions')
      .select('workflow_state')
      .eq('recognition_id', image.recognition_id)
      .single()

    if (recognition && recognition.workflow_state !== 'completed') {
      await supabase
        .from('recognitions')
        .update({ 
          workflow_state: 'in_progress',
          has_modifications: true
        })
        .eq('recognition_id', image.recognition_id)
    } else {
      // Даже если completed - помечаем что есть модификации
      await supabase
        .from('recognitions')
        .update({ has_modifications: true })
        .eq('recognition_id', image.recognition_id)
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

