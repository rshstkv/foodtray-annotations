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

    const stats = []

    for (const validationType of validationTypes) {
      // Completed
      const { data: completed } = await supabase
        .from('validation_work_log')
        .select('recognition_id')
        .eq('validation_type', validationType)
        .eq('status', 'completed')

      const completedIds = completed?.map((r) => r.recognition_id) || []

      // In progress (last 30 minutes)
      const { data: inProgress } = await supabase
        .from('validation_work_log')
        .select('recognition_id')
        .eq('validation_type', validationType)
        .eq('status', 'in_progress')
        .gte('started_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())

      const inProgressIds = inProgress?.map((r) => r.recognition_id) || []

      stats.push({
        validation_type: validationType as ValidationType,
        total: totalRecognitions || 0,
        completed: completedIds.length,
        in_progress: inProgressIds.length,
      })
    }

    return apiSuccess({ stats })
  } catch (error) {
    console.error('[validation/stats] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

