/**
 * Скрипт для обратного заполнения индексов связи с оригинальными QWEN детекциями
 * 
 * Для каждой существующей аннотации с source='qwen_auto':
 * - Находит соответствующую детекцию в original_annotations по координатам
 * - Сохраняет индекс в массиве в поле qwen_detection_index
 * - Проставляет qwen_detection_type ('dish' или 'plate')
 * 
 * Запуск: npx tsx scripts/populate-qwen-detection-indexes.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Загружаем переменные окружения
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Отсутствуют переменные окружения NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface Annotation {
  id: number
  image_id: number
  object_type: string
  bbox_x1: number
  bbox_y1: number
  bbox_x2: number
  bbox_y2: number
  dish_index: number | null
  source: string
  qwen_detection_index: number | null
}

interface Detection {
  bbox?: number[]
  bbox_2d?: number[]
  dish_index?: number | string
  label?: string
}

/**
 * Находит индекс детекции в массиве по координатам bbox
 */
function findDetectionIndex(
  annotation: Annotation,
  detections: Detection[]
): number | null {
  const centerX = (annotation.bbox_x1 + annotation.bbox_x2) / 2
  const centerY = (annotation.bbox_y1 + annotation.bbox_y2) / 2

  let bestMatchIndex: number | null = null
  let minDistance = Infinity
  const maxDistance = 500 // Максимальное расстояние в пикселях

  detections.forEach((detection, index) => {
    const bbox = detection.bbox_2d || detection.bbox
    if (!bbox || bbox.length < 4) return

    const detectionCenterX = (bbox[0] + bbox[2]) / 2
    const detectionCenterY = (bbox[1] + bbox[3]) / 2

    const distance = Math.sqrt(
      Math.pow(centerX - detectionCenterX, 2) +
      Math.pow(centerY - detectionCenterY, 2)
    )

    if (distance < minDistance && distance < maxDistance) {
      minDistance = distance
      bestMatchIndex = index
    }
  })

  return bestMatchIndex
}

async function populateQwenDetectionIndexes() {
  console.log('🚀 Начинаем заполнение индексов связи с QWEN детекциями...\n')

  // 1. Получить все аннотации с source='qwen_auto' у которых еще нет индекса
  const { data: annotations, error: annotationsError } = await supabase
    .from('annotations')
    .select('id, image_id, object_type, bbox_x1, bbox_y1, bbox_x2, bbox_y2, dish_index, source, qwen_detection_index')
    .eq('source', 'qwen_auto')
    .is('qwen_detection_index', null)

  if (annotationsError) {
    console.error('❌ Ошибка при получении аннотаций:', annotationsError)
    process.exit(1)
  }

  if (!annotations || annotations.length === 0) {
    console.log('✅ Все аннотации уже имеют индексы или нет аннотаций с source=qwen_auto')
    return
  }

  console.log(`📊 Найдено ${annotations.length} аннотаций для обработки\n`)

  // 2. Группируем по image_id для эффективной обработки
  const annotationsByImage = new Map<number, Annotation[]>()
  annotations.forEach((ann) => {
    const imageAnns = annotationsByImage.get(ann.image_id) || []
    imageAnns.push(ann as Annotation)
    annotationsByImage.set(ann.image_id, imageAnns)
  })

  let updated = 0
  let skipped = 0
  let totalImages = annotationsByImage.size

  // 3. Обрабатываем каждое изображение
  for (const [imageId, imageAnnotations] of annotationsByImage.entries()) {
    // Получаем original_annotations для этого изображения
    const { data: image, error: imageError } = await supabase
      .from('recognition_images')
      .select('original_annotations')
      .eq('id', imageId)
      .single()

    if (imageError || !image?.original_annotations) {
      console.log(`⚠️  Image ${imageId}: нет original_annotations (${imageAnnotations.length} аннотаций пропущено)`)
      skipped += imageAnnotations.length
      continue
    }

    const originalAnnotations = image.original_annotations as any
    const qwenDishes = originalAnnotations.qwen_dishes_detections || []
    const qwenPlates = originalAnnotations.qwen_plates_detections || []

    // Обрабатываем каждую аннотацию этого изображения
    for (const annotation of imageAnnotations) {
      let detectionIndex: number | null = null
      let detectionType: string | null = null

      // Определяем в каком массиве искать
      if (annotation.object_type === 'food') {
        detectionIndex = findDetectionIndex(annotation, qwenDishes)
        detectionType = 'dish'
      } else if (annotation.object_type === 'plate') {
        detectionIndex = findDetectionIndex(annotation, qwenPlates)
        detectionType = 'plate'
      }

      if (detectionIndex !== null && detectionType) {
        // Обновляем аннотацию
        const { error: updateError } = await supabase
          .from('annotations')
          .update({
            qwen_detection_index: detectionIndex,
            qwen_detection_type: detectionType
          })
          .eq('id', annotation.id)

        if (updateError) {
          console.error(`❌ Ошибка при обновлении аннотации ${annotation.id}:`, updateError)
          skipped++
        } else {
          updated++
        }
      } else {
        console.log(`⚠️  Annotation ${annotation.id}: не найдено соответствие в original_annotations`)
        skipped++
      }
    }

    // Прогресс
    if (updated % 50 === 0 && updated > 0) {
      const processedImages = Array.from(annotationsByImage.keys()).filter(id => id <= imageId).length
      console.log(`✅ Обработано ${updated} аннотаций (изображений: ${processedImages}/${totalImages})`)
    }
  }

  console.log('\n📊 Результаты:')
  console.log(`✅ Обновлено аннотаций: ${updated}`)
  console.log(`⚠️  Пропущено аннотаций: ${skipped}`)
  console.log(`📷 Обработано изображений: ${totalImages}`)
  console.log('\n🎉 Готово!')
}

// Запускаем скрипт
populateQwenDetectionIndexes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Непредвиденная ошибка:', error)
    process.exit(1)
  })

