import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

/**
 * GET /api/debug/validation-state
 * 
 * Диагностика состояния системы валидации
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return apiError('Authentication required', 401)
    }

    // 1. Количество recognitions
    const { count: recognitionsCount, error: recError } = await supabase
      .from('recognitions')
      .select('*', { count: 'exact', head: true })

    // 2. Примеры первых 5 recognitions
    const { data: sampleRecognitions } = await supabase
      .from('recognitions')
      .select('id, created_at')
      .order('id')
      .limit(5)

    // 3. Конфигурация validation_priority_config
    const { data: validationConfig } = await supabase
      .from('validation_priority_config')
      .select('*')
      .order('order_in_session')

    // 4. Все work_logs
    const { data: allWorkLogs } = await supabase
      .from('validation_work_log')
      .select('id, recognition_id, validation_type, status, started_at, validation_steps')
      .order('id')

    // 5. Группировка work_logs по статусу
    const workLogsByStatus = {
      in_progress: allWorkLogs?.filter(w => w.status === 'in_progress') || [],
      completed: allWorkLogs?.filter(w => w.status === 'completed') || [],
      abandoned: allWorkLogs?.filter(w => w.status === 'abandoned') || [],
    }

    // 6. Попытка вызвать функцию напрямую для проверки
    const { data: acquireTestData, error: acquireError } = await supabase
      .rpc('acquire_recognition_with_steps', { p_user_id: user.id })
      .maybeSingle()

    // Откатываем если захватили (тестовый вызов)
    if (acquireTestData && typeof acquireTestData === 'object' && 'work_log_id' in acquireTestData) {
      await supabase
        .from('validation_work_log')
        .delete()
        .eq('id', (acquireTestData as { work_log_id: number }).work_log_id)
    }

    const debugInfo = {
      timestamp: new Date().toISOString(),
      database: {
        recognitions: {
          total: recognitionsCount,
          error: recError?.message,
          samples: sampleRecognitions,
        },
        validation_config: {
          all: validationConfig,
          active: validationConfig?.filter(c => c.is_active),
          inactive: validationConfig?.filter(c => !c.is_active),
        },
        work_logs: {
          total: allWorkLogs?.length || 0,
          by_status: {
            in_progress: workLogsByStatus.in_progress.length,
            completed: workLogsByStatus.completed.length,
            abandoned: workLogsByStatus.abandoned.length,
          },
          details: workLogsByStatus,
        },
      },
      acquire_test: {
        success: !!acquireTestData,
        error: acquireError?.message,
        data: acquireTestData && typeof acquireTestData === 'object' && 'work_log_id' in acquireTestData ? {
          work_log_id: (acquireTestData as any).work_log_id,
          recognition_id: (acquireTestData as any).recognition_id,
          steps_count: (acquireTestData as any).validation_steps?.length,
        } : null,
      },
      analysis: {
        has_recognitions: (recognitionsCount || 0) > 0,
        has_active_config: (validationConfig?.filter(c => c.is_active).length || 0) > 0,
        blocking_work_logs: allWorkLogs?.filter(w => 
          w.status === 'in_progress' || w.status === 'completed'
        ).length || 0,
      }
    }

    return apiSuccess(debugInfo)
  } catch (error) {
    console.error('[debug/validation-state] Error:', error)
    return apiError('Internal server error', 500)
  }
}

