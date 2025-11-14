import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { UpdateItemRequest } from '@/types/domain'

/**
 * PATCH /api/items/[id]
 * 
 * Обновить item
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

    // Проверить, существует ли item в current_tray_items
    const { data: existingItem } = await supabase
      .from('current_tray_items')
      .select('*')
      .eq('id', itemId)
      .single()

    if (existingItem) {
      // Обновить существующий current item
      const { data: item, error: updateError } = await supabase
        .from('current_tray_items')
        .update({
          ...body,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId)
        .select()
        .single()

      if (updateError || !item) {
        console.error('[items/update] Error:', updateError)
        return apiError('Failed to update item', 500, ApiErrorCode.INTERNAL_ERROR)
      }

      return apiSuccess({ item })
    } else {
      // Item в initial_tray_items, нужно создать в current_tray_items
      const { data: initialItem } = await supabase
        .from('initial_tray_items')
        .select('*')
        .eq('id', itemId)
        .single()

      if (!initialItem) {
        return apiError('Item not found', 404, ApiErrorCode.NOT_FOUND)
      }

      // Создать modified версию
      const { data: item, error: createError } = await supabase
        .from('current_tray_items')
        .insert({
          recognition_id: initialItem.recognition_id,
          initial_tray_item_id: initialItem.id,
          item_type: body.item_type || initialItem.item_type,
          source: body.source || initialItem.source,
          recipe_line_option_id:
            body.recipe_line_option_id !== undefined
              ? body.recipe_line_option_id
              : initialItem.recipe_line_option_id,
          menu_item_external_id:
            body.menu_item_external_id !== undefined
              ? body.menu_item_external_id
              : initialItem.menu_item_external_id,
          metadata: body.metadata !== undefined ? body.metadata : initialItem.metadata,
          is_deleted: false,
          created_by: user.id,
        })
        .select()
        .single()

      if (createError || !item) {
        console.error('[items/update] Error creating current item:', createError)
        return apiError('Failed to update item', 500, ApiErrorCode.INTERNAL_ERROR)
      }

      return apiSuccess({ item })
    }
  } catch (error) {
    console.error('[items/update] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

/**
 * DELETE /api/items/[id]
 * 
 * Soft delete item
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

    // Проверить, существует ли item в current_tray_items
    const { data: existingItem } = await supabase
      .from('current_tray_items')
      .select('*')
      .eq('id', itemId)
      .single()

    if (existingItem) {
      // Soft delete существующего current item
      const { error: deleteError } = await supabase
        .from('current_tray_items')
        .update({
          is_deleted: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId)

      if (deleteError) {
        console.error('[items/delete] Error:', deleteError)
        return apiError('Failed to delete item', 500, ApiErrorCode.INTERNAL_ERROR)
      }

      return apiSuccess({ success: true })
    } else {
      // Item в initial_tray_items, создать deleted версию в current
      const { data: initialItem } = await supabase
        .from('initial_tray_items')
        .select('*')
        .eq('id', itemId)
        .single()

      if (!initialItem) {
        return apiError('Item not found', 404, ApiErrorCode.NOT_FOUND)
      }

      // Создать deleted версию
      const { error: createError } = await supabase
        .from('current_tray_items')
        .insert({
          recognition_id: initialItem.recognition_id,
          initial_tray_item_id: initialItem.id,
          item_type: initialItem.item_type,
          source: initialItem.source,
          recipe_line_option_id: initialItem.recipe_line_option_id,
          menu_item_external_id: initialItem.menu_item_external_id,
          metadata: initialItem.metadata,
          is_deleted: true,
          created_by: user.id,
        })

      if (createError) {
        console.error('[items/delete] Error creating deleted item:', createError)
        return apiError('Failed to delete item', 500, ApiErrorCode.INTERNAL_ERROR)
      }

      return apiSuccess({ success: true })
    }
  } catch (error) {
    console.error('[items/delete] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

