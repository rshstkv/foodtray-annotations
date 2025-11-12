import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

interface ScopeStats {
  scope_key: string
  scope_names: string[]
  total: number
  assigned: number
  unassigned: number
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

    // Get all tasks with their scopes
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, assigned_to, task_scope')

    if (tasksError) {
      return apiError(tasksError.message, 500)
    }

    // Group by scope
    const scopeMap = new Map<string, ScopeStats>()

    for (const task of tasks || []) {
      const steps = task.task_scope?.steps || []
      const stepIds = steps.map((s: any) => s.id).sort()
      const stepNames = steps.map((s: any) => s.name)
      const scopeKey = stepIds.join('+')

      if (!scopeMap.has(scopeKey)) {
        scopeMap.set(scopeKey, {
          scope_key: scopeKey,
          scope_names: stepNames,
          total: 0,
          assigned: 0,
          unassigned: 0
        })
      }

      const stat = scopeMap.get(scopeKey)!
      stat.total++
      if (task.assigned_to) {
        stat.assigned++
      } else {
        stat.unassigned++
      }
    }

    const scope_stats = Array.from(scopeMap.values())
      .sort((a, b) => b.total - a.total)

    return apiSuccess({ scope_stats })
  } catch (error) {
    console.error('Error fetching scope stats:', error)
    return apiError('Internal server error', 500)
  }
}

