import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabase } from '@/lib/supabase'

/**
 * Helper: проверка роли admin
 */
async function checkAdminRole(supabase: any) {
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return { authorized: false, error: 'Unauthorized', status: 401 }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    return { authorized: false, error: 'Forbidden: admin role required', status: 403 }
  }

  return { authorized: true, user }
}

/**
 * POST /api/admin/assign-tasks
 * 
 * Назначить задачи пользователю (только для admin)
 * Body: { mode: 'quick' | 'edit', count: number, userId: string, taskQueue?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseServer = await createClient()
    
    // Проверка роли admin
    const authCheck = await checkAdminRole(supabaseServer)
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
    }

    const { mode, count, userId, taskQueue } = await request.json()

    if (!mode || !count || !userId) {
      return NextResponse.json(
        { error: 'mode, count, and userId are required' },
        { status: 400 }
      )
    }

    if (!['quick', 'edit'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be "quick" or "edit"' },
        { status: 400 }
      )
    }

    // Определяем специализированные очереди
    const specializedQueues = ['bottle_orientation', 'other_items', 'overlap_marking', 'non_food_objects']
    
    let tasks: any[] = []
    let fetchError: any = null
    
    if (taskQueue && specializedQueues.includes(taskQueue)) {
      // Для специализированных очередей ищем в recognition_task_progress
      const { data, error } = await supabase
        .from('recognition_task_progress')
        .select('id, recognition_id')
        .eq('task_queue', taskQueue)
        .eq('workflow_state', 'pending')
        .is('assigned_to', null)
        .limit(count)
      
      tasks = data || []
      fetchError = error
      
      if (!fetchError && tasks.length > 0) {
        // Назначаем задачи пользователю в recognition_task_progress
        const taskIds = tasks.map(t => t.id)
        const { error: assignError } = await supabase
          .from('recognition_task_progress')
          .update({ assigned_to: userId })
          .in('id', taskIds)

        if (assignError) {
          console.error('[Admin] Error assigning specialized tasks:', assignError.message)
          return NextResponse.json({ error: assignError.message }, { status: 500 })
        }

        console.log(`[Admin] Assigned ${tasks.length} ${taskQueue} tasks to user ${userId}`)

        return NextResponse.json({ 
          assigned: tasks.length,
          task_queue: taskQueue,
          userId
        })
      }
    } else {
      // Для dish_validation используем recognitions
      let query = supabase
        .from('recognitions')
        .select('recognition_id')
        .eq('validation_mode', mode)
        .eq('workflow_state', 'pending')
        .is('assigned_to', null)
      
      // Фильтр по task_queue (если указан)
      if (taskQueue) {
        query = query.eq('task_queue', taskQueue)
      }
      
      query = query.limit(count)
      
      const { data, error } = await query
      tasks = data || []
      fetchError = error

      if (!fetchError && tasks.length > 0) {
        // Назначить задачи пользователю
        const recognitionIds = tasks.map(t => t.recognition_id)
        const { error: assignError } = await supabase
          .from('recognitions')
          .update({ assigned_to: userId })
          .in('recognition_id', recognitionIds)

        if (assignError) {
          console.error('[Admin] Error assigning tasks:', assignError.message)
          return NextResponse.json({ error: assignError.message }, { status: 500 })
        }

        console.log(`[Admin] Assigned ${tasks.length} ${mode} tasks to user ${userId}`)

        return NextResponse.json({ 
          assigned: tasks.length,
          mode,
          userId
        })
      }
    }

    if (fetchError) {
      console.error('[Admin] Error fetching tasks:', fetchError.message)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'No available tasks to assign',
      assigned: 0
    })
  } catch (error) {
    console.error('[Admin] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

