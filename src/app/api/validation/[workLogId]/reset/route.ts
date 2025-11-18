import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * POST /api/validation/[workLogId]/reset
 * 
 * Сбросить сессию валидации к начальному состоянию:
 * - Удалить все work_items и work_annotations
 * - Заново скопировать данные из initial_tray_items и initial_annotations
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workLogId: string }> }
) {
  try {
    const { workLogId } = await params
    const workLogIdNum = parseInt(workLogId, 10)
    
    console.log('[validation/reset] Starting reset for workLogId:', workLogIdNum)

    if (isNaN(workLogIdNum)) {
      console.error('[validation/reset] Invalid work log ID:', workLogId)
      return apiError('Invalid work log ID', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      console.error('[validation/reset] No authenticated user')
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }
    
    console.log('[validation/reset] User authenticated:', user.id)

    // 1. Проверить work log
    const { data: workLog, error: workLogError } = await supabase
      .from('validation_work_log')
      .select('*')
      .eq('id', workLogIdNum)
      .single()

    if (workLogError || !workLog) {
      console.error('[validation/reset] Work log not found:', workLogError)
      return apiError('Work log not found', 404, ApiErrorCode.NOT_FOUND)
    }
    
    console.log('[validation/reset] Work log found:', workLog.id, 'status:', workLog.status)

    // Проверка доступа
    if (workLog.assigned_to !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        console.error('[validation/reset] Access denied for user:', user.id)
        return apiError('Access denied', 403, ApiErrorCode.FORBIDDEN)
      }
    }

    if (workLog.status !== 'in_progress') {
      console.error('[validation/reset] Invalid status:', workLog.status)
      return apiError('Can only reset in-progress work logs', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const recognitionId = workLog.recognition_id
    console.log('[validation/reset] Recognition ID:', recognitionId)

    // 2. Удалить все текущие work_items и work_annotations
    console.log('[validation/reset] Deleting existing work_items...')
    const { error: deleteItemsError } = await supabase
      .from('work_items')
      .delete()
      .eq('work_log_id', workLogIdNum)

    if (deleteItemsError) {
      console.error('[validation/reset] Error deleting work_items:', deleteItemsError)
      return apiError('Failed to delete work items', 500, ApiErrorCode.INTERNAL_ERROR)
    }
    console.log('[validation/reset] work_items deleted successfully')

    console.log('[validation/reset] Deleting existing work_annotations...')
    const { error: deleteAnnotationsError } = await supabase
      .from('work_annotations')
      .delete()
      .eq('work_log_id', workLogIdNum)

    if (deleteAnnotationsError) {
      console.error('[validation/reset] Error deleting work_annotations:', deleteAnnotationsError)
      return apiError('Failed to delete work annotations', 500, ApiErrorCode.INTERNAL_ERROR)
    }
    console.log('[validation/reset] work_annotations deleted successfully')

    // 3. Скопировать заново initial_tray_items в work_items
    const { data: initialItems, error: initialItemsError } = await supabase
      .from('initial_tray_items')
      .select('*')
      .eq('recognition_id', recognitionId)

    if (initialItemsError) {
      console.error('[validation/reset] Error loading initial items:', initialItemsError)
      return apiError('Failed to load initial items', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    // Вставляем work_items
    if (initialItems && initialItems.length > 0) {
      const workItemsToInsert = initialItems.map(item => ({
        work_log_id: workLogIdNum,
        initial_item_id: item.id,
        recognition_id: item.recognition_id,
        type: item.item_type,
        source: item.source,
        recipe_line_id: item.recipe_line_id,
        quantity: item.quantity || 1,
        bottle_orientation: item.bottle_orientation,
      }))

      const { data: insertedItems, error: insertItemsError } = await supabase
        .from('work_items')
        .insert(workItemsToInsert)
        .select()

      if (insertItemsError) {
        console.error('[validation/reset] Error inserting work_items:', insertItemsError)
        return apiError('Failed to create work items', 500, ApiErrorCode.INTERNAL_ERROR)
      }

      // 4. Скопировать initial_annotations в work_annotations
      // Сначала загрузим image IDs для этого recognition
      const { data: imagesData, error: imagesError } = await supabase
        .from('images')
        .select('id')
        .eq('recognition_id', recognitionId)
      
      if (imagesError) {
        console.error('[validation/reset] Error loading images:', imagesError)
        return apiError('Failed to load images', 500, ApiErrorCode.INTERNAL_ERROR)
      }

      const imageIds = imagesData?.map(img => img.id) || []
      
      // Теперь загружаем initial_annotations для этих изображений
      const { data: initialAnnotations, error: initialAnnotationsError } = await supabase
        .from('initial_annotations')
        .select('*')
        .in('image_id', imageIds.length > 0 ? imageIds : [0])

      if (initialAnnotationsError) {
        console.error('[validation/reset] Error loading initial annotations:', initialAnnotationsError)
        return apiError('Failed to load initial annotations', 500, ApiErrorCode.INTERNAL_ERROR)
      }

      // Создаем mapping: initial_item_id -> work_item_id
      const itemMapping = new Map<number, number>()
      insertedItems?.forEach(workItem => {
        if (workItem.initial_item_id) {
          itemMapping.set(workItem.initial_item_id, workItem.id)
        }
      })

      // Вставляем work_annotations
      if (initialAnnotations && initialAnnotations.length > 0) {
        const workAnnotationsToInsert = initialAnnotations
          .filter(ann => ann.initial_tray_item_id && itemMapping.has(ann.initial_tray_item_id))
          .map(ann => ({
            work_log_id: workLogIdNum,
            initial_annotation_id: ann.id,
            image_id: ann.image_id,
            work_item_id: itemMapping.get(ann.initial_tray_item_id!)!,
            bbox: ann.bbox,
            is_occluded: ann.is_occluded,
            occlusion_metadata: ann.occlusion_metadata,
          }))

        if (workAnnotationsToInsert.length > 0) {
          const { error: insertAnnotationsError } = await supabase
            .from('work_annotations')
            .insert(workAnnotationsToInsert)

          if (insertAnnotationsError) {
            console.error('[validation/reset] Error inserting work_annotations:', insertAnnotationsError)
            return apiError('Failed to create work annotations', 500, ApiErrorCode.INTERNAL_ERROR)
          }
        }
      }
    }

    // 5. Загрузить обновленные данные
    const { data: items } = await supabase
      .from('work_items')
      .select('*')
      .eq('work_log_id', workLogIdNum)
      .eq('is_deleted', false)

    const { data: annotations } = await supabase
      .from('work_annotations')
      .select('*')
      .eq('work_log_id', workLogIdNum)
      .eq('is_deleted', false)

    console.log(`[validation/reset] Reset work_log ${workLogIdNum}: ${items?.length || 0} items, ${annotations?.length || 0} annotations`)

    return apiSuccess({
      items: items || [],
      annotations: annotations || [],
    })
  } catch (error) {
    console.error('[validation/reset] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

