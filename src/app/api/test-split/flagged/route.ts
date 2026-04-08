import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * GET /api/test-split/flagged
 * List recognitions that have flagged work items
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    const { data: flaggedItems, error } = await supabase
      .from('test_split_work_items')
      .select(`
        id,
        name,
        flag_comment,
        recognition_id,
        work_log_id,
        test_split_work_log!inner (
          recognition_id,
          assigned_to,
          status,
          completed_at
        )
      `)
      .eq('flagged', true)
      .eq('is_deleted', false)
      .order('recognition_id')

    if (error) {
      console.error('[test-split/flagged] Error:', error)
      return apiError('Failed to fetch flagged items', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    const grouped = new Map<number, {
      recognition_id: number
      work_log_id: number
      status: string
      items: { id: number; name: string | null; comment: string | null }[]
    }>()

    for (const item of flaggedItems || []) {
      const recId = item.recognition_id
      if (!grouped.has(recId)) {
        const wl = (item as any).test_split_work_log
        grouped.set(recId, {
          recognition_id: recId,
          work_log_id: item.work_log_id,
          status: wl?.status || 'unknown',
          items: [],
        })
      }
      grouped.get(recId)!.items.push({
        id: item.id,
        name: item.name,
        comment: item.flag_comment,
      })
    }

    return apiSuccess({
      flagged: Array.from(grouped.values()),
      total: grouped.size,
    })
  } catch (error) {
    console.error('[test-split/flagged] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}
