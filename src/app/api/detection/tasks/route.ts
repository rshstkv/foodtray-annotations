import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

/**
 * GET /api/detection/tasks
 * List all detection tasks with summary stats.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const { data: tasks, error } = await supabase
      .from('detection_tasks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return apiError(error.message, 500)
    }

    if (!tasks || tasks.length === 0) {
      return apiSuccess([])
    }

    const taskIds = tasks.map(t => t.id)
    const { data: statusCounts } = await supabase
      .rpc('detection_tasks_stats_batch', undefined)
      .select('*')

    // Fallback: compute stats per task
    const statsMap: Record<number, { done: number; modified: number }> = {}

    if (statusCounts) {
      for (const row of statusCounts) {
        statsMap[row.task_id] = { done: row.done_count, modified: row.modified_count }
      }
    }

    // If RPC doesn't exist yet, compute manually
    if (!statusCounts) {
      for (const taskId of taskIds) {
        const { count: doneCount } = await supabase
          .from('detection_image_tasks')
          .select('*', { count: 'exact', head: true })
          .eq('task_id', taskId)
          .eq('status', 'done')

        const { count: modifiedCount } = await supabase
          .from('detection_image_tasks')
          .select('*', { count: 'exact', head: true })
          .eq('task_id', taskId)
          .eq('is_modified', true)

        statsMap[taskId] = {
          done: doneCount ?? 0,
          modified: modifiedCount ?? 0,
        }
      }
    }

    const result = tasks.map(t => ({
      ...t,
      done_count: statsMap[t.id]?.done ?? 0,
      modified_count: statsMap[t.id]?.modified ?? 0,
      percent_completed: t.images_count > 0
        ? Math.round(((statsMap[t.id]?.done ?? 0) / t.images_count) * 100)
        : 0,
    }))

    return apiSuccess(result)
  } catch (err) {
    console.error('[detection/tasks] Error:', err)
    return apiError('Internal server error', 500)
  }
}
