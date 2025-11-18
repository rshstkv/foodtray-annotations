import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { CompleteValidationRequest } from '@/types/domain'

/**
 * POST /api/validation/complete
 * 
 * Завершить сессию валидации (весь work_log со всеми steps)
 * Для multi-step: завершает текущий step и весь work_log если это последний step
 */
export async function POST(request: Request) {
  try {
    const body: CompleteValidationRequest = await request.json()
    const { work_log_id } = body

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

    // 2. Если multi-step - проверить что все steps завершены
    if (workLog.validation_steps) {
      const { data: allCompleted } = await supabase
        .rpc('all_steps_completed', { p_work_log_id: work_log_id })
        .single()

      if (!allCompleted) {
        return apiError('Not all validation steps are completed', 400, ApiErrorCode.VALIDATION_ERROR)
      }
    }

    // 3. Обновить work log
    const { error: updateError } = await supabase
      .from('validation_work_log')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', work_log_id)

    if (updateError) {
      console.error('[validation/complete] Update error:', updateError)
      return apiError('Failed to complete validation', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    console.log(`[validation/complete] Work log ${work_log_id} completed`)

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('[validation/complete] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

