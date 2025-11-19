import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

interface AcquireRecognitionResult {
  work_log_id: number
  recognition_id: number
  validation_steps: unknown
  current_step_index: number
}

/**
 * POST /api/validation/finish-step
 * 
 * Универсальное API для завершения этапа валидации.
 * Принимает: work_log_id, mark_as ('completed' | 'skipped')
 * Возвращает: has_more_steps, next_step (если есть), или next_task (если нет)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { work_log_id, mark_as } = body

    if (!work_log_id || !mark_as || !['completed', 'skipped'].includes(mark_as)) {
      return apiError('Invalid parameters', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // 1. Загрузить work_log
    const { data: workLog, error: workLogError } = await supabase
      .from('validation_work_log')
      .select('*')
      .eq('id', work_log_id)
      .single()

    if (workLogError || !workLog) {
      return apiError('Work log not found', 404, ApiErrorCode.NOT_FOUND)
    }

    if (workLog.assigned_to !== user.id) {
      return apiError('Access denied', 403, ApiErrorCode.FORBIDDEN)
    }

    // 2. Пометить текущий этап
    const steps = workLog.validation_steps as any[] || []
    const currentIndex = workLog.current_step_index ?? 0
    
    if (steps[currentIndex]) {
      steps[currentIndex].status = mark_as
    }

    // 3. Есть ли следующий этап?
    const nextIndex = currentIndex + 1
    const hasMoreSteps = nextIndex < steps.length

    if (hasMoreSteps) {
      // Есть следующий этап - переключаемся
      steps[nextIndex].status = 'in_progress'
      
      await supabase
        .from('validation_work_log')
        .update({
          validation_steps: steps,
          current_step_index: nextIndex,
          validation_type: steps[nextIndex].type,
          updated_at: new Date().toISOString()
        })
        .eq('id', work_log_id)

      console.log(`[finish-step] Step ${currentIndex} marked as ${mark_as}, moved to step ${nextIndex}`)

      return apiSuccess({
        has_more_steps: true,
        current_step_index: nextIndex,
        current_step: steps[nextIndex]
      })
    } else {
      // Это был последний этап - завершаем work_log
      await supabase
        .from('validation_work_log')
        .update({
          validation_steps: steps,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', work_log_id)

      console.log(`[finish-step] Last step marked as ${mark_as}, work_log completed`)

      // Берем следующий recognition
      const { data: nextTask } = await supabase
        .rpc('acquire_recognition_with_steps', { p_user_id: user.id })
        .maybeSingle<AcquireRecognitionResult>()

      if (nextTask) {
        console.log(`[finish-step] Next task acquired: work_log=${nextTask.work_log_id}`)
        return apiSuccess({
          has_more_steps: false,
          next_work_log_id: nextTask.work_log_id
        })
      } else {
        console.log(`[finish-step] No more tasks available`)
        return apiSuccess({
          has_more_steps: false,
          next_work_log_id: null
        })
      }
    }
  } catch (error) {
    console.error('[finish-step] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

