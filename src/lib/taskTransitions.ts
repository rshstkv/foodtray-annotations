/**
 * Task Transitions - утилиты для автоматических переходов между этапами и задачами
 */

import type { TaskStep, TaskData } from '@/types/annotations'

export interface TransitionResult {
  type: 'next_step' | 'next_task' | 'task_completed' | 'no_tasks'
  nextStepIndex?: number
  nextTaskId?: string
  message?: string
}

/**
 * Определить следующее действие после завершения этапа
 */
export function determineNextTransition(
  currentStepIndex: number,
  allSteps: TaskStep[],
  task: TaskData
): TransitionResult {
  // Проверяем есть ли следующий этап
  if (currentStepIndex < allSteps.length - 1) {
    return {
      type: 'next_step',
      nextStepIndex: currentStepIndex + 1,
      message: `Переход к этапу: ${allSteps[currentStepIndex + 1].name}`,
    }
  }

  // Все этапы завершены
  return {
    type: 'task_completed',
    message: 'Все этапы завершены! Задача выполнена.',
  }
}

/**
 * Получить следующую задачу из очереди пользователя
 */
export async function fetchNextTask(
  currentTaskId: string,
  userId: string
): Promise<string | null> {
  try {
    const res = await fetch(`/api/tasks?assigned_to=${userId}&status=pending&limit=1`)
    if (!res.ok) return null

    const data = await res.json()
    const tasks = data.tasks || []

    // Возвращаем первую задачу которая не является текущей
    const nextTask = tasks.find((t: any) => t.id !== currentTaskId)
    return nextTask?.id || null
  } catch (error) {
    console.error('Error fetching next task:', error)
    return null
  }
}

/**
 * Выполнить автопереход после завершения этапа
 */
export async function executeTransition(
  result: TransitionResult,
  router: any,
  taskId: string,
  userId: string
): Promise<void> {
  switch (result.type) {
    case 'next_step':
      // Просто обновляем URL с новым шагом
      router.push(`/task/${taskId}?step=${result.nextStepIndex}`)
      break

    case 'task_completed':
      // Пытаемся найти следующую задачу
      const nextTaskId = await fetchNextTask(taskId, userId)
      if (nextTaskId) {
        router.push(`/task/${nextTaskId}`)
      } else {
        // Нет больше задач - возвращаемся к списку
        router.push('/tasks?filter=completed')
      }
      break

    case 'no_tasks':
      router.push('/tasks')
      break

    default:
      console.warn('Unknown transition type:', result.type)
  }
}

/**
 * Хелпер для useTaskManager
 * Использование:
 * 
 * const completeStepWithTransition = useCallback(async () => {
 *   await completeStep()
 *   
 *   const transition = determineNextTransition(currentStepIndex, allSteps, task)
 *   await executeTransition(transition, router, taskId, userId)
 * }, [completeStep, currentStepIndex, allSteps, task, router, taskId, userId])
 */

