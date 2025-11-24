import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { ValidationType } from '@/types/domain'

/**
 * GET /api/validation/stats
 * 
 * Получить статистику по validation types
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Получить активные validation types
    const { data: priorities } = await supabase
      .from('validation_priority_config')
      .select('validation_type')
      .eq('is_active', true)

    const validationTypes = priorities?.map((p) => p.validation_type) || []

    // Получить общее количество recognitions
    const { count: totalRecognitions } = await supabase
      .from('recognitions')
      .select('*', { count: 'exact', head: true })

    // Получить все completed и abandoned work_logs (включая validation_steps для multi-step)
    // Abandoned work_logs могут содержать completed шаги, которые нужно учитывать
    const { data: completedWorkLogs } = await supabase
      .from('validation_work_log')
      .select('recognition_id, validation_type, validation_steps')
      .in('status', ['completed', 'abandoned'])
      .limit(10000)

    // Получить все in_progress work_logs (updated in last 30 minutes)
    const { data: inProgressWorkLogs } = await supabase
      .from('validation_work_log')
      .select('recognition_id, validation_type, validation_steps')
      .eq('status', 'in_progress')
      .gte('updated_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .limit(10000)

    const stats = []

    for (const validationType of validationTypes) {
      // Подсчет completed для данного типа
      const completedRecognitionIds = new Set<number>()
      
      for (const workLog of completedWorkLogs || []) {
        // Multi-step: проверяем validation_steps
        if (workLog.validation_steps && Array.isArray(workLog.validation_steps)) {
          const hasCompletedStep = workLog.validation_steps.some(
            (step: any) => step.type === validationType && step.status === 'completed'
          )
          if (hasCompletedStep) {
            completedRecognitionIds.add(workLog.recognition_id)
          }
        } else {
          // Legacy: используем validation_type
          if (workLog.validation_type === validationType) {
            completedRecognitionIds.add(workLog.recognition_id)
          }
        }
      }

      // Подсчет in_progress для данного типа (только ТЕКУЩИЙ активный step!)
      const inProgressRecognitionIds = new Set<number>()
      
      for (const workLog of inProgressWorkLogs || []) {
        // Multi-step: проверяем ТОЛЬКО текущий активный step (status = in_progress)
        if (workLog.validation_steps && Array.isArray(workLog.validation_steps)) {
          const currentStep = workLog.validation_steps.find(
            (step: any) => step.status === 'in_progress'
          )
          if (currentStep && currentStep.type === validationType) {
            inProgressRecognitionIds.add(workLog.recognition_id)
          }
        } else {
          // Legacy: используем validation_type
          if (workLog.validation_type === validationType) {
            inProgressRecognitionIds.add(workLog.recognition_id)
          }
        }
      }

      stats.push({
        validation_type: validationType as ValidationType,
        total: totalRecognitions || 0,
        completed: completedRecognitionIds.size,
        in_progress: inProgressRecognitionIds.size,
      })
    }

    return apiSuccess({ stats })
  } catch (error) {
    console.error('[validation/stats] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

