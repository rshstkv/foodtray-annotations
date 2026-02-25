import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { ValidationSession } from '@/types/domain'

/**
 * POST /api/test-split/start
 * Acquire next (or specific) test split recognition and return a ValidationSession-compatible object
 * Body: { recognition_id?: number } — if provided, opens/creates session for that specific recognition
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const requestedRecognitionId = body.recognition_id ? Number(body.recognition_id) : null

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    let work_log_id: number
    let recognition_id: number

    if (requestedRecognitionId) {
      // Specific recognition requested — find existing work_log or create new
      const { data: existingWl } = await supabase
        .from('test_split_work_log')
        .select('id, recognition_id, status')
        .eq('recognition_id', requestedRecognitionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingWl) {
        // Reuse existing session (reopen if completed)
        if (existingWl.status === 'completed' || existingWl.status === 'abandoned') {
          await supabase
            .from('test_split_work_log')
            .update({ status: 'in_progress', completed_at: null })
            .eq('id', existingWl.id)
        }
        work_log_id = existingWl.id
        recognition_id = existingWl.recognition_id
      } else {
        // Create new session for this recognition
        const { data: newWl, error: insertError } = await supabase
          .from('test_split_work_log')
          .insert({ recognition_id: requestedRecognitionId, assigned_to: user.id, status: 'in_progress' })
          .select('id')
          .single()

        if (insertError || !newWl) {
          console.error('[test-split/start] Error creating work_log:', insertError)
          return apiError('Failed to create session', 500, ApiErrorCode.INTERNAL_ERROR)
        }
        work_log_id = newWl.id
        recognition_id = requestedRecognitionId
      }

      console.log(`[test-split/start] Specific recognition: work_log=${work_log_id}, recognition=${recognition_id}`)
    } else {
      // Auto-acquire next available
      const { data: taskData, error: taskError } = await supabase
        .rpc('acquire_test_split_recognition', { p_user_id: user.id })
        .maybeSingle()

      if (taskError) {
        console.error('[test-split/start] Error acquiring:', taskError)
        return apiError('Failed to acquire recognition', 500, ApiErrorCode.INTERNAL_ERROR)
      }

      if (!taskData) {
        return apiSuccess(null, 'No test split recognitions available')
      }

      work_log_id = (taskData as any).work_log_id
      recognition_id = (taskData as any).recognition_id
      console.log(`[test-split/start] Auto-acquired: work_log=${work_log_id}, recognition=${recognition_id}`)
    }

    // Load all data in parallel
    const [
      { data: recognition },
      { data: images },
      { data: tsRecognition },
      { data: workItems },
      { data: workAnnotations },
      { data: workLog },
    ] = await Promise.all([
      supabase.from('recognitions').select('*').eq('id', recognition_id).single(),
      supabase.from('images').select('*').eq('recognition_id', recognition_id).order('camera_number'),
      supabase.from('test_split_recognitions').select('*').eq('recognition_id', recognition_id).single(),
      supabase.from('test_split_work_items').select('*').eq('work_log_id', work_log_id).eq('is_deleted', false),
      supabase.from('test_split_work_annotations').select('*').eq('work_log_id', work_log_id).eq('is_deleted', false),
      supabase.from('test_split_work_log').select('*').eq('id', work_log_id).single(),
    ])

    // Build ValidationSession-compatible response
    const session: ValidationSession = {
      workLog: {
        ...workLog!,
        validation_type: 'FOOD_VALIDATION',
        validation_steps: [{ type: 'FOOD_VALIDATION', status: 'in_progress' }],
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
        work_log_id: work_log_id,
        initial_item_id: item.initial_item_id,
        recognition_id: recognition_id,
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
    console.error('[test-split/start] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}
