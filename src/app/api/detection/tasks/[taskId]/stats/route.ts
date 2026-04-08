import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

/**
 * GET /api/detection/tasks/[taskId]/stats
 * Get statistics for a detection task.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params
    const id = parseInt(taskId)
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const [totalRes, doneRes, modifiedRes] = await Promise.all([
      supabase
        .from('detection_image_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', id),
      supabase
        .from('detection_image_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', id)
        .eq('status', 'done'),
      supabase
        .from('detection_image_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', id)
        .eq('is_modified', true),
    ])

    const total = totalRes.count ?? 0
    const done = doneRes.count ?? 0
    const modified = modifiedRes.count ?? 0

    const { data: userRows } = await supabase
      .from('detection_image_tasks')
      .select('reviewed_by')
      .eq('task_id', id)
      .not('reviewed_by', 'is', null)

    const userCounts: Record<string, number> = {}
    for (const row of userRows ?? []) {
      const uid = row.reviewed_by as string
      userCounts[uid] = (userCounts[uid] || 0) + 1
    }

    let perUser: Array<{ user_id: string; email: string | null; count: number }> = []
    const userIds = Object.keys(userCounts)
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds)

      const emailMap: Record<string, string> = {}
      for (const p of profiles ?? []) {
        emailMap[p.id] = p.email
      }

      perUser = userIds.map(uid => ({
        user_id: uid,
        email: emailMap[uid] || null,
        count: userCounts[uid],
      }))
    }

    return apiSuccess({
      total_images: total,
      done_images: done,
      percent_completed: total > 0 ? Math.round((done / total) * 100) : 0,
      modified_count: modified,
      per_user: perUser,
    })
  } catch (err) {
    console.error('[detection/stats] Error:', err)
    return apiError('Internal server error', 500)
  }
}
