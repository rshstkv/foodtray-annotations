import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * POST /api/tasks/create
 * 
 * Создать новую задачу (только для админа)
 * 
 * Body:
 * {
 *   recognition_id: string
 *   assigned_to: string (UUID пользователя)
 *   task_scope: {
 *     check_dishes: boolean
 *     check_plates: boolean
 *     check_buzzers: boolean
 *     check_nonfood: boolean
 *     allow_drawing: boolean
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Проверка авторизации и прав администратора
    const supabaseServer = await createClient()
    const { data: { user } } = await supabaseServer.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Проверяем что пользователь - админ
    const { data: profile } = await supabaseServer
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { recognition_id, assigned_to, task_scope } = body

    // Валидация
    if (!recognition_id || !assigned_to || !task_scope) {
      return NextResponse.json(
        { error: 'Missing required fields: recognition_id, assigned_to, task_scope' },
        { status: 400 }
      )
    }

    // Проверяем что recognition существует
    const { data: recognition, error: recError } = await supabaseServer
      .from('recognitions')
      .select('recognition_id')
      .eq('recognition_id', recognition_id)
      .single()

    if (recError || !recognition) {
      return NextResponse.json(
        { error: 'Recognition not found' },
        { status: 404 }
      )
    }

    // Проверяем что пользователь существует
    const { data: assignedUser, error: userError } = await supabaseServer
      .from('profiles')
      .select('id')
      .eq('id', assigned_to)
      .single()

    if (userError || !assignedUser) {
      return NextResponse.json(
        { error: 'Assigned user not found' },
        { status: 404 }
      )
    }

    // Создаем задачу
    const { data: task, error: taskError } = await supabaseServer
      .from('tasks')
      .insert({
        recognition_id,
        assigned_to,
        task_scope,
        status: 'pending'
      })
      .select()
      .single()

    if (taskError) {
      console.error('[POST /api/tasks/create] Error creating task:', taskError)
      
      // Если это ошибка уникальности - задача уже существует
      if (taskError.code === '23505') {
        return NextResponse.json(
          { error: 'Task already exists for this recognition and user' },
          { status: 409 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to create task', details: taskError.message },
        { status: 500 }
      )
    }

    console.log(`[POST /api/tasks/create] Created task ${task.id} for user ${assigned_to}`)

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        recognition_id: task.recognition_id,
        assigned_to: task.assigned_to,
        task_scope: task.task_scope,
        status: task.status,
        created_at: task.created_at
      }
    }, { status: 201 })

  } catch (error) {
    console.error('[POST /api/tasks/create] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}



