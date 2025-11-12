import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Проверка авторизации
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    // Получаем роль пользователя
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.role === 'admin'

    // Query params
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const status = searchParams.get('status')
    const scope = searchParams.get('scope')
    const scopes = searchParams.getAll('scopes') // Множественные scope фильтры
    const priority = searchParams.get('priority')
    const assigned = searchParams.get('assigned')

    // Build query
    let query = supabase
      .from('tasks')
      .select(`
        *,
        recognition:recognitions(recognition_id, recognition_date, correct_dishes, menu_all)
      `)
      .order('created_at', { ascending: false })

    // Фильтр по пользователю
    if (assigned === 'false') {
      // Неназначенные задачи
      query = query.is('assigned_to', null)
    } else if (userId && isAdmin) {
      query = query.eq('assigned_to', userId)
    } else if (!isAdmin) {
      // Не-админ видит только свои задачи
      query = query.eq('assigned_to', user.id)
    }

    // Фильтр по статусу
    if (status) {
      query = query.eq('status', status)
    }

    // Фильтр по приоритету
    if (priority) {
      if (priority === 'high') {
        query = query.gte('priority', 7)
      } else if (priority === 'medium') {
        query = query.gte('priority', 4).lt('priority', 7)
      } else if (priority === 'low') {
        query = query.lt('priority', 4)
      }
    }

    // Фильтр по scope (задачи с определенным этапом)
    if (scope) {
      query = query.contains('scopes', [scope])
    }

    const { data: tasks, error } = await query

    // Фильтрация по множественным scopes на клиенте (если указаны)
    let filteredTasks = tasks || []
    if (scopes.length > 0 && filteredTasks.length > 0) {
      filteredTasks = filteredTasks.filter(task => {
        const taskStepIds = task.task_scope?.steps?.map((s: any) => s.id) || []
        // AND-логика: проверяем что ВСЕ выбранные scope присутствуют в задаче
        return scopes.every(scopeId => taskStepIds.includes(scopeId))
      })
    }

    if (error) {
      console.error('❌ Supabase query error:', error)
      return apiError(error.message, 500)
    }

    console.log(`✅ Found ${filteredTasks?.length || 0} tasks for user ${user.id}`)

    // Подсчет статистики
    const stats = {
      total: filteredTasks.length,
      pending: filteredTasks.filter(t => t.status === 'pending').length,
      in_progress: filteredTasks.filter(t => t.status === 'in_progress').length,
      completed: filteredTasks.filter(t => t.status === 'completed').length,
      skipped: filteredTasks.filter(t => t.status === 'skipped').length,
    }

    return apiSuccess({ tasks: filteredTasks, stats })
  } catch (error) {
    console.error('Error fetching tasks:', error)
    return apiError('Internal server error', 500)
  }
}

