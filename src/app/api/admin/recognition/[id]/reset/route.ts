import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * POST /api/admin/recognition/[id]/reset
 * 
 * Сбросить recognition для повторного распознавания:
 * - Удаляет все validation_work_log для recognition
 * - Удаляет все work_items и work_annotations (каскадно через FK)
 * - initial_tray_items и initial_annotations остаются нетронутыми
 * - Recognition возвращается в пул доступных задач
 * 
 * Права: админ или владелец всех валидаций этого recognition
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const recognitionId = parseInt(id, 10)

    if (isNaN(recognitionId)) {
      return apiError('Invalid recognition ID', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    console.log(`[recognition/reset] User ${user.id} requesting reset for recognition ${recognitionId}`)

    // Проверить роль пользователя
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.role === 'admin'

    // Получить все work_logs для этого recognition
    const { data: workLogs, error: workLogsError } = await supabase
      .from('validation_work_log')
      .select('id, assigned_to, status')
      .eq('recognition_id', recognitionId)

    if (workLogsError) {
      console.error('[recognition/reset] Error fetching work logs:', workLogsError)
      return apiError('Failed to fetch work logs', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    if (!workLogs || workLogs.length === 0) {
      return apiError('No validations found for this recognition', 404, ApiErrorCode.NOT_FOUND)
    }

    // Проверка прав:
    // - Админ может сбросить любой recognition
    // - Обычный пользователь может сбросить только свои валидации (если ВСЕ работы выполнены им)
    if (!isAdmin) {
      const allOwnedByUser = workLogs.every(log => log.assigned_to === user.id)
      
      if (!allOwnedByUser) {
        return apiError(
          'Access denied: you can only reset recognitions where all validations were done by you',
          403,
          ApiErrorCode.FORBIDDEN
        )
      }
    }

    console.log(`[recognition/reset] Deleting ${workLogs.length} work logs for recognition ${recognitionId}`)

    // Удалить все work_items (каскадно удалятся work_annotations через FK)
    const { error: workItemsError } = await supabase
      .from('work_items')
      .delete()
      .in('work_log_id', workLogs.map(log => log.id))

    if (workItemsError) {
      console.error('[recognition/reset] Error deleting work_items:', workItemsError)
      return apiError('Failed to delete work items', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    // Удалить все validation_work_log
    const { error: workLogsDeleteError } = await supabase
      .from('validation_work_log')
      .delete()
      .eq('recognition_id', recognitionId)

    if (workLogsDeleteError) {
      console.error('[recognition/reset] Error deleting work logs:', workLogsDeleteError)
      return apiError('Failed to delete work logs', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    console.log(`[recognition/reset] ✓ Successfully reset recognition ${recognitionId}`)
    console.log(`[recognition/reset]   - Deleted work_logs: ${workLogs.length}`)
    console.log(`[recognition/reset]   - initial_tray_items preserved (version 0 data intact)`)
    console.log(`[recognition/reset]   - Recognition is now available for validation`)

    return apiSuccess({
      success: true,
      recognition_id: recognitionId,
      deleted_work_logs: workLogs.length,
      message: 'Recognition успешно отправлен на повторное распознавание',
    })
  } catch (error) {
    console.error('[recognition/reset] Unexpected error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}



