import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

/**
 * GET /api/detection/tasks/[taskId]
 * Get a single detection task by ID.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const { data: task, error } = await supabase
      .from('detection_tasks')
      .select('*')
      .eq('id', parseInt(taskId))
      .single()

    if (error || !task) {
      return apiError('Task not found', 404)
    }

    return apiSuccess(task)
  } catch (err) {
    console.error('[detection/tasks/[taskId]] Error:', err)
    return apiError('Internal server error', 500)
  }
}
