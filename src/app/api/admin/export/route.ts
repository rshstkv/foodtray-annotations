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
 * Query params (те же что и в export-preview):
 * - userIds: comma-separated список user IDs (optional)
 * - step_<TYPE>: статус этапа completed/skipped/any (optional)
 * - search: recognition_id для поиска (optional)
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

    // Получение параметров (те же что в export-preview)
    const searchParams = request.nextUrl.searchParams
    const userIdsParam = searchParams.get('userIds')
    const searchQuery = searchParams.get('search')
    
    const userIds = userIdsParam ? userIdsParam.split(',').map(id => id.trim()) : null
    const searchRecognitionId = searchQuery ? parseInt(searchQuery) : null
    const stepFood = searchParams.get('step_FOOD_VALIDATION')
    const stepPlate = searchParams.get('step_PLATE_VALIDATION')
    const stepBuzzer = searchParams.get('step_BUZZER_VALIDATION')
    const stepOcclusion = searchParams.get('step_OCCLUSION_VALIDATION')
    const stepBottle = searchParams.get('step_BOTTLE_ORIENTATION_VALIDATION')

    const rpcParams = {
      user_ids: userIds || null,
      search_recognition_id: searchRecognitionId && !isNaN(searchRecognitionId) ? searchRecognitionId : null,
      step_food: stepFood || null,
      step_plate: stepPlate || null,
      step_buzzer: stepBuzzer || null,
      step_occlusion: stepOcclusion || null,
      step_bottle: stepBottle || null,
      page_limit: 100000, // Большой лимит для экспорта всех данных
      page_offset: 0,
    }

    console.log('[export] Fetching filtered work logs with params:', rpcParams)

    // Получить ВСЕ отфильтрованные work logs через RPC
    const { data: workLogs, error: workLogsError } = await supabase.rpc('get_filtered_work_logs', rpcParams)

    if (workLogsError) {
      console.error('[export] Error calling RPC:', workLogsError)
      return NextResponse.json({ error: workLogsError.message }, { status: 500 })
    }

    if (!workLogs || workLogs.length === 0) {
      return NextResponse.json({ error: 'No work logs found with given filters' }, { status: 404 })
    }

    console.log('[export] Total work logs fetched:', workLogs.length)

    // Получить recognition IDs и batch_id
    const recognitionIds = workLogs.map((log: any) => log.recognition_id)
    const { data: recognitions, error: recognitionsError } = await supabase
      .from('recognitions')
      .select('id, batch_id')
      .in('id', recognitionIds)

    if (recognitionsError) {
      console.error('[export] Error fetching recognitions:', recognitionsError)
      return NextResponse.json({ error: recognitionsError.message }, { status: 500 })
    }

    // Создать Map для быстрого доступа к batch_id
    const recognitionBatchMap = new Map(recognitions?.map(r => [r.id, r.batch_id]) || [])

    // Создать Map для быстрого доступа (RPC уже вернул последний work_log для каждого recognition)
    const latestWorkLogByRecognition = new Map<number, any>()
    for (const log of workLogs || []) {
      latestWorkLogByRecognition.set(log.recognition_id, {
        id: log.work_log_id,
        recognition_id: log.recognition_id,
        validation_steps: log.validation_steps,
        assigned_to: log.assigned_to,
        completed_at: log.completed_at,
      })
    }

    // Получить emails пользователей
    const userIdsSet = new Set(workLogs.map((log: any) => log.assigned_to))
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', Array.from(userIdsSet))

    const userEmailMap = new Map(profiles?.map(p => [p.id, p.email]) || [])

    // Получить work_log_ids для загрузки items и annotations
    const workLogIds = workLogs.map((log: any) => log.work_log_id)

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

    for (const [recId, workLog] of latestWorkLogByRecognition.entries()) {
      // Получить batch_id для этого recognition
      const batchId = recognitionBatchMap.get(recId) || null

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

      // Собрать validation_metadata
      const validationSteps = workLog.validation_steps && Array.isArray(workLog.validation_steps)
        ? workLog.validation_steps.map((step: any) => ({
            type: step.type,
            status: step.status,
            order: step.order,
          }))
        : []

      exportRecognitions.push({
        recognition_id: recId,
        batch_id: batchId,
        validation_metadata: {
          work_log_id: workLog.id,
          assigned_to: workLog.assigned_to,
          assigned_to_email: userEmailMap.get(workLog.assigned_to) || 'unknown',
          completed_at: workLog.completed_at || '',
          validation_steps: validationSteps,
        },
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
