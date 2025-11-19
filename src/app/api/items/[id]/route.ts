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
    const { selected_option_id, ...itemUpdates } = body

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    console.log(`[items/update] Updating item ${itemId}:`, { 
      recipe_line_id: itemUpdates.recipe_line_id, 
      selected_option_id,
      metadata: itemUpdates.metadata,
      has_metadata: !!itemUpdates.metadata
    })

    // Если указан selected_option_id - разрешаем неопределенность
    if (selected_option_id && itemUpdates.recipe_line_id) {
      // 1. Получить все options для данного recipe_line (через JOIN с recipe_lines для recipe_id)
      const { data: options } = await supabase
        .from('recipe_line_options')
        .select('id, recipe_line_id, recipe_lines!inner(recipe_id)')
        .eq('recipe_line_id', itemUpdates.recipe_line_id)

      if (options && options.length > 1) {
        // 2. Пометить выбранный option как is_selected, остальные - false
        const recipeId = (options[0].recipe_lines as any).recipe_id
        
        console.log(`[items/update] Resolving ambiguity: recipe_line=${itemUpdates.recipe_line_id}, recipe_id=${recipeId}, total_options=${options.length}`)
        
        // Сначала сбросим все options для этого recipe_line
        const { error: resetError } = await supabase
          .from('recipe_line_options')
          .update({ is_selected: false })
          .eq('recipe_line_id', itemUpdates.recipe_line_id)
        
        if (resetError) {
          console.error(`[items/update] ✗ Failed to reset options:`, resetError)
        }

        // Затем пометим выбранный
        const { error: selectError } = await supabase
          .from('recipe_line_options')
          .update({ is_selected: true })
          .eq('id', selected_option_id)
        
        if (selectError) {
          console.error(`[items/update] ✗ Failed to select option:`, selectError)
        } else {
          console.log(`[items/update] ✓ Resolved ambiguity: recipe_line=${itemUpdates.recipe_line_id}, selected_option=${selected_option_id}`)
        }
      } else {
        console.log(`[items/update] No ambiguity to resolve (${options?.length || 0} options)`)
      }
    }

    // Обновляем work_item (без selected_option_id, это поле только для API)
    const { data: item, error: updateError } = await supabase
      .from('work_items')
      .update(itemUpdates)
      .eq('id', itemId)
      .select()
      .single()

    if (updateError || !item) {
      console.error('[items/update] ✗ Error:', updateError)
      return apiError('Failed to update item', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    console.log(`[items/update] ✓ Updated item ${itemId}:`, {
      recipe_line_id: item.recipe_line_id,
      metadata_name: item.metadata?.name,
      quantity: item.quantity
    })

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

