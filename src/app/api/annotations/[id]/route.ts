import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { UpdateAnnotationRequest } from '@/types/domain'

/**
 * PATCH /api/annotations/[id]
 * 
 * Обновить annotation
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

    // Проверить существование annotation в annotations
    const { data: existingAnnotation } = await supabase
      .from('annotations')
      .select('*')
      .eq('id', annotationId)
      .single()

    if (existingAnnotation) {
      // Обновить существующую annotation
      const updateData: any = {
        updated_at: new Date().toISOString(),
      }

      if (body.bbox) {
        updateData.bbox = body.bbox
      }

      if (body.tray_item_id !== undefined) {
        // Определить, это current или initial item
        const { data: currentItem } = await supabase
          .from('current_tray_items')
          .select('id')
          .eq('id', body.tray_item_id)
          .single()

        updateData.current_tray_item_id = currentItem ? body.tray_item_id : null
        updateData.initial_tray_item_id = currentItem ? null : body.tray_item_id
      }

      const { data: annotation, error: updateError } = await supabase
        .from('annotations')
        .update(updateData)
        .eq('id', annotationId)
        .select()
        .single()

      if (updateError || !annotation) {
        console.error('[annotations/update] Error:', updateError)
        return apiError(
          'Failed to update annotation',
          500,
          ApiErrorCode.INTERNAL_ERROR
        )
      }

      return apiSuccess({ annotation })
    } else {
      // Annotation в initial_annotations, создать modified версию
      const { data: initialAnnotation } = await supabase
        .from('initial_annotations')
        .select('*')
        .eq('id', annotationId)
        .single()

      if (!initialAnnotation) {
        return apiError('Annotation not found', 404, ApiErrorCode.NOT_FOUND)
      }

      // Создать modified версию
      const newBbox = body.bbox || initialAnnotation.bbox

      let currentTrayItemId = null
      let initialTrayItemId = initialAnnotation.initial_tray_item_id

      if (body.tray_item_id !== undefined) {
        const { data: currentItem } = await supabase
          .from('current_tray_items')
          .select('id')
          .eq('id', body.tray_item_id)
          .single()

        currentTrayItemId = currentItem ? body.tray_item_id : null
        initialTrayItemId = currentItem ? null : body.tray_item_id
      }

      const { data: annotation, error: createError } = await supabase
        .from('annotations')
        .insert({
          image_id: initialAnnotation.image_id,
          current_tray_item_id: currentTrayItemId,
          initial_tray_item_id: initialTrayItemId,
          bbox: newBbox,
          is_deleted: false,
          created_by: user.id,
        })
        .select()
        .single()

      if (createError || !annotation) {
        console.error('[annotations/update] Error creating annotation:', createError)
        return apiError(
          'Failed to update annotation',
          500,
          ApiErrorCode.INTERNAL_ERROR
        )
      }

      return apiSuccess({ annotation })
    }
  } catch (error) {
    console.error('[annotations/update] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

/**
 * DELETE /api/annotations/[id]
 * 
 * Soft delete annotation
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

    // Проверить существование в annotations
    const { data: existingAnnotation } = await supabase
      .from('annotations')
      .select('*')
      .eq('id', annotationId)
      .single()

    if (existingAnnotation) {
      // Soft delete
      const { error: deleteError } = await supabase
        .from('annotations')
        .update({
          is_deleted: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', annotationId)

      if (deleteError) {
        console.error('[annotations/delete] Error:', deleteError)
        return apiError(
          'Failed to delete annotation',
          500,
          ApiErrorCode.INTERNAL_ERROR
        )
      }

      return apiSuccess({ success: true })
    } else {
      // Annotation в initial_annotations, создать deleted версию
      const { data: initialAnnotation } = await supabase
        .from('initial_annotations')
        .select('*')
        .eq('id', annotationId)
        .single()

      if (!initialAnnotation) {
        return apiError('Annotation not found', 404, ApiErrorCode.NOT_FOUND)
      }

      // Создать deleted версию
      const { error: createError } = await supabase
        .from('annotations')
        .insert({
          image_id: initialAnnotation.image_id,
          current_tray_item_id: null,
          initial_tray_item_id: initialAnnotation.initial_tray_item_id,
          bbox: initialAnnotation.bbox,
          is_deleted: true,
          created_by: user.id,
        })

      if (createError) {
        console.error('[annotations/delete] Error creating deleted annotation:', createError)
        return apiError(
          'Failed to delete annotation',
          500,
          ApiErrorCode.INTERNAL_ERROR
        )
      }

      return apiSuccess({ success: true })
    }
  } catch (error) {
    console.error('[annotations/delete] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

