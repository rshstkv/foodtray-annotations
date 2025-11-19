import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * GET /api/validation/current
 * 
 * Получить текущую задачу пользователя (если есть)
 * Возвращает work_log если пользователь уже работает над задачей
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Найти текущий work_log пользователя
    const { data: workLog } = await supabase
      .from('validation_work_log')
      .select('*')
      .eq('assigned_to', user.id)
      .maybeSingle()

    if (!workLog) {
      return apiSuccess(null)
    }

    // Загрузить recognition для показа ID
    const { data: recognition } = await supabase
      .from('recognitions')
      .select('id')
      .eq('id', workLog.recognition_id)
      .single()

    return apiSuccess({
      work_log_id: workLog.id,
      recognition_id: recognition?.id,
      validation_type: workLog.validation_type,
      validation_steps: workLog.validation_steps,
      current_step_index: workLog.current_step_index,
      started_at: workLog.started_at,
      updated_at: workLog.updated_at,
    })
  } catch (error) {
    console.error('[validation/current] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

