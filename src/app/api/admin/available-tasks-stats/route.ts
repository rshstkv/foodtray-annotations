import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

interface TasksByScope {
  [scopeKey: string]: {
    scope_names: string[]
    count: number
  }
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

    // Get unassigned tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, task_scope')
      .eq('status', 'pending')
      .is('assigned_to', null)

    if (tasksError) {
      return apiError(tasksError.message, 500)
    }

    // Build stats
    const by_scope: TasksByScope = {}
    let total_unassigned = 0

    for (const task of tasks || []) {
      total_unassigned++

      const steps = task.task_scope?.steps || []
      const stepIds = steps.map((s: any) => s.id).sort()
      const stepNames = steps.map((s: any) => s.name)
      const scopeKey = stepIds.join('+')

      if (!by_scope[scopeKey]) {
        by_scope[scopeKey] = {
          scope_names: stepNames,
          count: 0
        }
      }
      by_scope[scopeKey].count++
    }

    return apiSuccess({
      available: {
        total_unassigned,
        by_scope
      }
    })
  } catch (error) {
    console.error('Error fetching available tasks stats:', error)
    return apiError('Internal server error', 500)
  }
}

