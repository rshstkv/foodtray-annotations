import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * POST /api/validation/heartbeat
 * 
 * Обновить updated_at для активной validation сессии
 * Вызывается каждые 5 минут для предотвращения timeout
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { work_log_id } = body

    if (!work_log_id) {
      return apiError('Missing work_log_id', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Обновить updated_at
    const { error: updateError } = await supabase
      .from('validation_work_log')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', work_log_id)
      .eq('assigned_to', user.id) // Дополнительная проверка безопасности

    if (updateError) {
      console.error('[validation/heartbeat] Update error:', updateError)
      return apiError('Failed to update heartbeat', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('[validation/heartbeat] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

