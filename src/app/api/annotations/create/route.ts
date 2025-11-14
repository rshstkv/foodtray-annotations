import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { CreateAnnotationRequest } from '@/types/domain'

/**
 * POST /api/annotations/create
 * 
 * Создать новую annotation
 */
export async function POST(request: Request) {
  try {
    const body: CreateAnnotationRequest = await request.json()
    const { image_id, tray_item_id, bbox } = body

    if (!image_id || !tray_item_id || !bbox) {
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

    // Определить, это current или initial tray item
    const { data: currentItem } = await supabase
      .from('current_tray_items')
      .select('id')
      .eq('id', tray_item_id)
      .single()

    const { data: initialItem } = await supabase
      .from('initial_tray_items')
      .select('id')
      .eq('id', tray_item_id)
      .single()

    if (!currentItem && !initialItem) {
      return apiError('Tray item not found', 404, ApiErrorCode.NOT_FOUND)
    }

    // Создать annotation
    const { data: annotation, error: createError } = await supabase
      .from('annotations')
      .insert({
        image_id,
        current_tray_item_id: currentItem ? tray_item_id : null,
        initial_tray_item_id: initialItem && !currentItem ? tray_item_id : null,
        bbox,
        is_deleted: false,
        created_by: user.id,
      })
      .select()
      .single()

    if (createError || !annotation) {
      console.error('[annotations/create] Error:', createError)
      return apiError(
        'Failed to create annotation',
        500,
        ApiErrorCode.INTERNAL_ERROR
      )
    }

    return apiSuccess({ annotation })
  } catch (error) {
    console.error('[annotations/create] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

