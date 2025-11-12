import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * POST /api/admin/create-tasks-batch
 * 
 * Создать новые задачи для recognitions
 * 
 * Body:
 * {
 *   filter_by_completed_steps: string[] // какие проверки УЖЕ должны быть выполнены (фильтр)
 *   assign_steps: string[] // какие проверки назначить (новая задача)
 *   assigned_to: string // UUID пользователя
 *   limit: number // сколько задач создать
 *   priority: number // приоритет (1=quick, 2=medium, 3=low)
 * }
 */

const STEP_DEFINITIONS: { [key: string]: any } = {
  'validate_dishes': {
    id: 'validate_dishes',
    name: 'Проверка блюд с чеком',
    type: 'validation',
    required: true,
    allow_drawing: true,
    allow_menu_edit: false,
    checks: ['all_dishes_have_bbox', 'dish_count_matches_receipt']
  },
  'validate_plates': {
    id: 'validate_plates',
    name: 'Проверка plates',
    type: 'annotation',
    required: false,
    allow_drawing: false,
    checks: []
  },
  'validate_buzzers': {
    id: 'validate_buzzers',
    name: 'Проверка buzzers',
    type: 'annotation',
    required: false,
    allow_drawing: true,
    checks: ['at_least_one_buzzer']
  },
  'check_overlaps': {
    id: 'check_overlaps',
    name: 'Отметка перекрытий',
    type: 'annotation',
    required: false,
    allow_drawing: false,
    checks: ['overlapped_dishes_marked']
  },
  'validate_bottles': {
    id: 'validate_bottles',
    name: 'Ориентация бутылок',
    type: 'annotation',
    required: false,
    allow_drawing: true,
    checks: ['bottles_have_orientation']
  },
  'validate_nonfood': {
    id: 'validate_nonfood',
    name: 'Другие предметы',
    type: 'annotation',
    required: false,
    allow_drawing: true,
    checks: ['nonfood_items_marked']
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Проверка прав админа
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const {
      filter_by_completed_steps = [],
      assign_steps,
      assigned_to,
      limit = 10,
      priority = 2
    } = body

    // Валидация
    if (!assign_steps || assign_steps.length === 0) {
      return NextResponse.json(
        { error: 'assign_steps is required' },
        { status: 400 }
      )
    }

    if (!assigned_to) {
      return NextResponse.json(
        { error: 'assigned_to is required' },
        { status: 400 }
      )
    }

    // Проверяем что пользователь существует
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', assigned_to)
      .single()

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Получаем все recognitions
    const { data: allRecognitions, error: recError } = await supabase
      .from('recognitions')
      .select('recognition_id')
      .order('recognition_date', { ascending: false })

    if (recError) {
      console.error('[create-tasks-batch] Error fetching recognitions:', recError)
      return NextResponse.json({ error: recError.message }, { status: 500 })
    }

    // Получаем все задачи (для фильтрации)
    const { data: allTasks, error: tasksError } = await supabase
      .from('tasks')
      .select('recognition_id, task_scope, status')

    if (tasksError) {
      console.error('[create-tasks-batch] Error fetching tasks:', tasksError)
      return NextResponse.json({ error: tasksError.message }, { status: 500 })
    }

    // Строим карту: recognition_id -> выполненные проверки
    const recognitionCompletedSteps = new Map<string, Set<string>>()
    const recognitionAllSteps = new Map<string, Set<string>>() // все проверки (включая pending)

    allTasks?.forEach(task => {
      const taskSteps = task.task_scope?.steps || []
      const stepIds = taskSteps.map((s: any) => s.id)
      
      // Все проверки (для защиты от дублирования)
      const allSteps = recognitionAllSteps.get(task.recognition_id) || new Set()
      stepIds.forEach((id: string) => allSteps.add(id))
      recognitionAllSteps.set(task.recognition_id, allSteps)

      // Только выполненные
      if (task.status === 'completed') {
        const completedSteps = recognitionCompletedSteps.get(task.recognition_id) || new Set()
        stepIds.forEach((id: string) => completedSteps.add(id))
        recognitionCompletedSteps.set(task.recognition_id, completedSteps)
      }
    })

    // Фильтруем recognitions
    let candidateRecognitions = allRecognitions || []

    // Фильтр 1: по выполненным проверкам
    if (filter_by_completed_steps.length > 0) {
      candidateRecognitions = candidateRecognitions.filter(rec => {
        const completedSteps = recognitionCompletedSteps.get(rec.recognition_id) || new Set()
        return filter_by_completed_steps.every((stepId: string) => completedSteps.has(stepId))
      })
    }

    // Фильтр 2: защита от дублирования - исключаем recognitions, где уже есть назначаемые проверки
    candidateRecognitions = candidateRecognitions.filter(rec => {
      const allSteps = recognitionAllSteps.get(rec.recognition_id) || new Set()
      return !assign_steps.some((stepId: string) => allSteps.has(stepId))
    })

    // Ограничиваем количество
    const selectedRecognitions = candidateRecognitions.slice(0, limit)

    if (selectedRecognitions.length === 0) {
      return NextResponse.json({
        success: true,
        created: 0,
        message: 'No suitable recognitions found'
      })
    }

    // Создаем task_scope
    const taskScope = {
      steps: assign_steps.map((stepId: string) => STEP_DEFINITIONS[stepId]).filter(Boolean),
      allow_menu_edit: false
    }

    // Создаем задачи
    const tasksToCreate = selectedRecognitions.map(rec => ({
      recognition_id: rec.recognition_id,
      assigned_to,
      task_scope: taskScope,
      priority,
      status: 'pending',
      progress: {
        current_step_index: 0,
        steps: assign_steps.map((stepId: string) => ({
          id: stepId,
          status: 'pending'
        }))
      }
    }))

    const { data: createdTasks, error: createError } = await supabase
      .from('tasks')
      .insert(tasksToCreate)
      .select()

    if (createError) {
      console.error('[create-tasks-batch] Error creating tasks:', createError)
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    console.log(`[create-tasks-batch] Created ${createdTasks?.length} tasks for user ${assigned_to}`)

    return NextResponse.json({
      success: true,
      created: createdTasks?.length || 0,
      tasks: createdTasks
    })

  } catch (error) {
    console.error('[create-tasks-batch] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

