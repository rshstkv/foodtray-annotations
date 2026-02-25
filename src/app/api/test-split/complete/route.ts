import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * POST /api/test-split/complete
 * Complete test split validation session
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { work_log_id } = body

    if (!work_log_id) {
      return apiError('Missing work_log_id', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    const { data: workLog } = await supabase
      .from('test_split_work_log')
      .select('*')
      .eq('id', work_log_id)
      .single()

    if (!workLog) {
      return apiError('Work log not found', 404, ApiErrorCode.NOT_FOUND)
    }

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

    await supabase
      .from('test_split_work_log')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', work_log_id)

    console.log(`[test-split/complete] Work log ${work_log_id} completed`)

    // Automatically acquire next recognition
    const { data: nextTask, error: nextError } = await supabase
      .rpc('acquire_test_split_recognition', { p_user_id: user.id })
      .maybeSingle()

    if (nextError) {
      console.error('[test-split/complete] Error acquiring next:', nextError)
    }

    let nextSession = null
    if (nextTask) {
      const { work_log_id: nextWorkLogId, recognition_id: nextRecognitionId } = nextTask as { work_log_id: number; recognition_id: number }
      console.log(`[test-split/complete] Next: work_log=${nextWorkLogId}, recognition=${nextRecognitionId}`)

      const [
        { data: nextRecognition },
        { data: nextImages },
        { data: nextTsRecognition },
        { data: nextWorkItems },
        { data: nextWorkAnnotations },
        { data: nextWorkLog },
      ] = await Promise.all([
        supabase.from('recognitions').select('*').eq('id', nextRecognitionId).single(),
        supabase.from('images').select('*').eq('recognition_id', nextRecognitionId).order('camera_number'),
        supabase.from('test_split_recognitions').select('*').eq('recognition_id', nextRecognitionId).single(),
        supabase.from('test_split_work_items').select('*').eq('work_log_id', nextWorkLogId).eq('is_deleted', false),
        supabase.from('test_split_work_annotations').select('*').eq('work_log_id', nextWorkLogId).eq('is_deleted', false),
        supabase.from('test_split_work_log').select('*').eq('id', nextWorkLogId).single(),
      ])

      nextSession = {
        workLog: {
          ...nextWorkLog!,
          validation_type: 'FOOD_VALIDATION',
          validation_steps: [{ type: 'FOOD_VALIDATION', status: 'in_progress' }],
          current_step_index: 0,
          priority_filter: null,
        },
        recognition: nextRecognition!,
        images: nextImages || [],
        recipe: null,
        recipeLines: [],
        recipeLineOptions: [],
        activeMenu: (nextTsRecognition?.active_menu || []).map((item: any) => ({
          external_id: item.ExternalId,
          name: item.Name,
        })),
        items: (nextWorkItems || []).map((item: any) => ({
          ...item,
          work_log_id: nextWorkLogId,
          initial_item_id: item.initial_item_id,
          recognition_id: nextRecognitionId,
          recipe_line_id: null,
          is_modified: true,
        })),
        annotations: (nextWorkAnnotations || []).map((ann: any) => ({
          ...ann,
          is_modified: true,
          is_temp: false,
        })),
      }
    }

    return apiSuccess({
      success: true,
      recognition_id: workLog.recognition_id,
      next_session: nextSession,
    })
  } catch (error) {
    console.error('[test-split/complete] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}
