import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * POST /api/validation/[workLogId]/reset
 * 
 * Откатить к начальному состоянию:
 * Восстанавливаем все items и annotations к исходному состоянию (initial)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workLogId: string }> }
) {
  try {
    const { workLogId } = await params
    const workLogIdNum = parseInt(workLogId, 10)

    if (isNaN(workLogIdNum)) {
      return apiError('Invalid work log ID', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Загрузить work log
    const { data: workLog, error: workLogError } = await supabase
      .from('validation_work_log')
      .select('*')
      .eq('id', workLogIdNum)
      .single()

    if (workLogError || !workLog) {
      return apiError('Work log not found', 404, ApiErrorCode.NOT_FOUND)
    }

    // Проверка доступа
    if (workLog.assigned_to !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        return apiError('Access denied', 403, ApiErrorCode.FORBIDDEN)
      }
    }

    // Полностью удаляем все work_items и work_annotations для этого work_log
    await supabase
      .from('work_items')
      .delete()
      .eq('work_log_id', workLogIdNum)

    await supabase
      .from('work_annotations')
      .delete()
      .eq('work_log_id', workLogIdNum)

    // Пересоздаем work_items из initial_tray_items
    const { data: initialItems } = await supabase
      .from('initial_tray_items')
      .select('*')
      .eq('recognition_id', workLog.recognition_id)

    if (initialItems && initialItems.length > 0) {
      const workItemsToInsert = initialItems.map(item => ({
        work_log_id: workLogIdNum,
        initial_item_id: item.id,
        recognition_id: workLog.recognition_id,
        type: item.item_type,
        recipe_line_id: null, // initial items не имеют recipe_line_id напрямую
        quantity: 1,
        is_deleted: false,
      }))
      
      await supabase
        .from('work_items')
        .insert(workItemsToInsert)
    }

    // Пересоздаем work_annotations из initial_annotations
    // Сначала получаем соответствие initial_item_id -> work_item_id
    const { data: workItemsForMapping } = await supabase
      .from('work_items')
      .select('id, initial_item_id')
      .eq('work_log_id', workLogIdNum)

    const itemIdMap = new Map(
      (workItemsForMapping || []).map(wi => [wi.initial_item_id, wi.id])
    )

    const { data: initialAnnotations } = await supabase
      .from('initial_annotations')
      .select('*')
      .in('image_id', (
        await supabase
          .from('images')
          .select('id')
          .eq('recognition_id', workLog.recognition_id)
      ).data?.map(img => img.id) || [])

    if (initialAnnotations && initialAnnotations.length > 0) {
      const workAnnotationsToInsert = initialAnnotations
        .map(ann => {
          const workItemId = itemIdMap.get(ann.initial_tray_item_id)
          if (!workItemId) return null
          
          return {
            work_log_id: workLogIdNum,
            initial_annotation_id: ann.id,
            image_id: ann.image_id,
            work_item_id: workItemId,
            bbox: ann.bbox,
            is_deleted: false,
            is_occluded: ann.is_occluded,
            occlusion_metadata: null,
          }
        })
        .filter(Boolean)
      
      if (workAnnotationsToInsert.length > 0) {
        await supabase
          .from('work_annotations')
          .insert(workAnnotationsToInsert)
      }
    }

    // Загрузить обновленные данные для возврата
    const { data: workItems } = await supabase
      .from('work_items')
      .select('*')
      .eq('work_log_id', workLogIdNum)
      .eq('is_deleted', false)

    const { data: workAnnotations } = await supabase
      .from('work_annotations')
      .select('*')
      .eq('work_log_id', workLogIdNum)
      .eq('is_deleted', false)

    return apiSuccess({
      message: 'Reset to initial state',
      items: workItems || [],
      annotations: workAnnotations || [],
    })
  } catch (error) {
    console.error('Reset error:', error)
    return apiError(
      error instanceof Error ? error.message : 'Failed to reset',
      500,
      ApiErrorCode.INTERNAL_ERROR
    )
  }
}
