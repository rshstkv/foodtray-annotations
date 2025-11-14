import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { CreateItemRequest } from '@/types/domain'

/**
 * POST /api/items/create
 * 
 * Создать новый item в current_tray_items
 */
export async function POST(request: Request) {
  try {
    const body: CreateItemRequest = await request.json()
    const {
      recognition_id,
      item_type,
      source,
      recipe_line_option_id,
      menu_item_external_id,
      metadata,
    } = body

    if (!recognition_id || !item_type || !source) {
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

    // Создать новый item
    const { data: item, error: createError } = await supabase
      .from('current_tray_items')
      .insert({
        recognition_id,
        item_type,
        source,
        recipe_line_option_id: recipe_line_option_id || null,
        menu_item_external_id: menu_item_external_id || null,
        metadata: metadata || null,
        initial_tray_item_id: null, // Новый item
        is_deleted: false,
        created_by: user.id,
      })
      .select()
      .single()

    if (createError || !item) {
      console.error('[items/create] Error:', createError)
      return apiError('Failed to create item', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    return apiSuccess({ item })
  } catch (error) {
    console.error('[items/create] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

