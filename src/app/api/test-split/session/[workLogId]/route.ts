import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { ValidationSession } from '@/types/domain'

/**
 * GET /api/test-split/session/[workLogId]
 * Load full test split validation session
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workLogId: string }> }
) {
  try {
    const { workLogId } = await params
    const workLogIdNum = parseInt(workLogId, 10)

    if (isNaN(workLogIdNum)) {
      return apiError('Invalid work_log_id', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Load work_log
    const { data: workLog, error: workLogError } = await supabase
      .from('test_split_work_log')
      .select('*')
      .eq('id', workLogIdNum)
      .single()

    if (workLogError || !workLog) {
      return apiError('Work log not found', 404, ApiErrorCode.NOT_FOUND)
    }

    // Access check
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

    // Load all data in parallel
    const [
      { data: recognition },
      { data: images },
      { data: tsRecognition },
      { data: workItems },
      { data: workAnnotations },
    ] = await Promise.all([
      supabase.from('recognitions').select('*').eq('id', recognitionId).single(),
      supabase.from('images').select('*').eq('recognition_id', recognitionId).order('camera_number'),
      supabase.from('test_split_recognitions').select('active_menu').eq('recognition_id', recognitionId).single(),
      supabase.from('test_split_work_items').select('*').eq('work_log_id', workLogIdNum).eq('is_deleted', false),
      supabase.from('test_split_work_annotations').select('*').eq('work_log_id', workLogIdNum).eq('is_deleted', false),
    ])

    const session: ValidationSession = {
      workLog: {
        ...workLog,
        validation_type: 'FOOD_VALIDATION',
        validation_steps: [{ type: 'FOOD_VALIDATION', status: workLog.status === 'completed' ? 'completed' : 'in_progress' }],
        current_step_index: 0,
        priority_filter: null,
      },
      recognition: recognition!,
      images: images || [],
      recipe: null,
      recipeLines: [],
      recipeLineOptions: [],
      activeMenu: (tsRecognition?.active_menu || []).map((item: any) => ({
        external_id: item.ExternalId,
        name: item.Name,
      })),
      items: (workItems || []).map(item => ({
        ...item,
        work_log_id: workLogIdNum,
        initial_item_id: item.initial_item_id,
        recognition_id: recognitionId,
        recipe_line_id: null,
        is_modified: true,
      })),
      annotations: (workAnnotations || []).map(ann => ({
        ...ann,
        is_modified: true,
        is_temp: false,
      })),
    }

    return apiSuccess({ session })
  } catch (error) {
    console.error('[test-split/session] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}
