import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const annotationId = parseInt(id)
    const body = await request.json()

    const updates: Record<string, unknown> = {}
    
    if (body.bbox_x1 !== undefined) updates.bbox_x1 = body.bbox_x1
    if (body.bbox_y1 !== undefined) updates.bbox_y1 = body.bbox_y1
    if (body.bbox_x2 !== undefined) updates.bbox_x2 = body.bbox_x2
    if (body.bbox_y2 !== undefined) updates.bbox_y2 = body.bbox_y2
    if (body.is_overlapped !== undefined) updates.is_overlapped = body.is_overlapped
    if (body.is_bottle_up !== undefined) updates.is_bottle_up = body.is_bottle_up
    if (body.is_error !== undefined) updates.is_error = body.is_error
    if (body.object_subtype !== undefined) updates.object_subtype = body.object_subtype
    if (body.dish_index !== undefined) updates.dish_index = body.dish_index
    if (body.object_type !== undefined) updates.object_type = body.object_type
    
    // ИСПРАВЛЕНО: Больше НЕ меняем source на 'manual'
    // source теперь показывает только источник создания (qwen_auto/manual), а не факт модификации
    // Связь с оригиналом сохраняется через qwen_detection_index

    // Валидация координат если они обновляются
    const bbox_x1 = updates.bbox_x1 !== undefined ? updates.bbox_x1 : body.current_bbox_x1
    const bbox_y1 = updates.bbox_y1 !== undefined ? updates.bbox_y1 : body.current_bbox_y1
    const bbox_x2 = updates.bbox_x2 !== undefined ? updates.bbox_x2 : body.current_bbox_x2
    const bbox_y2 = updates.bbox_y2 !== undefined ? updates.bbox_y2 : body.current_bbox_y2

    if (bbox_x2 <= bbox_x1 || bbox_y2 <= bbox_y1) {
      return NextResponse.json({ error: 'Invalid bbox coordinates' }, { status: 400 })
    }

    // Получаем annotation для нахождения recognition_id
    const { data: annotation, error: annError } = await supabase
      .from('annotations')
      .select('image_id')
      .eq('id', annotationId)
      .single()

    if (annError || !annotation) {
      return NextResponse.json({ error: 'Annotation not found' }, { status: 404 })
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

    // Получаем recognition_id для обновления статуса
    const { data: image } = await supabase
      .from('recognition_images')
      .select('recognition_id')
      .eq('id', annotation.image_id)
      .single()

    if (image) {
      // Получаем все аннотации этого recognition для пересчёта is_mistake
      const { data: allImages } = await supabase
        .from('recognition_images')
        .select('id')
        .eq('recognition_id', image.recognition_id)

      const imageIds = allImages?.map(img => img.id) || []
      const { data: allAnnotations } = await supabase
        .from('annotations')
        .select('is_error')
        .in('image_id', imageIds)

      // Проверяем есть ли хоть одна аннотация с ошибкой
      const hasErrors = allAnnotations?.some(ann => ann.is_error) || false

      // Обновляем recognition: статус "в работе", флаг модификаций и is_mistake
      const { data: recognition } = await supabase
        .from('recognitions')
        .select('status')
        .eq('recognition_id', image.recognition_id)
        .single()

      if (recognition && recognition.status !== 'completed') {
        await supabase
          .from('recognitions')
          .update({ 
            status: 'in_progress',
            has_modifications: true,
            is_mistake: hasErrors
          })
          .eq('recognition_id', image.recognition_id)
      } else {
        // Даже если completed - помечаем что есть модификации и обновляем is_mistake
        await supabase
          .from('recognitions')
          .update({ 
            has_modifications: true,
            is_mistake: hasErrors
          })
          .eq('recognition_id', image.recognition_id)
      }
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const annotationId = parseInt(id)

    // Получаем annotation для нахождения recognition_id
    const { data: annotation, error: annError } = await supabase
      .from('annotations')
      .select('image_id')
      .eq('id', annotationId)
      .single()

    if (annError || !annotation) {
      return NextResponse.json({ error: 'Annotation not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('annotations')
      .delete()
      .eq('id', annotationId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Получаем recognition_id для обновления статуса
    const { data: image } = await supabase
      .from('recognition_images')
      .select('recognition_id')
      .eq('id', annotation.image_id)
      .single()

    if (image) {
      // Получаем все аннотации этого recognition для пересчёта is_mistake
      const { data: allImages } = await supabase
        .from('recognition_images')
        .select('id')
        .eq('recognition_id', image.recognition_id)

      const imageIds = allImages?.map(img => img.id) || []
      const { data: allAnnotations } = await supabase
        .from('annotations')
        .select('is_error')
        .in('image_id', imageIds)

      // Проверяем есть ли хоть одна аннотация с ошибкой
      const hasErrors = allAnnotations?.some(ann => ann.is_error) || false

      // Обновляем recognition: статус "в работе", флаг модификаций и is_mistake
      const { data: recognition } = await supabase
        .from('recognitions')
        .select('status')
        .eq('recognition_id', image.recognition_id)
        .single()

      if (recognition && recognition.status !== 'completed') {
        await supabase
          .from('recognitions')
          .update({ 
            status: 'in_progress',
            has_modifications: true,
            is_mistake: hasErrors
          })
          .eq('recognition_id', image.recognition_id)
      } else {
        // Даже если completed - помечаем что есть модификации и обновляем is_mistake
        await supabase
          .from('recognitions')
          .update({ 
            has_modifications: true,
            is_mistake: hasErrors
          })
          .eq('recognition_id', image.recognition_id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

