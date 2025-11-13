'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { MainLayout } from '@/components/layout/MainLayout'
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'
import { Badge } from '@/components/ui/badge'
import { Clock, CheckCircle, XCircle, PlayCircle, ChevronDown } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface Task {
  id: string
  recognition_id: string
  status: string
  priority: number
  scopes: string[]
  progress: {
    current_step_index: number
    completed_steps: string[]
  } | null
  created_at: string
  assigned_user: {
    id: string
    email: string
    full_name: string | null
  } | null
  recognition: {
    recognition_id: string
    recognition_date: string
    correct_dishes: unknown[]
  }
  task_scope: {
    steps: Array<{ id: string; name: string }>
  } | null
}

interface Stats {
  total: number
  pending: number
  in_progress: number
  completed: number
  skipped: number
}

export default function TasksPage() {
  const router = useRouter()
  const { user, isAdmin } = useUser()
  const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [scopeFilter, setScopeFilter] = useState<string>('all')
  const [scopeFilters, setScopeFilters] = useState<string[]>([]) // Чекбоксы для scope
  const [assignedFilter, setAssignedFilter] = useState<string>('all')
  const [allUsers, setAllUsers] = useState<Array<{ id: string; email: string; full_name: string | null }>>([])

  useEffect(() => {
    if (user) {
      loadTasks()
    }
  }, [user, statusFilter, priorityFilter, scopeFilter, scopeFilters, assignedFilter])

  useEffect(() => {
    if (user && isAdmin) {
      loadUsers()
    }
  }, [user, isAdmin])

  const loadUsers = async () => {
    try {
      const response = await apiFetch<{ users: Array<any> }>('/api/admin/users')
      if (response.success && response.data) {
        setAllUsers(response.data.users || [])
      }
    } catch (err) {
      console.error('Error loading users:', err)
    }
  }

  const loadTasks = async () => {
    try {
      setLoading(true)
      
      const params = new URLSearchParams()
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter)
      if (priorityFilter && priorityFilter !== 'all') params.append('priority', priorityFilter)
      if (scopeFilter && scopeFilter !== 'all') params.append('scope', scopeFilter)
      // Добавляем фильтры по scope чекбоксам
      if (scopeFilters.length > 0) {
        scopeFilters.forEach(scope => params.append('scopes', scope))
      }
      if (assignedFilter && assignedFilter !== 'all') {
        if (assignedFilter === 'unassigned') {
          params.append('assigned', 'false')
        } else {
          params.append('userId', assignedFilter)
        }
      }

      const response = await apiFetch<{ tasks: Task[]; stats: Stats }>(
        `/api/tasks/list?${params.toString()}`
      )
      
      if (response.success && response.data) {
        setTasks(response.data.tasks || [])
        setStats(response.data.stats || { total: 0, pending: 0, in_progress: 0, completed: 0, skipped: 0 })
      } else {
        console.error('API response not successful:', response)
      }
    } catch (err) {
      console.error('Error loading tasks:', err)
    } finally {
      setLoading(false)
    }
  }

  const startNextTask = async () => {
    try {
      const response = await apiFetch<{ task: Task } | null>('/api/tasks/next')
      
      if (response.success && response.data) {
        router.push(`/task/${response.data.task.id}`)
      }
    } catch (err) {
      console.error('Error starting next task:', err)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'in_progress':
        return <PlayCircle className="w-4 h-4 text-blue-600" />
      case 'skipped':
        return <XCircle className="w-4 h-4 text-gray-400" />
      default:
        return <Clock className="w-4 h-4 text-amber-600" />
    }
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Ожидает',
      in_progress: 'В работе',
      completed: 'Завершено',
      skipped: 'Пропущено',
    }
    return labels[status] || status
  }

  const getPriorityLabel = (priority: number) => {
    if (priority >= 7) return { label: 'Высокий', color: 'bg-red-100 text-red-700' }
    if (priority >= 4) return { label: 'Средний', color: 'bg-amber-100 text-amber-700' }
    return { label: 'Низкий', color: 'bg-green-100 text-green-700' }
  }

  const SCOPE_TYPES = [
    { id: 'validate_dishes', name: 'Блюда' },
    { id: 'validate_plates', name: 'Тарелки' },
    { id: 'validate_buzzers', name: 'Баззеры' },
    { id: 'check_overlaps', name: 'Перекрытия' },
    { id: 'validate_bottles', name: 'Бутылки' },
    { id: 'validate_nonfood', name: 'Non-food' }
  ]

  const toggleScopeFilter = (scopeId: string) => {
    setScopeFilters(prev =>
      prev.includes(scopeId)
        ? prev.filter(id => id !== scopeId)
        : [...prev, scopeId]
    )
  }

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <MainLayout userName={user.email} userEmail={user.email} isAdmin={isAdmin}>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Мои задачи</h1>
              <p className="text-gray-600 mt-1">Управление задачами аннотирования</p>
            </div>
            
            <Button onClick={startNextTask} size="lg">
              Начать следующую задачу
            </Button>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-5 gap-4">
              <Card className="p-4">
                <div className="text-sm text-gray-600">Всего</div>
                <div className="text-2xl font-bold mt-1">{stats.total}</div>
              </Card>
              <Card className="p-4 border-amber-200 bg-amber-50">
                <div className="text-sm text-amber-700">Ожидают</div>
                <div className="text-2xl font-bold mt-1 text-amber-900">{stats.pending}</div>
              </Card>
              <Card className="p-4 border-blue-200 bg-blue-50">
                <div className="text-sm text-blue-700">В работе</div>
                <div className="text-2xl font-bold mt-1 text-blue-900">{stats.in_progress}</div>
              </Card>
              <Card className="p-4 border-green-200 bg-green-50">
                <div className="text-sm text-green-700">Завершено</div>
                <div className="text-2xl font-bold mt-1 text-green-900">{stats.completed}</div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-gray-600">Пропущено</div>
                <div className="text-2xl font-bold mt-1">{stats.skipped}</div>
              </Card>
            </div>
          )}
        </div>

        {/* Filters - Compact */}
        <div className="mb-6 flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          {/* Status filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Статус:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="pending">Ожидает</SelectItem>
                <SelectItem value="in_progress">В работе</SelectItem>
                <SelectItem value="completed">Завершено</SelectItem>
                <SelectItem value="skipped">Пропущено</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Priority filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Приоритет:</span>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="high">Высокий</SelectItem>
                <SelectItem value="medium">Средний</SelectItem>
                <SelectItem value="low">Низкий</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Assigned filter (admin only) */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Назначено:</span>
              <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                <SelectTrigger className="w-[160px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="unassigned">Не назначено</SelectItem>
                  {allUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Scope filters - dropdown with checkboxes */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Должны быть:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className="h-8 px-3 text-sm justify-between min-w-[160px]"
                  title="Показать задачи, содержащие ВСЕ выбранные типы"
                >
                  {scopeFilters.length === 0 
                    ? 'Любые типы' 
                    : `Все ${scopeFilters.length} ${scopeFilters.length === 1 ? 'тип' : 'типа'}`}
                  <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="start">
                <div className="mb-2 pb-2 border-b">
                  <p className="text-xs text-gray-600">
                    ✓ Показать задачи, содержащие <strong>все</strong> выбранные типы
                  </p>
                </div>
                <div className="space-y-2">
                  {SCOPE_TYPES.map((scope) => (
                    <label
                      key={scope.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded"
                    >
                      <Checkbox
                        checked={scopeFilters.includes(scope.id)}
                        onCheckedChange={() => toggleScopeFilter(scope.id)}
                      />
                      <span className="text-sm">{scope.name}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Tasks table */}
        {loading ? (
          <Card className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Загрузка задач...</p>
          </Card>
        ) : tasks.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-2xl font-semibold mb-2">Нет задач</h2>
            <p className="text-gray-600">Задач с выбранными фильтрами не найдено</p>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Recognition ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Приоритет
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Статус
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Прогресс
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Дата
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tasks.map((task) => {
                    const priorityInfo = getPriorityLabel(task.priority)
                    // Считаем количество завершенных этапов
                    const completedSteps = task.progress?.completed_steps?.length || 
                      (task.progress as any)?.steps?.filter((s: any) => s.status === 'completed').length || 0
                    const totalSteps = task.task_scope?.steps?.length || 0
                    const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0

                    return (
                      <tr key={task.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                          {task.recognition_id}
                        </td>
                        <td className="px-6 py-4">
                          <Badge className={priorityInfo.color}>
                            {priorityInfo.label}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(task.status)}
                            <span className="text-sm text-gray-700">
                              {getStatusLabel(task.status)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-600">
                              {completedSteps}/{totalSteps}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(task.created_at).toLocaleDateString('ru-RU')}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => router.push(`/task/${task.id}`)}
                          >
                            Открыть
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </MainLayout>
  )
}

