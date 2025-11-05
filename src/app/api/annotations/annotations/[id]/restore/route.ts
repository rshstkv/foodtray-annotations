import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const annotationId = parseInt(resolvedParams.id)

    // Получаем текущую аннотацию
    const { data: currentAnnotation, error: annotationError } = await supabase
      .from('annotations')
      .select('*')
      .eq('id', annotationId)
      .single()

    if (annotationError || !currentAnnotation) {
      return NextResponse.json({ error: 'Annotation not found' }, { status: 404 })
    }

    // Получаем image с оригинальными аннотациями
    const { data: image } = await supabase
      .from('recognition_images')
      .select('original_annotations, recognition_id')
      .eq('id', currentAnnotation.image_id)
      .single()

    if (!image || !image.original_annotations) {
      return NextResponse.json({ 
        error: 'Original annotations not found' 
      }, { status: 404 })
    }

    const originalAnnotations = image.original_annotations as { qwen_dishes_detections?: unknown[]; qwen_plates_detections?: unknown[] }
    let originalData: Record<string, unknown> | null = null

    // НОВАЯ ЛОГИКА: Используем qwen_detection_index для точного восстановления
    if (currentAnnotation.qwen_detection_index !== null && currentAnnotation.qwen_detection_type) {
      // Есть индекс - восстанавливаем напрямую
      const detectionType = currentAnnotation.qwen_detection_type
      const detectionIndex = currentAnnotation.qwen_detection_index
      
      let detections: unknown[] = []
      if (detectionType === 'dish') {
        detections = originalAnnotations.qwen_dishes_detections || []
      } else if (detectionType === 'plate') {
        detections = originalAnnotations.qwen_plates_detections || []
      }

      if (detectionIndex < detections.length) {
        const detection = detections[detectionIndex] as Record<string, unknown>
        const bbox = (detection.bbox_2d || detection.bbox) as number[]

        if (bbox && Array.isArray(bbox) && bbox.length >= 4) {
          // Извлекаем dish_index из детекции
          let detectionDishIndex = null
          if (typeof detection.dish_index === 'number') {
            detectionDishIndex = detection.dish_index
          } else if (typeof detection.dish_index === 'string') {
            const match = detection.dish_index.match(/\d+/)
            if (match) detectionDishIndex = parseInt(match[0])
          } else if (detection.label) {
            const match = String(detection.label).match(/dish_(\d+)/)
            if (match) detectionDishIndex = parseInt(match[1])
          }

          originalData = {
            bbox_x1: bbox[0],
            bbox_y1: bbox[1],
            bbox_x2: bbox[2],
            bbox_y2: bbox[3],
            is_bottle_up: detection.is_bottle_up !== undefined ? Boolean(detection.is_bottle_up) : null,
            is_overlapped: Boolean(detection.is_overlapped) || false,
            is_error: false, // Сбрасываем флаг ошибки
            dish_index: detectionDishIndex,
            source: 'qwen_auto',
            // Сохраняем связь с оригиналом
            qwen_detection_index: detectionIndex,
            qwen_detection_type: detectionType
          }
        }
      }
    } else if (currentAnnotation.source === 'qwen_auto' && originalAnnotations.qwen_dishes_detections) {
      // FALLBACK: Старая логика поиска по координатам для аннотаций созданных до миграции
      let bestMatch = null
      let bestMatchScore = Infinity

      for (let index = 0; index < originalAnnotations.qwen_dishes_detections.length; index++) {
        const detection = originalAnnotations.qwen_dishes_detections[index] as Record<string, unknown>
        const bbox = (detection.bbox_2d || detection.bbox) as number[]
        if (!bbox || !Array.isArray(bbox)) continue

        // Считаем расстояние между центрами bbox
        const currentCenterX = (currentAnnotation.bbox_x1 + currentAnnotation.bbox_x2) / 2
        const currentCenterY = (currentAnnotation.bbox_y1 + currentAnnotation.bbox_y2) / 2
        const detectionCenterX = (bbox[0] + bbox[2]) / 2
        const detectionCenterY = (bbox[1] + bbox[3]) / 2

        const distance = Math.sqrt(
          Math.pow(currentCenterX - detectionCenterX, 2) +
          Math.pow(currentCenterY - detectionCenterY, 2)
        )

        // Увеличен допуск до 2000 пикселей для надёжности после resize
        if (distance < bestMatchScore && distance < 2000) {
          let detectionDishIndex = null
          if (typeof detection.dish_index === 'number') {
            detectionDishIndex = detection.dish_index
          } else if (typeof detection.dish_index === 'string') {
            const match = detection.dish_index.match(/\d+/)
            if (match) detectionDishIndex = parseInt(match[0])
          } else if (detection.label) {
            const match = String(detection.label).match(/dish_(\d+)/)
            if (match) detectionDishIndex = parseInt(match[1])
          }

          bestMatchScore = distance
          bestMatch = {
            bbox_x1: bbox[0],
            bbox_y1: bbox[1],
            bbox_x2: bbox[2],
            bbox_y2: bbox[3],
            is_bottle_up: detection.is_bottle_up !== undefined ? Boolean(detection.is_bottle_up) : null,
            is_overlapped: Boolean(detection.is_overlapped) || false,
            is_error: false,
            dish_index: detectionDishIndex,
            source: 'qwen_auto',
            // Сохраняем индекс для будущих восстановлений
            qwen_detection_index: index,
            qwen_detection_type: 'dish'
          }
        }
      }

      originalData = bestMatch
    }

    // Если оригинал не найден
    if (!originalData) {
      // Если это QWEN аннотация - значит что-то пошло не так, НЕ удаляем
      if (currentAnnotation.source === 'qwen_auto') {
        console.error('Could not find original for QWEN annotation:', annotationId, currentAnnotation)
        return NextResponse.json({ 
          error: 'Could not find original QWEN detection. This annotation was too heavily modified or corrupted.' 
        }, { status: 400 })
      }

      // Это вручную созданная аннотация - удаляем её
      const { error: deleteError } = await supabase
        .from('annotations')
        .delete()
        .eq('id', annotationId)

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
      }

      // Обновляем has_modifications в recognition
      if (image.recognition_id) {
        const { data: _ } = await supabase
          .from('annotations')
          .select('id, image_id')
          .eq('image_id', currentAnnotation.image_id)

        const { data: allImages } = await supabase
          .from('recognition_images')
          .select('id')
          .eq('recognition_id', image.recognition_id)

        const imageIds = allImages?.map(img => img.id) || []
        const { data: recognitionAnnotations } = await supabase
          .from('annotations')
          .select('id, source')
          .in('image_id', imageIds)

        const hasModifications = recognitionAnnotations?.some(ann => ann.source === 'manual') || false

        await supabase
          .from('recognitions')
          .update({ has_modifications: hasModifications })
          .eq('recognition_id', image.recognition_id)
      }

      return NextResponse.json({ 
        data: null, 
        message: 'Manual annotation deleted (no original found)' 
      })
    }

    // Оригинал найден - восстанавливаем аннотацию оригинальными данными
    const { data: updatedAnnotation, error: updateError } = await supabase
      .from('annotations')
      .update(originalData)
      .eq('id', annotationId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Обновляем has_modifications и is_mistake в recognition
    if (image.recognition_id) {
      const { data: allImages } = await supabase
        .from('recognition_images')
        .select('id')
        .eq('recognition_id', image.recognition_id)

      const imageIds = allImages?.map(img => img.id) || []
      const { data: recognitionAnnotations } = await supabase
        .from('annotations')
        .select('id, source, is_error')
        .in('image_id', imageIds)

      const hasModifications = recognitionAnnotations?.some(ann => ann.source === 'manual') || false
      const hasErrors = recognitionAnnotations?.some(ann => ann.is_error) || false

      await supabase
        .from('recognitions')
        .update({ 
          has_modifications: hasModifications,
          is_mistake: hasErrors
        })
        .eq('recognition_id', image.recognition_id)
    }

    return NextResponse.json({ data: updatedAnnotation })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

