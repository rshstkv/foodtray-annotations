import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/admin/recognition-stats
 * 
 * Получить статистику по recognitions:
 * - Сколько всего recognitions
 * - Какие проверки были выполнены для каждого recognition
 * - Группировка по комбинациям выполненных проверок
 */

interface RecognitionStats {
  total_recognitions: number
  by_completed_steps: {
    [key: string]: {
      count: number
      step_ids: string[]
      step_names: string[]
    }
  }
}

export async function GET() {
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

    // Получаем все recognitions
    const { data: recognitions, error: recError } = await supabase
      .from('recognitions')
      .select('recognition_id')

    if (recError) {
      console.error('[recognition-stats] Error fetching recognitions:', recError)
      return NextResponse.json({ error: recError.message }, { status: 500 })
    }

    // Получаем все завершенные задачи
    const { data: completedTasks, error: tasksError } = await supabase
      .from('tasks')
      .select('recognition_id, task_scope')
      .eq('status', 'completed')

    if (tasksError) {
      console.error('[recognition-stats] Error fetching tasks:', tasksError)
      return NextResponse.json({ error: tasksError.message }, { status: 500 })
    }

    // Группируем recognitions по выполненным проверкам
    const recognitionStepsMap = new Map<string, Set<string>>()

    // Инициализируем все recognitions
    recognitions?.forEach(rec => {
      recognitionStepsMap.set(rec.recognition_id, new Set())
    })

    // Добавляем выполненные проверки
    completedTasks?.forEach(task => {
      const steps = recognitionStepsMap.get(task.recognition_id) || new Set()
      const taskSteps = task.task_scope?.steps || []
      taskSteps.forEach((step: any) => {
        steps.add(step.id)
      })
      recognitionStepsMap.set(task.recognition_id, steps)
    })

    // Группируем по комбинациям проверок
    const stepCombinations = new Map<string, { count: number; step_ids: string[]; step_names: string[] }>()

    const STEP_NAMES: { [key: string]: string } = {
      'validate_dishes': 'Блюда',
      'validate_plates': 'Тарелки',
      'validate_buzzers': 'Баззеры',
      'check_overlaps': 'Перекрытия',
      'validate_bottles': 'Бутылки',
      'validate_nonfood': 'Non-food'
    }

    recognitionStepsMap.forEach((steps, _recognitionId) => {
      const stepIds = Array.from(steps).sort()
      const key = stepIds.length === 0 ? 'none' : stepIds.join('+')
      
      const existing = stepCombinations.get(key) || {
        count: 0,
        step_ids: stepIds,
        step_names: stepIds.map(id => STEP_NAMES[id] || id)
      }
      
      existing.count++
      stepCombinations.set(key, existing)
    })

    const result: RecognitionStats = {
      total_recognitions: recognitions?.length || 0,
      by_completed_steps: Object.fromEntries(stepCombinations)
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[recognition-stats] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

