import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { CompleteValidationRequest } from '@/types/domain'

/**
 * POST /api/validation/complete
 * 
 * Завершить текущий этап валидации
 * Если это последний этап - удаляет work_log (recognition становится свободным)
 * Возвращает информацию о том, завершен ли весь recognition
 */
export async function POST(request: Request) {
  try {
    const body: CompleteValidationRequest = await request.json()
    const { work_log_id, step_index } = body

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

    // 2. Пометить текущий шаг как completed
    if (workLog.validation_steps) {
      // Если передан step_index - используем его, иначе берем current_step_index
      const targetStepIndex = step_index !== undefined ? step_index : (workLog.current_step_index ?? 0)
      const steps = workLog.validation_steps as any[]
      
      if (steps[targetStepIndex] && steps[targetStepIndex].status !== 'completed') {
        steps[targetStepIndex].status = 'completed'
        
        await supabase
          .from('validation_work_log')
          .update({ 
            validation_steps: steps,
            updated_at: new Date().toISOString()
          })
          .eq('id', work_log_id)
      }
      
      // 3. Проверить что ВСЕ шаги completed/skipped
      const allDone = steps.every(s => s.status === 'completed' || s.status === 'skipped')

      if (allDone) {
        // Все этапы завершены - помечаем work_log как completed (НЕ удаляем!)
        await supabase
          .from('validation_work_log')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', work_log_id)

        console.log(`[validation/complete] Work log ${work_log_id} marked as completed - all steps done`)

        return apiSuccess({ 
          success: true,
          all_completed: true,
          recognition_id: workLog.recognition_id
        })
      } else {
        // Еще есть незавершенные этапы
        console.log(`[validation/complete] Step ${targetStepIndex} completed, more steps remaining`)

        return apiSuccess({ 
          success: true,
          all_completed: false
        })
      }
    }

    // Legacy single-step validation - тоже помечаем completed
    await supabase
      .from('validation_work_log')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', work_log_id)

    return apiSuccess({ 
      success: true,
      all_completed: true,
      recognition_id: workLog.recognition_id
    })
  } catch (error) {
    console.error('[validation/complete] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

