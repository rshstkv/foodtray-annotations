import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

interface TasksByScope {
  [scopeKey: string]: {
    scope_names: string[]
    count: number
  }
}

interface UserStats {
  user_id: string
  user_email: string
  role: string
  total_tasks: number
  by_scope: TasksByScope
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

    // Get all users (including admins)
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, email, role')
      .order('email')

    if (usersError) {
      return apiError(usersError.message, 500)
    }

    // Get all assigned tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, assigned_to, task_scope, status')
      .not('assigned_to', 'is', null)
      .in('status', ['pending', 'in_progress'])

    if (tasksError) {
      console.error('[user-stats] Error fetching tasks:', tasksError)
      return apiError(tasksError.message, 500)
    }

    console.log('[user-stats] Found tasks:', tasks?.length || 0)

    // Build stats
    const userStatsMap = new Map<string, UserStats>()

    // Initialize all users
    for (const user of users || []) {
      userStatsMap.set(user.id, {
        user_id: user.id,
        user_email: user.email,
        role: user.role,
        total_tasks: 0,
        by_scope: {}
      })
    }

    // Count tasks
    for (const task of tasks || []) {
      const userId = task.assigned_to
      if (!userId || !userStatsMap.has(userId)) continue

      const stats = userStatsMap.get(userId)!
      stats.total_tasks++

      // Group by scope
      const steps = task.task_scope?.steps || []
      const stepIds = steps.map((s: any) => s.id).sort()
      const stepNames = steps.map((s: any) => s.name)
      const scopeKey = stepIds.join('+')

      if (!stats.by_scope[scopeKey]) {
        stats.by_scope[scopeKey] = {
          scope_names: stepNames,
          count: 0
        }
      }
      stats.by_scope[scopeKey].count++
    }

    const user_stats = Array.from(userStatsMap.values())
      .sort((a, b) => b.total_tasks - a.total_tasks)

    return apiSuccess({ user_stats })
  } catch (error) {
    console.error('Error fetching user stats:', error)
    return apiError('Internal server error', 500)
  }
}

