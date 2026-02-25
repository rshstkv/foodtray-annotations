import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * GET /api/test-split/current
 * Get current in_progress test split task for the user
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    const { data: workLog } = await supabase
      .from('test_split_work_log')
      .select('*')
      .eq('assigned_to', user.id)
      .eq('status', 'in_progress')
      .maybeSingle()

    if (!workLog) {
      return apiSuccess(null)
    }

    return apiSuccess({
      work_log_id: workLog.id,
      recognition_id: workLog.recognition_id,
      started_at: workLog.started_at,
    })
  } catch (error) {
    console.error('[test-split/current] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}
