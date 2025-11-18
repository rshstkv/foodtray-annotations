import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { ValidationSession } from '@/types/domain'

/**
 * GET /api/recognition/[id]/view
 * 
 * Получить все completed work_logs для recognition для просмотра
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const recognitionId = parseInt(id, 10)

    if (isNaN(recognitionId)) {
      return apiError('Invalid recognition ID', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Получить все work_logs для recognition (completed и abandoned с completed шагами)
    const { data: workLogs, error: workLogsError } = await supabase
      .from('validation_work_log')
      .select('*')
      .eq('recognition_id', recognitionId)
      .in('status', ['completed', 'abandoned'])
      .order('completed_at', { ascending: false })

    if (workLogsError) {
      console.error('[recognition/view] Error fetching work logs:', workLogsError)
      return apiError('Failed to fetch work logs', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    if (!workLogs || workLogs.length === 0) {
      return apiError('No completed validations found', 404, ApiErrorCode.NOT_FOUND)
    }

    // Собрать уникальные work_log_ids
    const workLogIds = workLogs.map(wl => wl.id)

    // Загрузить recognition
    const { data: recognition } = await supabase
      .from('recognitions')
      .select('*')
      .eq('id', recognitionId)
      .single()

    if (!recognition) {
      return apiError('Recognition not found', 404, ApiErrorCode.NOT_FOUND)
    }

    // Загрузить images
    const { data: images } = await supabase
      .from('images')
      .select('*')
      .eq('recognition_id', recognitionId)
      .order('camera_number')

    // Загрузить recipe
    const { data: recipe } = await supabase
      .from('recipes')
      .select('*')
      .eq('recognition_id', recognitionId)
      .single()

    // Загрузить recipe_lines
    const { data: recipeLines } = await supabase
      .from('recipe_lines')
      .select('*')
      .eq('recipe_id', recipe?.id || 0)
      .order('line_number')

    // Загрузить recipe_line_options
    const recipeLineIds = recipeLines?.map(l => l.id) || []
    const { data: recipeLineOptions } = await supabase
      .from('recipe_line_options')
      .select('*')
      .in('recipe_line_id', recipeLineIds.length > 0 ? recipeLineIds : [0])

    // Загрузить active menu
    const { data: activeMenu } = await supabase
      .from('recognition_active_menu_items')
      .select('*')
      .eq('recognition_id', recognitionId)

    // Для каждого work_log загрузить work_items и work_annotations
    const sessionsData = await Promise.all(
      workLogs.map(async (workLog) => {
        const [
          { data: workItems },
          { data: workAnnotations }
        ] = await Promise.all([
          supabase.from('work_items').select('*').eq('work_log_id', workLog.id).eq('is_deleted', false),
          supabase.from('work_annotations').select('*').eq('work_log_id', workLog.id).eq('is_deleted', false)
        ])

        return {
          workLog,
          workItems: workItems || [],
          workAnnotations: workAnnotations || []
        }
      })
    )

    return apiSuccess({
      recognition,
      images: images || [],
      recipe: recipe || null,
      recipeLines: recipeLines || [],
      recipeLineOptions: recipeLineOptions || [],
      activeMenu: activeMenu || [],
      sessions: sessionsData
    })
  } catch (error) {
    console.error('[recognition/view] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

