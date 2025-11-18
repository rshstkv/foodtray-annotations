import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { NextStepRequest, NextStepResponse } from '@/types/domain'

/**
 * POST /api/validation/next-step
 * 
 * Переключиться на следующий step валидации
 * - Помечает текущий step как completed
 * - Переключает current_step_index
 * - Возвращает информацию о новом step
 */
export async function POST(request: Request) {
  try {
    const body: NextStepRequest = await request.json()
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

    // Переключить step через БД функцию
    const { data: result, error: moveError } = await supabase
      .rpc('move_to_next_step', { p_work_log_id: work_log_id })
      .single()

    if (moveError || !result) {
      console.error('[next-step] Error moving to next step:', moveError)
      return apiError('Failed to move to next step', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    const { success, new_step_index, current_step } = result as { success: boolean; new_step_index: number; current_step: any }

    if (!success) {
      return apiError('No more steps available', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    // Проверить завершены ли все steps
    const { data: allCompleted } = await supabase
      .rpc('all_steps_completed', { p_work_log_id: work_log_id })
      .single()

    const response: NextStepResponse = {
      success: true,
      new_step_index,
      current_step,
      all_completed: (allCompleted as boolean) || false
    }

    console.log(`[next-step] Moved to step ${new_step_index}, type=${current_step?.type}, all_completed=${allCompleted}`)

    return apiSuccess(response)
  } catch (error) {
    console.error('[next-step] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}




