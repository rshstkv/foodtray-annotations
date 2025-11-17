import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'

/**
 * GET /api/validation/recognition/[id]/completed
 * 
 * Получить все completed work logs для recognition
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const recognitionId = parseInt(id)

    if (isNaN(recognitionId)) {
      return apiError('Invalid recognition ID', 400, ApiErrorCode.VALIDATION_ERROR)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401, ApiErrorCode.UNAUTHORIZED)
    }

    // Получить все completed work logs для этого recognition
    const { data: workLogs, error: workLogsError } = await supabase
      .from('validation_work_log')
      .select('id, recognition_id, validation_type, completed_at, assigned_to, status')
      .eq('recognition_id', recognitionId)
      .eq('status', 'completed')
      .order('validation_type')

    if (workLogsError) {
      console.error('[validation/recognition/completed] Error:', workLogsError)
      return apiError('Failed to fetch work logs', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    return apiSuccess(workLogs || [])
  } catch (error) {
    console.error('[validation/recognition/completed] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

