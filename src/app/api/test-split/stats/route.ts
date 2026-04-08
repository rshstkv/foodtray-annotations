import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * GET /api/test-split/stats
 * Statistics for test split validation: total / completed / in_progress
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    const [
      { count: totalCount },
      { count: completedCount },
      { count: inProgressCount },
      { count: flaggedCount },
      { data: reviewers },
    ] = await Promise.all([
      supabase.from('test_split_recognitions').select('*', { count: 'exact', head: true }),
      supabase.from('test_split_work_log').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('test_split_work_log').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      supabase.from('test_split_work_items').select('*', { count: 'exact', head: true }).eq('flagged', true),
      supabase.from('test_split_work_log')
        .select('assigned_to, status, completed_at')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false }),
    ])

    const reviewerMap = new Map<string, { count: number; last_completed: string | null }>()
    for (const wl of reviewers || []) {
      const uid = wl.assigned_to
      if (!uid) continue
      const entry = reviewerMap.get(uid)
      if (entry) {
        entry.count++
      } else {
        reviewerMap.set(uid, { count: 1, last_completed: wl.completed_at })
      }
    }

    let reviewerList: { user_id: string; email?: string; count: number; last_completed: string | null }[] = []
    if (reviewerMap.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', Array.from(reviewerMap.keys()))

      reviewerList = Array.from(reviewerMap.entries()).map(([uid, stats]) => {
        const profile = profiles?.find(p => p.id === uid)
        return {
          user_id: uid,
          email: profile?.email || profile?.full_name || uid.slice(0, 8),
          count: stats.count,
          last_completed: stats.last_completed,
        }
      }).sort((a, b) => b.count - a.count)
    }

    return apiSuccess({
      total: totalCount || 0,
      completed: completedCount || 0,
      in_progress: inProgressCount || 0,
      remaining: (totalCount || 0) - (completedCount || 0) - (inProgressCount || 0),
      flagged_items: flaggedCount || 0,
      reviewers: reviewerList,
    })
  } catch (error) {
    console.error('[test-split/stats] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}
