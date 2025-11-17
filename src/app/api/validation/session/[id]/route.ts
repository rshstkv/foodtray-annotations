import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { ValidationSession, WorkItem, WorkAnnotation, TrayItem, AnnotationView } from '@/types/domain'

/**
 * GET /api/validation/session/[id]
 * 
 * Загрузить данные текущей сессии валидации
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const workLogId = parseInt(id, 10)

    if (isNaN(workLogId)) {
      return apiError('Invalid work log ID', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // 1. Загрузить work log
    const { data: workLog, error: workLogError } = await supabase
      .from('validation_work_log')
      .select('*')
      .eq('id', workLogId)
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

    const recognitionId = workLog.recognition_id

    // 2. Загрузить recognition
    const { data: recognition } = await supabase
      .from('recognitions')
      .select('*')
      .eq('id', recognitionId)
      .single()

    if (!recognition) {
      return apiError('Recognition not found', 404, ApiErrorCode.NOT_FOUND)
    }

    // 3. Загрузить images
    const { data: images } = await supabase
      .from('images')
      .select('*')
      .eq('recognition_id', recognitionId)
      .order('camera_number')

    // 4. Загрузить recipe
    const { data: recipe } = await supabase
      .from('recipes')
      .select('*')
      .eq('recognition_id', recognitionId)
      .single()

    const { data: recipeLines } = await supabase
      .from('recipe_lines')
      .select('*')
      .eq('recipe_id', recipe?.id || 0)
      .order('line_number')

    const recipeLineIds = recipeLines?.map((line) => line.id) || []
    const { data: recipeLineOptions } = await supabase
      .from('recipe_line_options')
      .select('*')
      .in('recipe_line_id', recipeLineIds.length > 0 ? recipeLineIds : [0])

    // 5. Загрузить active menu
    const { data: activeMenuItems, error: activeMenuError } = await supabase
      .from('recognition_active_menu_items')
      .select('*')
      .eq('recognition_id', recognitionId)
    
    console.log(`[validation/session] Recognition ${recognitionId}: loaded ${activeMenuItems?.length || 0} active menu items`)
    if (activeMenuError) {
      console.error('[validation/session] Error loading active menu:', activeMenuError)
    }

    // 6. Загрузить work_items (рабочие копии для этой сессии)
    const { data: workItems } = await supabase
      .from('work_items')
      .select('*')
      .eq('work_log_id', workLogId)
      .eq('is_deleted', false) // не показываем удаленные

    // 7. Загрузить work_annotations (рабочие копии для этой сессии)
    const { data: workAnnotations } = await supabase
      .from('work_annotations')
      .select('*')
      .eq('work_log_id', workLogId)
      .eq('is_deleted', false) // не показываем удаленные

    // 8. Преобразуем в UI типы
    const items: TrayItem[] = (workItems || []).map(item => ({
      ...item,
      is_modified: true,
    }))

    const annotations: AnnotationView[] = (workAnnotations || []).map(ann => ({
      ...ann,
      is_modified: true,
      is_temp: false,
    }))

    const session: ValidationSession = {
      workLog,
      recognition,
      images: images || [],
      recipe: recipe || null,
      recipeLines: recipeLines || [],
      recipeLineOptions: recipeLineOptions || [],
      activeMenu: activeMenuItems || [],
      items,
      annotations,
    }

    return apiSuccess({ session })
  } catch (error) {
    console.error('[validation/session] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

