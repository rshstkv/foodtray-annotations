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

    // Запрос completed и abandoned work logs (включая validation_steps для multi-step архитектуры)
    // Abandoned work_logs могут содержать completed шаги
    // Используем пагинацию для обхода лимита в 1000 строк
    const PAGE_SIZE = 1000
    const workLogs = []
    let page = 0
    let hasMore = true

    while (hasMore) {
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      console.log(`[completed-validations] Fetching work_logs page ${page + 1}, range: ${from}-${to}`)

      let query = supabase
        .from('validation_work_log')
        .select('id, recognition_id, validation_type, validation_steps, completed_at, assigned_to, status')
        .in('status', ['completed', 'abandoned'])
        .order('recognition_id')
        .order('completed_at', { ascending: false })
        .range(from, to)

      if (userId && userId !== 'all') {
        query = query.eq('assigned_to', userId)
      }

      const { data, error: workLogsError } = await query

      if (workLogsError) {
        console.error('[completed-validations] Error fetching work logs:', workLogsError)
        return apiError('Failed to fetch work logs', 500, ApiErrorCode.INTERNAL_ERROR)
      }

      if (data && data.length > 0) {
        workLogs.push(...data)
        hasMore = data.length === PAGE_SIZE
        page++
      } else {
        hasMore = false
      }
    }

    console.log('[completed-validations] Total work_logs fetched:', workLogs.length)

    const workLogsError = null

    if (workLogsError) {
      console.error('[completed-validations] Error fetching work logs:', workLogsError)
      return apiError('Failed to fetch work logs', 500, ApiErrorCode.INTERNAL_ERROR)
    }

    if (!workLogs || workLogs.length === 0) {
      return apiSuccess({ recognitions: [] })
    }

    // Получить уникальные recognition_ids
    const recognitionIds = [...new Set(workLogs.map(log => log.recognition_id))]

    console.log('[completed-validations] Total unique recognition_ids:', recognitionIds.length)

    // Получить recognitions (батчинг для обхода ограничения .in() на ~1000 элементов)
    const BATCH_SIZE = 1000
    const recognitions = []
    
    for (let i = 0; i < recognitionIds.length; i += BATCH_SIZE) {
      const batch = recognitionIds.slice(i, i + BATCH_SIZE)
      console.log(`[completed-validations] Fetching batch ${Math.floor(i / BATCH_SIZE) + 1}, IDs: ${batch.length}`)
      
      const { data, error } = await supabase
        .from('recognitions')
        .select('id, batch_id')
        .in('id', batch)

      if (error) {
        console.error('[completed-validations] Error fetching recognitions batch:', error)
        return apiError('Failed to fetch recognitions', 500, ApiErrorCode.INTERNAL_ERROR)
      }
      
      if (data) {
        recognitions.push(...data)
      }
    }

    console.log('[completed-validations] Total recognitions fetched:', recognitions.length)

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

      // Multi-step: если есть validation_steps, берем все completed шаги
      if (log.validation_steps && Array.isArray(log.validation_steps)) {
        const completedSteps = log.validation_steps.filter((step: any) => step.status === 'completed')
        
        for (const step of completedSteps) {
          // Фильтр по типу валидации, если задан
          if (validationType && step.type !== validationType) {
            continue
          }

          recognitionMap.get(log.recognition_id)!.push({
            validation_type: step.type as ValidationType,
            work_log_id: log.id,
            completed_at: log.completed_at || '',
            assigned_to: log.assigned_to,
            assigned_to_email: userEmailMap.get(log.assigned_to),
          })
        }
      } else {
        // Legacy: single-step work_log (старый формат)
        // Фильтр по типу валидации, если задан
        if (validationType && log.validation_type !== validationType) {
          continue
        }

        recognitionMap.get(log.recognition_id)!.push({
          validation_type: log.validation_type as ValidationType,
          work_log_id: log.id,
          completed_at: log.completed_at || '',
          assigned_to: log.assigned_to,
          assigned_to_email: userEmailMap.get(log.assigned_to),
        })
      }
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

