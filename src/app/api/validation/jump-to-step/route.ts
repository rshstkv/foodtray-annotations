import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { JumpToStepRequest, JumpToStepResponse } from '@/types/domain'

/**
 * POST /api/validation/jump-to-step
 * 
 * Перейти на конкретный step валидации (только назад)
 * - Проверяет что переход только назад (target < current)
 * - Проверяет что целевой step имеет статус completed или skipped
 * - Обновляет current_step_index
 * - Целевой step помечается как in_progress
 */
export async function POST(request: Request) {
  try {
    const body: JumpToStepRequest = await request.json()
    const { work_log_id, target_step_index } = body

    if (!work_log_id || target_step_index === undefined) {
      return apiError('Missing work_log_id or target_step_index', 400, ApiErrorCode.VALIDATION_ERROR)
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

    // Перейти на step через БД функцию
    const { data: result, error: jumpError } = await supabase
      .rpc('jump_to_step', { 
        p_work_log_id: work_log_id,
        p_target_step_index: target_step_index
      })
      .single()

    if (jumpError || !result) {
      console.error('[jump-to-step] Error jumping to step:', jumpError)
      return apiError('Failed to jump to step', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    const { success, new_step_index, current_step, error_message } = result

    if (!success) {
      return apiError(error_message || 'Could not jump to step', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const response: JumpToStepResponse = {
      success: true,
      new_step_index,
      current_step,
    }

    return apiSuccess(response)
  } catch (error) {
    console.error('[jump-to-step] Unexpected error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

