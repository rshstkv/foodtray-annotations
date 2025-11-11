import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

/**
 * GET /api/admin/tasks-by-user
 * 
 * Возвращает детальную статистику по пользователям:
 * - Сколько задач каждого типа назначено каждому пользователю
 * - Сколько неназначенных задач доступно
 * 
 * Доступно только для админов
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseServer = await createClient()
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Проверка роли admin
    const { data: profile, error: profileError } = await supabaseServer
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      )
    }

    // Используем admin client для обхода RLS
    const adminClient = createAdminClient()

    // Получаем всех пользователей
    const { data: users, error: usersError } = await adminClient
      .from('profiles')
      .select('id, email, full_name, role')
      .in('role', ['annotator', 'admin'])
      .order('email')

    if (usersError) {
      console.error('Error fetching users:', usersError)
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    // Получаем все pending задачи с группировкой
    const { data: tasks, error: tasksError } = await adminClient
      .from('recognitions')
      .select('task_queue, validation_mode, assigned_to')
      .eq('workflow_state', 'pending')

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError)
      return NextResponse.json({ error: tasksError.message }, { status: 500 })
    }

    // Получаем completed задачи (последние 30 дней)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const { data: completedTasks, error: completedError } = await adminClient
      .from('recognitions')
      .select('completed_by, updated_at')
      .eq('workflow_state', 'completed')
      .gte('updated_at', thirtyDaysAgo.toISOString())

    if (completedError) {
      console.error('Error fetching completed tasks:', completedError)
    }

    // Подсчитываем задачи по пользователям
    const userStats = users?.map(user => {
      const userTasks = tasks?.filter(t => t.assigned_to === user.id) || []
      const userCompleted = completedTasks?.filter(t => t.completed_by === user.id).length || 0
      
      return {
        userId: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        tasks: {
          quick_validation: userTasks.filter(t => t.task_queue === 'dish_validation' && t.validation_mode === 'quick').length,
          edit_mode: userTasks.filter(t => t.task_queue === 'dish_validation' && t.validation_mode === 'edit').length,
          check_errors: userTasks.filter(t => t.task_queue === 'check_error').length,
          buzzer: userTasks.filter(t => t.task_queue === 'buzzer').length,
          other_items: userTasks.filter(t => t.task_queue === 'other_items').length,
          total: userTasks.length,
          completed: userCompleted,
        }
      }
    }) || []

    // Подсчитываем неназначенные задачи
    const unassignedTasks = tasks?.filter(t => !t.assigned_to) || []
    const unassigned = {
      quick_validation: unassignedTasks.filter(t => t.task_queue === 'dish_validation' && t.validation_mode === 'quick').length,
      edit_mode: unassignedTasks.filter(t => t.task_queue === 'dish_validation' && t.validation_mode === 'edit').length,
      check_errors: unassignedTasks.filter(t => t.task_queue === 'check_error').length,
      buzzer: unassignedTasks.filter(t => t.task_queue === 'buzzer').length,
      other_items: unassignedTasks.filter(t => t.task_queue === 'other_items').length,
      total: unassignedTasks.length,
    }

    return NextResponse.json({
      userStats: userStats, // Все пользователи, даже без задач
      unassigned,
      totalUsers: users?.length || 0,
      totalTasks: tasks?.length || 0,
    })

  } catch (error) {
    console.error('[Admin] Unexpected error in tasks-by-user:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

