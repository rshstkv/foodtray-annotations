import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { AbandonValidationRequest, AbandonAndGetNextResponse, StartValidationResponse } from '@/types/domain'

/**
 * POST /api/validation/abandon
 * 
 * Отменить сессию валидации и автоматически получить следующую задачу
 * - Помечает work_log как abandoned
 * - Удаляет work_items и work_annotations
 * - Атомарно захватывает следующий recognition (если есть)
 * - Возвращает next_task для автоматического перехода
 */
export async function POST(request: Request) {
  try {
    const body: AbandonValidationRequest = await request.json()
    const { work_log_id, reason } = body

    if (!work_log_id) {
      return apiError('Missing work_log_id', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // 1. Проверить work log
    const { data: workLog, error: workLogError } = await supabase
      .from('validation_work_log')
      .select('*')
      .eq('id', work_log_id)
      .single()

    if (workLogError || !workLog) {
      return apiError('Work log not found', 404, ApiErrorCode.NOT_FOUND)
    }

    // Проверка доступа
    if (workLog.assigned_to !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        return apiError('Access denied', 403, ApiErrorCode.FORBIDDEN)
      }
    }

    if (workLog.status !== 'in_progress') {
      return apiError('Work log is not in progress', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    // 2. Удалить все work_items и work_annotations для этого work_log
    await supabase
      .from('work_items')
      .delete()
      .eq('work_log_id', work_log_id)

    await supabase
      .from('work_annotations')
      .delete()
      .eq('work_log_id', work_log_id)

    // 3. Пометить work_log как abandoned (сохраняя completed шаги)
    const { error: updateError } = await supabase
      .from('validation_work_log')
      .update({
        status: 'abandoned',
        completed_at: new Date().toISOString(),
      })
      .eq('id', work_log_id)

    if (updateError) {
      console.error('[validation/abandon] Update error:', updateError)
      return apiError('Failed to abandon validation', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    console.log(`[validation/abandon] Work log ${work_log_id} abandoned with ${workLog.validation_steps?.filter((s: any) => s.status === 'completed').length || 0} completed steps preserved`)

    // 4. Автоматически получить следующую задачу
    const { data: nextTaskData } = await supabase
      .rpc('acquire_recognition_with_steps', { p_user_id: user.id })
      .maybeSingle()

    let nextTask: StartValidationResponse | undefined

    if (nextTaskData) {
      const { work_log_id: nextWorkLogId, recognition_id: nextRecognitionId } = nextTaskData as { work_log_id: number; recognition_id: number }
      
      // Загрузить данные для следующей задачи
      const [
        { data: recognition },
        { data: images },
        { data: recipe },
        { data: activeMenu },
        { data: workItems },
        { data: workAnnotations },
        { data: nextWorkLog }
      ] = await Promise.all([
        supabase.from('recognitions').select('*').eq('id', nextRecognitionId).single(),
        supabase.from('images').select('*').eq('recognition_id', nextRecognitionId).order('camera_number'),
        supabase.from('recipes').select('*').eq('recognition_id', nextRecognitionId).single(),
        supabase.from('recognition_active_menu_items').select('*').eq('recognition_id', nextRecognitionId),
        supabase.from('work_items').select('*').eq('work_log_id', nextWorkLogId).eq('is_deleted', false),
        supabase.from('work_annotations').select('*').eq('work_log_id', nextWorkLogId).eq('is_deleted', false),
        supabase.from('validation_work_log').select('*').eq('id', nextWorkLogId).single()
      ])

      // Загрузить recipe lines и options
      const recipeId = recipe?.id
      let recipeLines: any[] = []
      let recipeLineOptions: any[] = []

      if (recipeId) {
        const [linesResult, optionsResult] = await Promise.all([
          supabase.from('recipe_lines').select('*').eq('recipe_id', recipeId).order('line_number'),
          supabase.from('recipe_line_options').select('*').eq('recipe_id', recipeId)
        ])
        recipeLines = linesResult.data || []
        recipeLineOptions = optionsResult.data || []
      }

      nextTask = {
        workLog: nextWorkLog!,
        recognition: recognition!,
        images: images || [],
        recipe: recipe || null,
        recipeLines,
        recipeLineOptions,
        activeMenu: activeMenu || [],
        workItems: workItems || [],
        workAnnotations: workAnnotations || []
      }

      console.log(`[validation/abandon] Next task acquired: work_log=${nextWorkLogId}, recognition=${nextRecognitionId}`)
    } else {
      console.log('[validation/abandon] No more tasks available')
    }

    const response: AbandonAndGetNextResponse = {
      next_task: nextTask
    }

    return apiSuccess(response)
  } catch (error) {
    console.error('[validation/abandon] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

