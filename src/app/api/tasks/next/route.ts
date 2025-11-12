import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * GET /api/tasks/next
 * 
 * Получить следующую задачу для текущего пользователя
 * 
 * Приоритизация (по tasks.priority):
 * 1. priority=1 (быстрая валидация)
 * 2. priority=2 (средняя правка)
 * 3. priority=3 (сложная правка)
 * Внутри группы - по created_at (новые первыми)
 * 
 * Возвращает:
 * - task: задание с task_scope и progress
 * - recognition: данные распознавания
 * - images: изображения с аннотациями
 */
export async function GET() {
  const startTime = Date.now()
  try {
    // Получить текущего пользователя
    const supabaseServer = await createClient()
    const { data: { user } } = await supabaseServer.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    console.log(`[tasks/next] Fetching for user ${user.id}`)

    // Получаем следующую pending задачу (сортировка по priority, затем по created_at)
    const { data: tasks, error: tasksError } = await supabaseServer
      .from('tasks')
      .select(`
        *,
        recognitions!inner (
          recognition_id,
          recognition_date,
          correct_dishes,
          menu_all
        )
      `)
      .eq('assigned_to', user.id)
      .eq('status', 'pending')
      .order('priority', { ascending: true })   // 1=quick first
      .order('created_at', { ascending: false }) // новые первыми
      .limit(1)

    if (tasksError) {
      console.error('[tasks/next] Error:', tasksError)
      return apiError(tasksError.message, 500, ApiErrorCode.INTERNAL_ERROR)
    }

    if (!tasks || tasks.length === 0) {
      // Это нормальное состояние, не ошибка
      return apiSuccess(null, 'No tasks available', 200)
    }

    const task = tasks[0]
    const recognition = task.recognitions

    if (!recognition) {
      console.error('[tasks/next] Recognition not found for task:', task.id)
      return apiError('Recognition not found', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    // Получаем images с annotations
    const { data: images, error: imagesError } = await supabaseServer
      .from('images')
      .select(`
        *,
        annotations (*)
      `)
      .eq('recognition_id', recognition.recognition_id)
      .order('image_type') // main, quality

    if (imagesError) {
      console.error('[tasks/next] Error fetching images:', imagesError)
      return apiError(imagesError.message, 500, ApiErrorCode.INTERNAL_ERROR)
    }

    // Преобразуем результат
    const imagesWithAnnotations = (images || []).map(image => ({
      ...image,
      annotations: (image.annotations || []).filter((a: { is_deleted?: boolean }) => !a.is_deleted)
    }))

    // Обновляем task status на in_progress
    const { error: updateError } = await supabaseServer
      .from('tasks')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .eq('id', task.id)

    if (updateError) {
      console.error('[tasks/next] Error updating status:', updateError)
    }

    const totalTime = Date.now() - startTime
    console.log(`[tasks/next] ${totalTime}ms - task ${task.id}, priority ${task.priority}`)

    return apiSuccess({
      task: {
        id: task.id,
        recognition_id: recognition.recognition_id,
        task_scope: task.task_scope,
        progress: task.progress,
        priority: task.priority,
        status: 'in_progress',
        created_at: task.created_at
      },
      recognition: {
        recognition_id: recognition.recognition_id,
        recognition_date: recognition.recognition_date,
        correct_dishes: recognition.correct_dishes,
        menu_all: recognition.menu_all
      },
      images: imagesWithAnnotations
    })

  } catch (error) {
    const totalTime = Date.now() - startTime
    console.error(`[tasks/next] Error after ${totalTime}ms:`, error)
    return apiError(
      'Internal server error',
      500,
      ApiErrorCode.INTERNAL_ERROR,
      error instanceof Error ? error.message : undefined
    )
  }
}
