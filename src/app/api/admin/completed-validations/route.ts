import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError, ApiErrorCode } from '@/lib/api-response'
import type { RecognitionWithValidations, CompletedValidationInfo, ValidationType } from '@/types/domain'

/**
 * GET /api/admin/completed-validations
 * 
 * Получить список recognitions с completed валидациями
 * Query params:
 * - userId: фильтр по пользователю (optional)
 * - validationType: фильтр по типу валидации (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Проверка авторизации и роли admin
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401, ApiErrorCode.UNAUTHORIZED)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return apiError('Forbidden', 403, ApiErrorCode.FORBIDDEN)
    }

    // Параметры фильтрации
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')
    const validationType = searchParams.get('validationType') as ValidationType | null

    // Запрос completed work logs
    let workLogsQuery = supabase
      .from('validation_work_log')
      .select('id, recognition_id, validation_type, completed_at, assigned_to, status')
      .eq('status', 'completed')
      .order('recognition_id')
      .order('completed_at', { ascending: false })

    if (userId && userId !== 'all') {
      workLogsQuery = workLogsQuery.eq('assigned_to', userId)
    }

    if (validationType) {
      workLogsQuery = workLogsQuery.eq('validation_type', validationType)
    }

    const { data: workLogs, error: workLogsError } = await workLogsQuery

    if (workLogsError) {
      console.error('[completed-validations] Error fetching work logs:', workLogsError)
      return apiError('Failed to fetch work logs', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    if (!workLogs || workLogs.length === 0) {
      return apiSuccess({ recognitions: [] })
    }

    // Получить уникальные recognition_ids
    const recognitionIds = [...new Set(workLogs.map(log => log.recognition_id))]

    // Получить recognitions
    const { data: recognitions, error: recognitionsError } = await supabase
      .from('recognitions')
      .select('id, batch_id')
      .in('id', recognitionIds)

    if (recognitionsError) {
      console.error('[completed-validations] Error fetching recognitions:', recognitionsError)
      return apiError('Failed to fetch recognitions', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    // Получить emails пользователей для отображения
    const userIds = [...new Set(workLogs.map(log => log.assigned_to))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIds)

    const userEmailMap = new Map(profiles?.map(p => [p.id, p.email]) || [])

    // Группировать work logs по recognition_id
    const recognitionMap = new Map<number, CompletedValidationInfo[]>()

    for (const log of workLogs) {
      if (!recognitionMap.has(log.recognition_id)) {
        recognitionMap.set(log.recognition_id, [])
      }

      recognitionMap.get(log.recognition_id)!.push({
        validation_type: log.validation_type as ValidationType,
        work_log_id: log.id,
        completed_at: log.completed_at || '',
        assigned_to: log.assigned_to,
        assigned_to_email: userEmailMap.get(log.assigned_to),
      })
    }

    // Сформировать результат
    const result: RecognitionWithValidations[] = (recognitions || []).map(rec => ({
      recognition_id: rec.id,
      batch_id: rec.batch_id,
      completed_validations: recognitionMap.get(rec.id) || [],
    }))

    // Отсортировать по recognition_id
    result.sort((a, b) => a.recognition_id - b.recognition_id)

    return apiSuccess({ recognitions: result })
  } catch (error) {
    console.error('[completed-validations] Error:', error)
    return apiError('Internal server error', 500, ApiErrorCode.INTERNAL_ERROR)
  }
}

