import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { StartValidationResponse } from '@/types/domain'

/**
 * POST /api/validation/start
 * 
 * Начать новую multi-step сессию валидации:
 * 1. Атомарно захватить recognition со всеми типами валидации (1 запрос)
 * 2. Параллельно загрузить данные для UI (4-5 запросов)
 * 
 * Производительность: 80-150ms
 * Recognition блокируется целиком для одного пользователя
 * 
 * OPTIONAL: priority_filter - для тестирования крайних случаев:
 *   - 'any' (default)
 *   - 'has_ambiguity' - recognition с неопределенностью в блюдах
 *   - 'plate_count_mismatch' - несоответствие количества тарелок
 *   - 'annotation_count_mismatch' - несоответствие количества аннотаций
 */
export async function POST(request: Request) {
  try {
    // Получить опциональный фильтр из body
    const body = await request.json().catch(() => ({}))
    const priorityFilter = body.priority_filter || 'any'

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // ШАГ 1: Атомарно захватить recognition со всеми validation steps
    console.log(`[validation/start] Using priority filter: ${priorityFilter}`)
    
    const { data: taskData, error: taskError } = await supabase
      .rpc('acquire_recognition_with_steps', { 
        p_user_id: user.id,
        p_filter: priorityFilter 
      })
      .maybeSingle()

    if (taskError) {
      console.error('[validation/start] Error acquiring recognition:', taskError)
      return apiError('Failed to acquire recognition', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    if (!taskData) {
      console.log('[validation/start] No recognitions available')
      return apiSuccess(null, 'No recognitions available for validation')
    }

    const { work_log_id, recognition_id, validation_steps, current_step_index } = taskData as { work_log_id: number; recognition_id: number; validation_steps: any; current_step_index: number }
    console.log(`[validation/start] Acquired recognition: work_log=${work_log_id}, recognition=${recognition_id}, steps=${validation_steps?.length || 0}`)

    // ШАГ 2: Параллельно загрузить все основные данные
    const [
      { data: recognition },
      { data: images },
      { data: recipe },
      { data: activeMenu },
      { data: workItems },
      { data: workAnnotations },
      { data: workLog }
    ] = await Promise.all([
      supabase.from('recognitions').select('*').eq('id', recognition_id).single(),
      supabase.from('images').select('*').eq('recognition_id', recognition_id).order('camera_number'),
      supabase.from('recipes').select('*').eq('recognition_id', recognition_id).single(),
      supabase.from('recognition_active_menu_items').select('*').eq('recognition_id', recognition_id),
      supabase.from('work_items').select('*').eq('work_log_id', work_log_id).eq('is_deleted', false),
      supabase.from('work_annotations').select('*').eq('work_log_id', work_log_id).eq('is_deleted', false),
      supabase.from('validation_work_log').select('*').eq('id', work_log_id).single()
    ])

    console.log(`[validation/start] Loaded ${images?.length || 0} images, ${activeMenu?.length || 0} menu items`)

    // ШАГ 3: Загрузить зависимые данные (recipe_lines зависит от recipe.id)
    const { data: recipeLines } = await supabase
      .from('recipe_lines')
      .select('*')
      .eq('recipe_id', recipe?.id || 0)
      .order('line_number')

    // ШАГ 4: Загрузить recipe_line_options (зависит от recipeLines)
    const recipeLineIds = recipeLines?.map(l => l.id) || []
    const { data: recipeLineOptions } = await supabase
      .from('recipe_line_options')
      .select('*')
      .in('recipe_line_id', recipeLineIds.length > 0 ? recipeLineIds : [0])

    const response: StartValidationResponse = {
      workLog: workLog!,
      recognition: recognition!,
      images: images || [],
      recipe: recipe || null,
      recipeLines: recipeLines || [],
      recipeLineOptions: recipeLineOptions || [],
      activeMenu: activeMenu || [],
      workItems: workItems || [],
      workAnnotations: workAnnotations || [],
    }

    return apiSuccess(response)
  } catch (error) {
    console.error('[validation/start] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

