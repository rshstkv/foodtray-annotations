import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

interface AssignTasksRequest {
  user_ids: string[]
  task_count: number
  priority: 'low' | 'medium' | 'high'
  scope: {
    steps: Array<{ id: string; name: string }>
  }
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
    
    const body: AssignTasksRequest = await request.json()
    const { user_ids, task_count, priority, scope } = body

    if (!user_ids || user_ids.length === 0) {
      return apiError('No users selected', 400)
    }

    // Get unassigned pending tasks
    const { data: availableTasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id')
      .eq('status', 'pending')
      .is('assigned_to', null)
      .limit(user_ids.length * task_count)

    if (tasksError) {
      return apiError(tasksError.message, 500)
    }

    if (!availableTasks || availableTasks.length === 0) {
      return apiError('No available tasks', 404)
    }

    // Distribute tasks evenly
    const assignments: Array<{ task_id: string; user_id: string }> = []
    let userIndex = 0

    for (const task of availableTasks) {
      const userId = user_ids[userIndex % user_ids.length]
      assignments.push({ task_id: task.id, user_id: userId })
      userIndex++
    }

    // Update tasks
    for (const assignment of assignments) {
      await supabase
      .from('tasks')
        .update({
          assigned_to: assignment.user_id,
          priority,
          task_scope: scope,
          updated_at: new Date().toISOString()
        })
        .eq('id', assignment.task_id)
    }

    return apiSuccess({
      assigned_count: assignments.length,
      assignments_per_user: assignments.reduce((acc, a) => {
        acc[a.user_id] = (acc[a.user_id] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    })
  } catch (error) {
    console.error('Error assigning tasks:', error)
    return apiError('Internal server error', 500)
  }
}
