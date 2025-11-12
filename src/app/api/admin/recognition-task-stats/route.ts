import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

/**
 * GET /api/admin/recognition-task-stats
 * 
 * Получить статистику по recognitions с учетом ЗАВЕРШЕННЫХ проверок:
 * - Сколько всего recognitions
 * - Какие проверки были ЗАВЕРШЕНЫ для каждого recognition
 * - Группировка по комбинациям завершенных проверок
 * 
 * Важно: смотрим на tasks со status = 'completed'
 */

interface RecognitionTaskStats {
  total_recognitions: number
  by_completed_checks: {
    [key: string]: {
      count: number
      step_ids: string[]
      step_names: string[]
    }
  }
}

const STEP_NAMES: { [key: string]: string } = {
  'validate_dishes': 'Блюда',
  'validate_plates': 'Тарелки',
  'validate_buzzers': 'Баззеры',
  'check_overlaps': 'Перекрытия',
  'validate_bottles': 'Бутылки',
  'validate_nonfood': 'Non-food'
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

    // Получаем все recognitions
    const { data: recognitions, error: recError } = await supabase
      .from('recognitions')
      .select('recognition_id')

    if (recError) {
      console.error('[recognition-task-stats] Error fetching recognitions:', recError)
      return apiError(recError.message, 500)
    }

    console.log('[recognition-task-stats] Total recognitions:', recognitions?.length || 0)

    // Получаем все ЗАВЕРШЕННЫЕ задачи
    const { data: completedTasks, error: tasksError } = await supabase
      .from('tasks')
      .select('recognition_id, task_scope')
      .eq('status', 'completed')

    if (tasksError) {
      console.error('[recognition-task-stats] Error fetching completed tasks:', tasksError)
      return apiError(tasksError.message, 500)
    }

    console.log('[recognition-task-stats] Completed tasks:', completedTasks?.length || 0)

    // Группируем recognitions по завершенным проверкам
    const recognitionStepsMap = new Map<string, Set<string>>()

    // Инициализируем все recognitions (пустые наборы)
    recognitions?.forEach(rec => {
      recognitionStepsMap.set(rec.recognition_id, new Set())
    })

    // Добавляем завершенные проверки
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

    const result: RecognitionTaskStats = {
      total_recognitions: recognitions?.length || 0,
      by_completed_checks: Object.fromEntries(stepCombinations)
    }

    console.log('[recognition-task-stats] Result:', JSON.stringify(result, null, 2))

    return apiSuccess(result)

  } catch (error) {
    console.error('[recognition-task-stats] Error:', error)
    return apiError('Internal server error', 500)
  }
}

