import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/annotations/tasks/stats-detailed
 * 
 * Возвращает детальную статистику с возможностью фильтрации по пользователю
 * Параметры:
 * - user_id: UUID пользователя (опционально)
 * - filter: "my" | "unassigned" | "all" (опционально)
 * 
 * Доступно для всех авторизованных пользователей
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

    const searchParams = request.nextUrl.searchParams
    const filterType = searchParams.get('filter') || 'my' // my | unassigned | all
    const targetUserId = searchParams.get('user_id') // для фильтрации по конкретному пользователю

    // Получаем все pending задачи
    const { data: tasks, error: tasksError } = await supabase
      .from('recognitions')
      .select('task_queue, validation_mode, assigned_to')
      .eq('workflow_state', 'pending')

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError)
      return NextResponse.json({ error: tasksError.message }, { status: 500 })
    }

    // Фильтруем задачи в зависимости от типа фильтра
    let filteredTasks = tasks || []
    
    if (filterType === 'my') {
      filteredTasks = filteredTasks.filter(t => t.assigned_to === user.id)
    } else if (filterType === 'unassigned') {
      filteredTasks = filteredTasks.filter(t => !t.assigned_to)
    } else if (targetUserId) {
      filteredTasks = filteredTasks.filter(t => t.assigned_to === targetUserId)
    }
    // Если filterType === 'all', показываем всё

    // Подсчитываем по категориям
    const quickTotal = filteredTasks.filter(r => r.task_queue === 'dish_validation' && r.validation_mode === 'quick').length
    const editTotal = filteredTasks.filter(r => r.task_queue === 'dish_validation' && r.validation_mode === 'edit').length
    const checkTotal = filteredTasks.filter(r => r.task_queue === 'check_error').length
    const buzzerTotal = filteredTasks.filter(r => r.task_queue === 'buzzer').length
    const otherTotal = filteredTasks.filter(r => r.task_queue === 'other_items').length

    // Completed tasks (не фильтруем)
    const { data: completed } = await supabase
      .from('recognitions')
      .select('*', { count: 'exact', head: true })
      .eq('workflow_state', 'completed')

    return NextResponse.json({
      quick_validation: quickTotal,
      edit_mode: editTotal,
      check_errors: checkTotal,
      buzzer_annotation: buzzerTotal,
      non_food_objects: otherTotal,
      bottle_orientation: 0,
      completed: completed?.count || 0,
      filter: filterType,
      user_id: targetUserId || user.id,
    })

  } catch (error) {
    console.error('Unexpected error in stats-detailed endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

