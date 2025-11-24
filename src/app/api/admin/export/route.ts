import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type {
  ValidationExportData,
  ValidationExportRecognition,
  ValidationExportItem,
  ValidationExportImage,
  ValidationExportAnnotation,
  ValidationExportRecipe,
  BBox,
} from '@/types/domain'

/**
 * GET /api/admin/export
 * 
 * Экспорт валидированных данных в новом формате для data scientists
 * Query params:
 * - recognitionIds: comma-separated список recognition IDs (required)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Проверка авторизации
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Проверка роли
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Получение параметров
    const searchParams = request.nextUrl.searchParams
    const recognitionIdsParam = searchParams.get('recognitionIds')

    if (!recognitionIdsParam) {
      return NextResponse.json({ error: 'recognitionIds parameter is required' }, { status: 400 })
    }

    const recognitionIds = recognitionIdsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))

    if (recognitionIds.length === 0) {
      return NextResponse.json({ error: 'No valid recognition IDs provided' }, { status: 400 })
    }

    console.log('[export] Total recognition IDs to export:', recognitionIds.length)

    // Получить recognitions (батчинг для обхода ограничения .in() на ~1000 элементов)
    const BATCH_SIZE = 1000
    const recognitions = []
    
    for (let i = 0; i < recognitionIds.length; i += BATCH_SIZE) {
      const batch = recognitionIds.slice(i, i + BATCH_SIZE)
      
      const { data, error } = await supabase
        .from('recognitions')
        .select('id')
        .in('id', batch)
        .order('id')

      if (error) {
        console.error('[export] Error fetching recognitions batch:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      
      if (data) {
        recognitions.push(...data)
      }
    }

    console.log('[export] Total recognitions fetched:', recognitions.length)

    if (!recognitions || recognitions.length === 0) {
      return NextResponse.json({ error: 'No recognitions found' }, { status: 404 })
    }

    // Получить последний completed work log для каждого recognition
    const { data: workLogs, error: workLogsError } = await supabase
      .from('validation_work_log')
      .select('id, recognition_id, completed_at')
      .in('recognition_id', recognitionIds)
      .eq('status', 'completed')
      .order('recognition_id')
      .order('completed_at', { ascending: false })

    if (workLogsError) {
      console.error('[export] Error fetching work logs:', workLogsError)
      return NextResponse.json({ error: workLogsError.message }, { status: 500 })
    }

    // Берем последний work log для каждого recognition
    const latestWorkLogByRecognition = new Map<number, any>()
    for (const log of workLogs || []) {
      if (!latestWorkLogByRecognition.has(log.recognition_id)) {
        latestWorkLogByRecognition.set(log.recognition_id, log)
      }
    }

    // Получить work_log_ids для загрузки items и annotations
    const workLogIds = Array.from(latestWorkLogByRecognition.values()).map(log => log.id)

    if (workLogIds.length === 0) {
      return NextResponse.json({ error: 'No completed validations found for selected recognitions' }, { status: 404 })
    }

    // Загрузить work_items с LEFT JOIN к recipe_line_options для получения external_id и name
    const { data: workItems, error: workItemsError } = await supabase
      .from('work_items')
      .select(`
        id,
        work_log_id,
        recognition_id,
        type,
        quantity,
        bottle_orientation,
        metadata,
        recipe_line_id,
        recipe_lines(
          recipe_line_options(
            external_id,
            name,
            is_selected
          )
        )
      `)
      .in('work_log_id', workLogIds)
      .eq('is_deleted', false)

    if (workItemsError) {
      console.error('[export] Error fetching work items:', workItemsError)
      return NextResponse.json({ error: workItemsError.message }, { status: 500 })
    }

    // Загрузить work_annotations с JOIN к initial_annotations для сравнения bbox
    const { data: workAnnotations, error: workAnnotationsError } = await supabase
      .from('work_annotations')
      .select(`
        id,
        work_log_id,
        work_item_id,
        image_id,
        bbox,
        is_occluded,
        occlusion_metadata,
        initial_annotation_id,
        initial_annotations(
          bbox
        )
      `)
      .in('work_log_id', workLogIds)
      .eq('is_deleted', false)

    if (workAnnotationsError) {
      console.error('[export] Error fetching work annotations:', workAnnotationsError)
      return NextResponse.json({ error: workAnnotationsError.message }, { status: 500 })
    }

    // Загрузить images для всех recognitions
    const { data: images, error: imagesError } = await supabase
      .from('images')
      .select('id, recognition_id, camera_number, storage_path, width, height')
      .in('recognition_id', recognitionIds)
      .order('recognition_id')
      .order('camera_number')

    if (imagesError) {
      console.error('[export] Error fetching images:', imagesError)
      return NextResponse.json({ error: imagesError.message }, { status: 500 })
    }

    // Создать maps для быстрого доступа
    const workItemsByRecognition = new Map<number, any[]>()
    for (const item of workItems || []) {
      if (!workItemsByRecognition.has(item.recognition_id)) {
        workItemsByRecognition.set(item.recognition_id, [])
      }
      workItemsByRecognition.get(item.recognition_id)!.push(item)
    }

    const workAnnotationsByImageId = new Map<number, any[]>()
    for (const ann of workAnnotations || []) {
      if (!workAnnotationsByImageId.has(ann.image_id)) {
        workAnnotationsByImageId.set(ann.image_id, [])
      }
      workAnnotationsByImageId.get(ann.image_id)!.push(ann)
    }

    const imagesByRecognition = new Map<number, any[]>()
    for (const img of images || []) {
      if (!imagesByRecognition.has(img.recognition_id)) {
        imagesByRecognition.set(img.recognition_id, [])
      }
      imagesByRecognition.get(img.recognition_id)!.push(img)
    }

    // Функция для сравнения bbox
    const bboxEquals = (bbox1: BBox | null, bbox2: BBox | null): boolean => {
      if (!bbox1 || !bbox2) return false
      return bbox1.x === bbox2.x && bbox1.y === bbox2.y && 
             bbox1.w === bbox2.w && bbox1.h === bbox2.h
    }

    // Собрать данные для каждого recognition
    const exportRecognitions: ValidationExportRecognition[] = []

    for (const recognition of recognitions) {
      const recId = recognition.id
      const workLog = latestWorkLogByRecognition.get(recId)

      if (!workLog) {
        continue // Пропускаем recognitions без completed валидаций
      }

      // Собрать items для recipe (уникальные work_items)
      const recItems = workItemsByRecognition.get(recId) || []
      const exportItems: ValidationExportItem[] = recItems.map(item => {
        // Получить external_id и name из JOIN
        let externalId = null
        let name = null
        
        if (item.recipe_lines?.recipe_line_options) {
          const options = Array.isArray(item.recipe_lines.recipe_line_options)
            ? item.recipe_lines.recipe_line_options
            : [item.recipe_lines.recipe_line_options]
          
          // Найти selected option или взять первый
          const selectedOption = options.find((opt: any) => opt.is_selected) || options[0]
          externalId = selectedOption?.external_id || null
          name = selectedOption?.name || null
        }
        
        return {
          item_id: item.id, // Используем work_item.id как item_id
          item_type: item.type,
          external_id: externalId,
          name: name,
          quantity: item.quantity,
          bottle_orientation: item.bottle_orientation,
          metadata: item.metadata,
        }
      })

      // Собрать images с annotations
      const recImages = imagesByRecognition.get(recId) || []
      const exportImages: ValidationExportImage[] = recImages.map(img => {
        const imgAnnotations = workAnnotationsByImageId.get(img.id) || []
        
        const exportAnnotations: ValidationExportAnnotation[] = imgAnnotations.map(ann => {
          // Получить original bbox из initial_annotations
          const initialAnnotation = Array.isArray(ann.initial_annotations) 
            ? ann.initial_annotations[0] 
            : ann.initial_annotations
          
          const originalBbox = initialAnnotation?.bbox as BBox | null
          const currentBbox = ann.bbox as BBox
          const wasModified = !bboxEquals(currentBbox, originalBbox)
          
          return {
            item_id: ann.work_item_id,
            bbox: currentBbox,
            is_occluded: ann.is_occluded,
            occlusion_metadata: ann.occlusion_metadata,
            was_modified: wasModified,
            original_bbox: wasModified ? originalBbox : null,
          }
        })
        
        return {
          camera_number: img.camera_number,
          image_name: img.camera_number === 1 ? 'Main' : 'Qualifying',
          storage_path: img.storage_path,
          width: img.width,
          height: img.height,
          annotations: exportAnnotations,
        }
      })

      exportRecognitions.push({
        recognition_id: recId,
        recipe: {
          items: exportItems,
        },
        images: exportImages,
      })
    }

    // Формирование финального результата
    const exportData: ValidationExportData = {
      recognitions: exportRecognitions,
    }

    // Возврат JSON с правильными заголовками
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="annotations_export_${timestamp}.json"`,
      },
    })
  } catch (error) {
    console.error('[export] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
