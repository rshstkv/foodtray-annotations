import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { StartValidationResponse } from '@/types/domain'

/**
 * POST /api/validation/start
 * 
 * Начать новую сессию валидации:
 * 1. Найти следующий recognition + validation_type по приоритетам
 * 2. Создать запись в validation_work_log
 * 3. Загрузить данные для UI
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // 1. Получить активные приоритеты валидации
    const { data: priorities, error: prioritiesError } = await supabase
      .from('validation_priority_config')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .order('order_in_session', { ascending: true })

    if (prioritiesError || !priorities || priorities.length === 0) {
      console.log('[validation/start] No active validation types found')
      return apiError('No active validation types', 404, ApiErrorCode.NOT_FOUND)
    }

    console.log('[validation/start] Active priorities:', priorities.length)

    // 2. Проверить последнюю завершенную валидацию этого пользователя
    const { data: lastCompleted } = await supabase
      .from('validation_work_log')
      .select('recognition_id, validation_type')
      .eq('assigned_to', user.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)

    console.log('[validation/start] Last completed:', lastCompleted)

    let selectedRecognition: any = null
    let selectedValidationType: string | null = null

    // 2.1. Если есть последняя завершенная - попробовать продолжить тот же recognition
    if (lastCompleted && lastCompleted.length > 0) {
      const lastRecognitionId = lastCompleted[0].recognition_id
      
      console.log('[validation/start] Checking for continuation of recognition:', lastRecognitionId)
      
      // Найти для этого recognition незавершенные типы валидации
      const { data: completedForRecognition } = await supabase
        .from('validation_work_log')
        .select('validation_type')
        .eq('recognition_id', lastRecognitionId)
        .eq('status', 'completed')
      
      const completedTypes = completedForRecognition?.map(w => w.validation_type) || []
      
      const { data: inProgressForRecognition } = await supabase
        .from('validation_work_log')
        .select('validation_type')
        .eq('recognition_id', lastRecognitionId)
        .eq('status', 'in_progress')
        .gte('started_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      
      const inProgressTypes = inProgressForRecognition?.map(w => w.validation_type) || []
      
      console.log('[validation/start] Completed types for recognition:', completedTypes)
      console.log('[validation/start] In progress types for recognition:', inProgressTypes)
      
      // Найти первый незавершенный тип по order_in_session
      const availableType = priorities.find(p => 
        !completedTypes.includes(p.validation_type) &&
        !inProgressTypes.includes(p.validation_type)
      )
      
      if (availableType) {
        console.log('[validation/start] Found available type for same recognition:', availableType.validation_type)
        
        // Загрузить recognition
        const { data: recog } = await supabase
          .from('recognitions')
          .select('*')
          .eq('id', lastRecognitionId)
          .single()
        
        if (recog) {
          selectedRecognition = recog
          selectedValidationType = availableType.validation_type
        }
      }
    }

    // 2.2. Если не нашли продолжение - искать новый recognition
    if (!selectedRecognition) {
      console.log('[validation/start] Looking for new recognition')
      
      for (const priority of priorities) {
        const validationType = priority.validation_type

        // Найти recognitions которые:
        // - Не имеют completed work_log для этого validation_type
        // - Не имеют in_progress work_log для этого validation_type (кроме старых > 30 мин)
        const { data: completedIds } = await supabase
          .from('validation_work_log')
          .select('recognition_id')
          .eq('validation_type', validationType)
          .eq('status', 'completed')

        const completedRecognitionIds = completedIds?.map((r) => r.recognition_id) || []

        const { data: inProgressIds } = await supabase
          .from('validation_work_log')
          .select('recognition_id')
          .eq('validation_type', validationType)
          .eq('status', 'in_progress')
          .gte('started_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())

        const inProgressRecognitionIds = inProgressIds?.map((r) => r.recognition_id) || []

        const excludedIds = [...completedRecognitionIds, ...inProgressRecognitionIds]

        // Найти первый доступный recognition
        let query = supabase
          .from('recognitions')
          .select('*')
          .order('id', { ascending: true })
          .limit(1)

        if (excludedIds.length > 0) {
          query = query.not('id', 'in', `(${excludedIds.join(',')})`)
        }

        const { data: recognitions } = await query

        if (recognitions && recognitions.length > 0) {
          selectedRecognition = recognitions[0]
          selectedValidationType = validationType
          console.log('[validation/start] Found new recognition:', selectedRecognition.id, 'for type:', validationType)
          break
        }
      }
    }

    console.log('[validation/start] Selected recognition:', selectedRecognition?.id)
    console.log('[validation/start] Selected type:', selectedValidationType)

    if (!selectedRecognition || !selectedValidationType) {
      console.log('[validation/start] No recognitions available for validation')
      return apiSuccess(null, 'No recognitions available for validation')
    }

    // 3. Создать work log запись
    const { data: workLog, error: workLogError } = await supabase
      .from('validation_work_log')
      .insert({
        recognition_id: selectedRecognition.id,
        validation_type: selectedValidationType,
        assigned_to: user.id,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (workLogError || !workLog) {
      console.error('[validation/start] Work log error:', workLogError)
      console.error('[validation/start] Work log data:', workLog)
      return apiError('Failed to create work log', 500, ApiErrorCode.INTERNAL_ERROR)
    }
    
    console.log('[validation/start] Work log created:', workLog.id)

    // 4. Загрузить данные для UI
    // Images
    const { data: images } = await supabase
      .from('images')
      .select('*')
      .eq('recognition_id', selectedRecognition.id)
      .order('camera_number')

    // Recipe
    const { data: recipe } = await supabase
      .from('recipes')
      .select('*')
      .eq('recognition_id', selectedRecognition.id)
      .single()

    // Recipe lines
    const { data: recipeLines } = await supabase
      .from('recipe_lines')
      .select('*')
      .eq('recipe_id', recipe?.id || 0)
      .order('line_number')

    // Recipe line options
    const recipeLineIds = recipeLines?.map((line) => line.id) || []
    const { data: recipeLineOptions } = await supabase
      .from('recipe_line_options')
      .select('*')
      .in('recipe_line_id', recipeLineIds.length > 0 ? recipeLineIds : [0])

    // Active menu (stored in recognition_active_menu_items)
    const { data: activeMenuItems } = await supabase
      .from('recognition_active_menu_items')
      .select('*')
      .eq('recognition_id', selectedRecognition.id)

    // Загрузить work_items и work_annotations (созданы триггером)
    const { data: workItems } = await supabase
      .from('work_items')
      .select('*')
      .eq('work_log_id', workLog.id)
      .eq('is_deleted', false)

    const { data: workAnnotations } = await supabase
      .from('work_annotations')
      .select('*')
      .eq('work_log_id', workLog.id)
      .eq('is_deleted', false)

    const response: StartValidationResponse = {
      workLog,
      recognition: selectedRecognition,
      images: images || [],
      recipe: recipe || null,
      recipeLines: recipeLines || [],
      recipeLineOptions: recipeLineOptions || [],
      activeMenu: activeMenuItems?.map((item) => item.menu_item_data) || [],
      workItems: workItems || [],
      workAnnotations: workAnnotations || [],
    }

    return apiSuccess(response)
  } catch (error) {
    console.error('[validation/start] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

