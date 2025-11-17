import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { AbandonValidationRequest } from '@/types/domain'

/**
 * POST /api/validation/abandon
 * 
 * Отменить сессию валидации (вернуть в пул для других пользователей)
 */
export async function POST(request: Request) {
  try {
    const body: AbandonValidationRequest = await request.json()
    const { work_log_id, reason } = body

    if (!work_log_id) {
      return apiError('Missing work_log_id', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // 1. Проверить work log
    const { data: workLog, error: workLogError } = await supabase
      .from('validation_work_log')
      .select('*')
      .eq('id', work_log_id)
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

    if (workLog.status !== 'in_progress') {
      return apiError('Work log is not in progress', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    // 2. Удалить все work_items и work_annotations для этого work_log
    await supabase
      .from('work_items')
      .delete()
      .eq('work_log_id', work_log_id)

    await supabase
      .from('work_annotations')
      .delete()
      .eq('work_log_id', work_log_id)

    // 3. Удалить work log (возвращаем задачу в пул)
    const { error: deleteError } = await supabase
      .from('validation_work_log')
      .delete()
      .eq('id', work_log_id)

    if (deleteError) {
      console.error('[validation/abandon] Delete error:', deleteError)
      return apiError('Failed to abandon validation', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('[validation/abandon] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

