import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { CreateAnnotationRequest } from '@/types/domain'

/**
 * POST /api/annotations/create
 * 
 * Создать новую work_annotation
 */
export async function POST(request: Request) {
  try {
    const body: CreateAnnotationRequest = await request.json()
    const { work_log_id, image_id, work_item_id, bbox, is_occluded, occlusion_metadata } = body

    if (!work_log_id || !image_id || !work_item_id || !bbox) {
      return apiError(
        'Missing required fields',
        400,
        ApiErrorCode.VALIDATION_ERROR
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Создать work_annotation (намного проще!)
    const { data: annotation, error: createError } = await supabase
      .from('work_annotations')
      .insert({
        work_log_id,
        image_id,
        work_item_id,
        bbox,
        initial_annotation_id: null, // Новая аннотация
        is_deleted: false,
        is_occluded: is_occluded || false,
        occlusion_metadata: occlusion_metadata || null,
      })
      .select()
      .single()

    if (createError || !annotation) {
      console.error('[annotations/create] Error:', createError)
      return apiError(
        'Failed to create annotation',
        500,
        ApiErrorCode.INTERNAL_ERROR
      )
    }

    return apiSuccess({ annotation })
  } catch (error) {
    console.error('[annotations/create] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

