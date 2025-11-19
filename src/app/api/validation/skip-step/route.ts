import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { SkipStepRequest, SkipStepResponse } from '@/types/domain'

/**
 * POST /api/validation/skip-step
 * 
 * Пропустить текущий step валидации (помечает как skipped, не completed)
 * - Помечает текущий step как skipped
 * - Переключает current_step_index
 * - Возвращает информацию о новом step
 */
export async function POST(request: Request) {
  try {
    const body: SkipStepRequest = await request.json()
    const { work_log_id } = body

    if (!work_log_id) {
      return apiError('Missing work_log_id', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Проверить доступ
    const { data: workLog } = await supabase
      .from('validation_work_log')
      .select('assigned_to, status')
      .eq('id', work_log_id)
      .single()

    if (!workLog) {
      return apiError('Work log not found', 404, ApiErrorCode.NOT_FOUND)
    }

    if (workLog.assigned_to !== user.id) {
      return apiError('Access denied', 403, ApiErrorCode.FORBIDDEN)
    }

    if (workLog.status !== 'in_progress') {
      return apiError('Work log is not in progress', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    // Пропустить step через БД функцию
    const { data: result, error: skipError } = await supabase
      .rpc('skip_current_step', { p_work_log_id: work_log_id })
      .single()

    if (skipError || !result) {
      console.error('[skip-step] Error skipping step:', skipError)
      return apiError('Failed to skip step', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    const { success, new_step_index, current_step } = result

    if (!success) {
      return apiError('Could not skip step', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const response: SkipStepResponse = {
      success: true,
      new_step_index,
      current_step,
    }

    return apiSuccess(response)
  } catch (error) {
    console.error('[skip-step] Unexpected error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

