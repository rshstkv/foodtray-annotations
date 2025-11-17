import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { UpdateItemRequest } from '@/types/domain'

/**
 * PATCH /api/items/[id]
 * 
 * Обновить work_item
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const itemId = parseInt(id, 10)

    if (isNaN(itemId)) {
      return apiError('Invalid item ID', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const body: UpdateItemRequest = await request.json()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Просто обновляем work_item (намного проще!)
    const { data: item, error: updateError } = await supabase
      .from('work_items')
      .update(body)
      .eq('id', itemId)
      .select()
      .single()

    if (updateError || !item) {
      console.error('[items/update] Error:', updateError)
      return apiError('Failed to update item', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    return apiSuccess({ item })
  } catch (error) {
    console.error('[items/update] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

/**
 * DELETE /api/items/[id]
 * 
 * Soft delete work_item
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const itemId = parseInt(id, 10)

    if (isNaN(itemId)) {
      return apiError('Invalid item ID', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Soft delete work_item (намного проще!)
    const { error: deleteError } = await supabase
      .from('work_items')
      .update({ is_deleted: true })
      .eq('id', itemId)

    if (deleteError) {
      console.error('[items/delete] Error:', deleteError)
      return apiError('Failed to delete item', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('[items/delete] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

