import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

/**
 * GET /api/detection/tasks/[taskId]/images/[imageId]
 * Get a single image task.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; imageId: string }> }
) {
  try {
    const { taskId, imageId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const { data: image, error } = await supabase
      .from('detection_image_tasks')
      .select('*')
      .eq('id', parseInt(imageId))
      .eq('task_id', parseInt(taskId))
      .single()

    if (error || !image) {
      return apiError('Image not found', 404)
    }

    return apiSuccess(image)
  } catch (err) {
    console.error('[detection/images/[imageId]] Error:', err)
    return apiError('Internal server error', 500)
  }
}

/**
 * PATCH /api/detection/tasks/[taskId]/images/[imageId]
 * Save edited annotations, update status.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string; imageId: string }> }
) {
  try {
    const { taskId, imageId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const body = await request.json()
    const updateData: Record<string, unknown> = {}

    if (body.edited_annotations !== undefined) {
      updateData.edited_annotations = body.edited_annotations
    }

    if (body.status !== undefined) {
      if (body.status !== 'pending' && body.status !== 'done') {
        return apiError('Invalid status. Must be "pending" or "done".', 400)
      }
      updateData.status = body.status
      if (body.status === 'done') {
        updateData.reviewed_by = user.id
        updateData.reviewed_at = new Date().toISOString()
      }
    }

    if (body.is_modified !== undefined) {
      updateData.is_modified = body.is_modified
    }

    if (Object.keys(updateData).length === 0) {
      return apiError('No fields to update', 400)
    }

    const { data: updated, error } = await supabase
      .from('detection_image_tasks')
      .update(updateData)
      .eq('id', parseInt(imageId))
      .eq('task_id', parseInt(taskId))
      .select()
      .single()

    if (error) {
      return apiError(error.message, 500)
    }

    return apiSuccess(updated)
  } catch (err) {
    console.error('[detection/images/[imageId] PATCH] Error:', err)
    return apiError('Internal server error', 500)
  }
}
