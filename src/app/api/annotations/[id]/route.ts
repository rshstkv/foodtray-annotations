import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { UpdateAnnotationRequest } from '@/types/domain'

/**
 * PATCH /api/annotations/[id]
 * 
 * Обновить work_annotation
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const annotationId = parseInt(id, 10)

    if (isNaN(annotationId)) {
      return apiError('Invalid annotation ID', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const body: UpdateAnnotationRequest = await request.json()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Просто обновляем work_annotation (намного проще!)
    const { data: annotation, error: updateError } = await supabase
      .from('work_annotations')
      .update(body)
      .eq('id', annotationId)
      .select()
      .single()

    if (updateError || !annotation) {
      console.error('[annotations/update] Error:', updateError)
      return apiError('Failed to update annotation', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    return apiSuccess({ annotation })
  } catch (error) {
    console.error('[annotations/update] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

/**
 * DELETE /api/annotations/[id]
 * 
 * Soft delete work_annotation
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const annotationId = parseInt(id, 10)

    if (isNaN(annotationId)) {
      return apiError('Invalid annotation ID', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Soft delete work_annotation (намного проще!)
    const { error: deleteError } = await supabase
      .from('work_annotations')
      .update({ is_deleted: true })
      .eq('id', annotationId)

    if (deleteError) {
      console.error('[annotations/delete] Error:', deleteError)
      return apiError('Failed to delete annotation', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('[annotations/delete] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}
