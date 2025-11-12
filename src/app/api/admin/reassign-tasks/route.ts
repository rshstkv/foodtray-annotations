import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

interface ReassignTasksRequest {
  from_user_id: string
  to_user_id: string
  task_count: number | 'all'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return apiError('Forbidden', 403)
    }
    
    const body: ReassignTasksRequest = await request.json()
    const { from_user_id, to_user_id, task_count } = body

    if (!from_user_id || !to_user_id) {
      return apiError('Missing user IDs', 400)
    }

    if (from_user_id === to_user_id) {
      return apiError('Cannot reassign to the same user', 400)
    }

    // Get tasks to reassign
    let query = supabase
      .from('tasks')
      .select('id')
      .eq('assigned_to', from_user_id)
      .in('status', ['pending', 'in_progress'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })

    if (task_count !== 'all') {
      query = query.limit(task_count as number)
    }

    const { data: tasksToReassign, error: tasksError } = await query

    if (tasksError) {
      return apiError(tasksError.message, 500)
    }

    if (!tasksToReassign || tasksToReassign.length === 0) {
      return apiError('No tasks to reassign', 404)
    }

    // Update tasks
    const taskIds = tasksToReassign.map(t => t.id)
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        assigned_to: to_user_id,
        updated_at: new Date().toISOString()
      })
      .in('id', taskIds)

    if (updateError) {
      return apiError(updateError.message, 500)
    }

    return apiSuccess({
      reassigned_count: tasksToReassign.length,
      from_user_id,
      to_user_id
    })
  } catch (error) {
    console.error('Error reassigning tasks:', error)
    return apiError('Internal server error', 500)
  }
}

