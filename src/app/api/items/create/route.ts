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
        initial_item_id: null, // Новый item (не из initial)
        is_deleted: false,
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

