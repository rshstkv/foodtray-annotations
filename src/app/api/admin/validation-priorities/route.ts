import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { ValidationPriorityConfig } from '@/types/domain'

/**
 * GET /api/admin/validation-priorities
 * 
 * Получить все приоритеты валидации
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return apiError('Access denied', 403, ApiErrorCode.FORBIDDEN)
    }

    // Get priorities
    const { data: priorities, error: prioritiesError } = await supabase
      .from('validation_priority_config')
      .select('*')
      .order('priority', { ascending: true })
      .order('order_in_session', { ascending: true })

    if (prioritiesError) {
      console.error('[validation-priorities] Error:', prioritiesError)
      return apiError('Failed to load priorities', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    return apiSuccess({ priorities: priorities || [] })
  } catch (error) {
    console.error('[validation-priorities] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

/**
 * PATCH /api/admin/validation-priorities
 * 
 * Обновить приоритеты (bulk update)
 */
export async function PATCH(request: Request) {
  try {
    const body: { priorities: ValidationPriorityConfig[] } = await request.json()
    const { priorities } = body

    if (!priorities || !Array.isArray(priorities)) {
      return apiError('Invalid request body', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return apiError('Access denied', 403, ApiErrorCode.FORBIDDEN)
    }

    // Update each priority
    for (const priority of priorities) {
      await supabase
        .from('validation_priority_config')
        .update({
          priority: priority.priority,
          order_in_session: priority.order_in_session,
          is_active: priority.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', priority.id)
    }

    // View обновляется автоматически (обычный view, не materialized)
    console.log('[validation-priorities] Priorities updated, view auto-refreshed')

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('[validation-priorities] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

