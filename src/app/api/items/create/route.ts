import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { CreateItemRequest } from '@/types/domain'

/**
 * POST /api/items/create
 * 
 * Создать новый work_item в рамках validation сессии
 */
export async function POST(request: Request) {
  try {
    const body: CreateItemRequest = await request.json()
    const {
      work_log_id,
      recognition_id,
      type,
      recipe_line_id,
      quantity = 1,
      metadata,
      bottle_orientation,
      selected_option_id,
    } = body

    if (!work_log_id || !recognition_id || !type) {
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

    // Создать новый work_item
    const { data: item, error: createError } = await supabase
      .from('work_items')
      .insert({
        work_log_id,
        recognition_id,
        type,
        recipe_line_id: recipe_line_id || null,
        quantity,
        metadata: metadata || null,
        bottle_orientation: bottle_orientation || null,
        initial_item_id: null, // Новый item (не из initial)
        is_deleted: false,
      })
      .select()
      .single()

    if (createError || !item) {
      console.error('[items/create] Error:', createError)
      return apiError('Failed to create item', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    // Если был выбран конкретный вариант блюда (ambiguity resolution)
    if (selected_option_id && recipe_line_id) {
      console.log('[items/create] Resolving ambiguity: recipe_line_id=', recipe_line_id, 'selected_option_id=', selected_option_id)
      
      // Обновляем recipe_line_options: выбранный option -> is_selected = true, остальные -> false
      const { error: updateError } = await supabase
        .from('recipe_line_options')
        .update({ is_selected: false })
        .eq('recipe_line_id', recipe_line_id)
      
      if (updateError) {
        console.error('[items/create] Failed to reset is_selected:', updateError)
      }
      
      const { error: selectError } = await supabase
        .from('recipe_line_options')
        .update({ is_selected: true })
        .eq('id', selected_option_id)
      
      if (selectError) {
        console.error('[items/create] Failed to set is_selected:', selectError)
      } else {
        console.log('[items/create] ✓ Ambiguity resolved successfully')
      }
    }

    return apiSuccess({ item })
  } catch (error) {
    console.error('[items/create] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

