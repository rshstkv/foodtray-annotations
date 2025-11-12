import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

interface UserAssignments {
  user_id: string
  user_email: string
  task_count: number
  by_scope: Record<string, number>
}

export async function GET(request: NextRequest) {
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

    // Get all assigned tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, assigned_to, task_scope')
      .not('assigned_to', 'is', null)
      .in('status', ['pending', 'in_progress'])

    if (tasksError) {
      return apiError(tasksError.message, 500)
    }

    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, email')

    if (usersError) {
      return apiError(usersError.message, 500)
    }

    // Create user map
    const userMap = new Map(users?.map(u => [u.id, u.email]) || [])

    // Group by user
    const assignmentMap = new Map<string, UserAssignments>()

    for (const task of tasks || []) {
      const userId = task.assigned_to
      if (!userId) continue

      if (!assignmentMap.has(userId)) {
        assignmentMap.set(userId, {
          user_id: userId,
          user_email: userMap.get(userId) || 'Unknown',
          task_count: 0,
          by_scope: {}
        })
      }

      const assignment = assignmentMap.get(userId)!
      assignment.task_count++

      // Group by scope
      const steps = task.task_scope?.steps || []
      const stepIds = steps.map((s: any) => s.id).sort()
      const scopeKey = stepIds.join('+')

      if (!assignment.by_scope[scopeKey]) {
        assignment.by_scope[scopeKey] = 0
      }
      assignment.by_scope[scopeKey]++
    }

    const assignments = Array.from(assignmentMap.values())
      .sort((a, b) => b.task_count - a.task_count)

    return apiSuccess({ assignments })
  } catch (error) {
    console.error('Error fetching user assignments:', error)
    return apiError('Internal server error', 500)
  }
}

