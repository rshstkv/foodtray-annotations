import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * POST /api/test-split/abandon
 * Abandon test split validation session and optionally get next task
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { work_log_id } = body

    if (!work_log_id) {
      return apiError('Missing work_log_id', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    const { data: workLog } = await supabase
      .from('test_split_work_log')
      .select('*')
      .eq('id', work_log_id)
      .single()

    if (!workLog) {
      return apiError('Work log not found', 404, ApiErrorCode.NOT_FOUND)
    }

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

    // Delete work data
    await supabase.from('test_split_work_annotations').delete().eq('work_log_id', work_log_id)
    await supabase.from('test_split_work_items').delete().eq('work_log_id', work_log_id)

    // Mark as abandoned
    await supabase
      .from('test_split_work_log')
      .update({
        status: 'abandoned',
        completed_at: new Date().toISOString(),
      })
      .eq('id', work_log_id)

    console.log(`[test-split/abandon] Work log ${work_log_id} abandoned`)

    return apiSuccess({ next_task: undefined })
  } catch (error) {
    console.error('[test-split/abandon] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}
