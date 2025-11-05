import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/annotations/recognitions/[id]/restore
 * Восстанавливает оригинальные QWEN аннотации
 * - Удаляет все manual аннотации
 * - Восстанавливает qwen_auto аннотации из original_annotations
 * - Сбрасывает has_modifications = false
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const recognitionId = id

    // 1. Проверяем что recognition существует
    const { data: recognition, error: recError } = await supabase
      .from('recognitions')
      .select('id')
      .eq('recognition_id', recognitionId)
      .single()

    if (recError || !recognition) {
      return NextResponse.json({ error: 'Recognition not found' }, { status: 404 })
    }

    // 2. Получаем все изображения этого recognition
    const { data: images, error: imgError } = await supabase
      .from('recognition_images')
      .select('id, original_annotations')
      .eq('recognition_id', recognitionId)

    if (imgError) {
      return NextResponse.json({ error: imgError.message }, { status: 500 })
    }

    // 3. Для каждого изображения:
    for (const image of images || []) {
      // 3a. Удаляем все существующие аннотации
      const { error: deleteError } = await supabase
        .from('annotations')
        .delete()
        .eq('image_id', image.id)

      if (deleteError) {
        console.error(`Error deleting annotations for image ${image.id}:`, deleteError)
        continue
      }

      // 3b. Восстанавливаем оригинальные QWEN аннотации
      if (image.original_annotations) {
        const origAnnotations = image.original_annotations as { qwen_dishes_detections?: unknown[]; qwen_plates_detections?: unknown[] }
        const qwenDishes = origAnnotations.qwen_dishes_detections || []
        const qwenPlates = origAnnotations.qwen_plates_detections || []

        // Конвертируем QWEN dishes в аннотации
        const dishAnnotations = qwenDishes.map((det, index: number) => {
          const detection = det as Record<string, unknown>
          const bbox = (detection.bbox_2d || detection.bbox) as number[]
          if (!bbox || !Array.isArray(bbox) || bbox.length < 4) return null
          
          // Парсим dish_index из label (может быть "dish_0", "dish_1" и т.д.)
          let dishIndex = null
          if (detection.dish_index !== undefined && detection.dish_index !== null) {
            dishIndex = typeof detection.dish_index === 'number' 
              ? detection.dish_index 
              : parseInt(String(detection.dish_index))
          } else if (detection.label && typeof detection.label === 'string') {
            const match = String(detection.label).match(/dish_(\d+)/)
            if (match) {
              dishIndex = parseInt(match[1])
            }
          }
          
          return {
            image_id: image.id,
            object_type: 'food',
            object_subtype: null,
            dish_index: dishIndex,
            bbox_x1: Math.round(bbox[0]),
            bbox_y1: Math.round(bbox[1]),
            bbox_x2: Math.round(bbox[2]),
            bbox_y2: Math.round(bbox[3]),
            is_overlapped: false,
            is_bottle_up: null,
            is_error: false,
            source: 'qwen_auto',
            // НОВОЕ: Сохраняем индекс оригинальной детекции для точного восстановления
            qwen_detection_index: index,
            qwen_detection_type: 'dish'
          }
        }).filter(Boolean) // Удаляем null

        // Конвертируем QWEN plates в аннотации
        const plateAnnotations = qwenPlates.map((det, index: number) => {
          const detection = det as Record<string, unknown>
          const bbox = (detection.bbox_2d || detection.bbox) as number[]
          if (!bbox || !Array.isArray(bbox) || bbox.length < 4) return null
          
          return {
            image_id: image.id,
            object_type: 'plate',
            object_subtype: null,
            dish_index: null,
            bbox_x1: Math.round(bbox[0]),
            bbox_y1: Math.round(bbox[1]),
            bbox_x2: Math.round(bbox[2]),
            bbox_y2: Math.round(bbox[3]),
            is_overlapped: false,
            is_bottle_up: null,
            is_error: false,
            source: 'qwen_auto',
            // НОВОЕ: Сохраняем индекс оригинальной детекции для точного восстановления
            qwen_detection_index: index,
            qwen_detection_type: 'plate'
          }
        }).filter(Boolean) // Удаляем null

        const allAnnotations = [...dishAnnotations, ...plateAnnotations]
        
        if (allAnnotations.length > 0) {
          const { error: insertError } = await supabase
            .from('annotations')
            .insert(allAnnotations)

          if (insertError) {
            console.error(`Error inserting annotations for image ${image.id}:`, insertError)
          }
        }
      }
    }

    // 4. Сбрасываем has_modifications, is_mistake и статус
    const { error: updateError } = await supabase
      .from('recognitions')
      .update({ 
        has_modifications: false,
        is_mistake: false,
        status: 'not_started'
      })
      .eq('recognition_id', recognitionId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Original annotations restored successfully'
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

