import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * POST /api/test-split/items/create
 * Create a new test split work item
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { work_log_id, recognition_id, type, quantity = 1, metadata, bottle_orientation } = body

    if (!work_log_id || !recognition_id || !type) {
      return apiError('Missing required fields', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    const { data: item, error: createError } = await supabase
      .from('test_split_work_items')
      .insert({
        work_log_id,
        recognition_id,
        type,
        quantity,
        metadata: metadata || null,
        bottle_orientation: bottle_orientation || null,
        initial_item_id: null,
        is_deleted: false,
      })
      .select()
      .single()

    if (createError || !item) {
      console.error('[test-split/items/create] Error:', createError)
      return apiError('Failed to create item', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    return apiSuccess({ item })
  } catch (error) {
    console.error('[test-split/items/create] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}
