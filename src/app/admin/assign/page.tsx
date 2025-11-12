'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Check, X } from 'lucide-react'

interface RecognitionTaskStats {
  total_recognitions: number
  by_completed_checks: {
    [key: string]: {
      count: number
      step_ids: string[]
      step_names: string[]
    }
  }
}

interface UserStats {
  user_id: string
  user_email: string
  role: string
  total_tasks: number
  by_scope: {
    [scopeKey: string]: {
      scope_names: string[]
      count: number
    }
  }
}

interface User {
  id: string
  email: string
  role: string
}

const STEP_TYPES = [
  { id: 'validate_dishes', name: 'Блюда' },
  { id: 'validate_plates', name: 'Тарелки' },
  { id: 'validate_buzzers', name: 'Баззеры' },
  { id: 'check_overlaps', name: 'Перекрытия' },
  { id: 'validate_bottles', name: 'Бутылки' },
  { id: 'validate_nonfood', name: 'Non-food' }
]

export default function AdminAssignPage() {
  const [recognitionStats, setRecognitionStats] = useState<RecognitionTaskStats | null>(null)
  const [userStats, setUserStats] = useState<UserStats[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  // Форма назначения
  const [filterSteps, setFilterSteps] = useState<string[]>([])  // Фильтр по завершенным
  const [assignSteps, setAssignSteps] = useState<string[]>([])  // Какие назначить
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [taskCount, setTaskCount] = useState(10)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [recognitionRes, userStatsRes, usersRes] = await Promise.all([
        fetch('/api/admin/recognition-task-stats'),
        fetch('/api/admin/user-stats'),
        fetch('/api/admin/users')
      ])

      if (recognitionRes.ok) {
        const data = await recognitionRes.json()
        setRecognitionStats(data)
      }

      if (userStatsRes.ok) {
        const data = await userStatsRes.json()
        setUserStats(data.user_stats || [])
      }

      if (usersRes.ok) {
        const data = await usersRes.json()
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleFilterStep = (stepId: string) => {
    setFilterSteps(prev =>
      prev.includes(stepId)
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    )
  }

  const toggleAssignStep = (stepId: string) => {
    setAssignSteps(prev =>
      prev.includes(stepId)
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    )
  }

  const handleCreateTasks = async () => {
    if (!selectedUser || assignSteps.length === 0) return

    setCreating(true)
    try {
      const response = await fetch('/api/admin/create-tasks-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter_by_completed_steps: filterSteps,
          assign_steps: assignSteps,
          assigned_to: selectedUser,
          limit: taskCount,
          priority: 2
        })
      })

      if (response.ok) {
        const result = await response.json()
        alert(`✅ Создано задач: ${result.created}`)
        // Перезагружаем статистику
        await loadData()
        // Сбрасываем форму
        setAssignSteps([])
        setFilterSteps([])
        setSelectedUser('')
        setTaskCount(10)
      } else {
        const error = await response.json()
        alert(`❌ Ошибка: ${error.error}`)
      }
    } catch (error) {
      console.error('Error creating tasks:', error)
      alert('❌ Ошибка при создании задач')
    } finally {
      setCreating(false)
    }
  }

  // Подсчет доступных recognitions
  const getAvailableCount = () => {
    if (!recognitionStats) return 0
    
    // Если нет фильтра - берем все recognitions
    if (filterSteps.length === 0) {
      return recognitionStats.total_recognitions
    }
    
    // Ищем recognitions с нужными завершенными проверками
    let total = 0
    Object.entries(recognitionStats.by_completed_checks).forEach(([key, data]) => {
      const stepIds = data.step_ids
      
      // Проверяем что ВСЕ выбранные фильтры присутствуют
      const hasAllRequired = filterSteps.every(id => stepIds.includes(id))
      if (hasAllRequired) {
        // Проверяем что назначаемые проверки ЕЩЕ НЕ завершены (защита от дублей)
        const hasConflict = assignSteps.some(id => stepIds.includes(id))
        if (!hasConflict) {
          total += data.count
        }
      }
    })
    
    return total
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const availableCount = getAvailableCount()

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Назначение задач</h1>
        <p className="text-gray-600 mt-1">Управление задачами для аннотаторов</p>
      </div>

      {/* Статистика по пользователям */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Задачи по пользователям</h2>
          <div className="space-y-2">
            {userStats.map(user => (
              <div key={user.user_id} className="flex items-center justify-between p-3 border rounded hover:bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{user.user_email}</span>
                  {user.role === 'admin' && <Badge variant="secondary">admin</Badge>}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-600">
                    Задач: <span className="font-mono font-semibold text-lg">{user.total_tasks}</span>
                  </div>
                  {Object.keys(user.by_scope).length > 0 && (
                    <div className="flex gap-1">
                      {Object.entries(user.by_scope).map(([scopeKey, scopeData]) => (
                        <Badge key={scopeKey} variant="outline" className="text-xs">
                          {scopeData.scope_names.join('+')} ({scopeData.count})
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Статистика recognitions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-600">Всего recognitions</p>
              <p className="text-3xl font-bold text-gray-900">{recognitionStats?.total_recognitions || 0}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Без завершенных проверок</p>
              <p className="text-3xl font-bold text-green-600">
                {recognitionStats?.by_completed_checks?.['none']?.count || 0}
              </p>
            </div>
          </div>

          {/* Таблица по завершенным проверкам */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-700">Количество</th>
                  <th className="text-left p-3 font-medium text-gray-700">Завершенные проверки</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(recognitionStats?.by_completed_checks || {})
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([key, data]) => (
                    <tr key={key} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-3">
                        <Badge variant="outline" className="font-mono text-base">
                          {data.count}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {data.step_names.length === 0 ? (
                          <span className="text-green-600 font-medium">Новые (без проверок)</span>
                        ) : (
                          <span className="text-gray-700">{data.step_names.join(' + ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Форма создания задач */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">Создать новые задачи</h2>

          {/* Шаг 1: Фильтр по завершенным проверкам */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-3 block">
              Шаг 1: Фильтр по завершенным проверкам (необязательно)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Выберите проверки, которые УЖЕ должны быть завершены. Если ничего не выбрано - берутся все recognitions.
            </p>
            <div className="grid grid-cols-6 gap-2">
              {STEP_TYPES.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-2 p-3 border rounded cursor-pointer transition-colors ${
                    filterSteps.includes(step.id)
                      ? 'bg-purple-100 border-purple-400'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleFilterStep(step.id)}
                >
                  <Checkbox
                    checked={filterSteps.includes(step.id)}
                    onCheckedChange={() => toggleFilterStep(step.id)}
                  />
                  <span className="text-sm">{step.name}</span>
                </div>
              ))}
            </div>
            {filterSteps.length > 0 && (
              <p className="text-xs text-purple-700 mt-2">
                ✓ Фильтр: recognitions с завершенными проверками {filterSteps.map(id => STEP_TYPES.find(s => s.id === id)?.name).join(' + ')}
              </p>
            )}
          </div>

          {/* Шаг 2: Какие проверки назначить */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-3 block">
              Шаг 2: Какие проверки назначить (обязательно)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Выберите проверки для создания новых задач. Защита: не создаются задачи если проверки уже завершены.
            </p>
            <div className="grid grid-cols-6 gap-2">
              {STEP_TYPES.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-2 p-3 border rounded cursor-pointer transition-colors ${
                    assignSteps.includes(step.id)
                      ? 'bg-green-100 border-green-400'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleAssignStep(step.id)}
                >
                  <Checkbox
                    checked={assignSteps.includes(step.id)}
                    onCheckedChange={() => toggleAssignStep(step.id)}
                  />
                  <span className="text-sm">{step.name}</span>
                </div>
              ))}
            </div>
            {assignSteps.length > 0 && (
              <p className="text-xs text-green-700 mt-2">
                ✓ Будут созданы задачи с проверками: {assignSteps.map(id => STEP_TYPES.find(s => s.id === id)?.name).join(', ')}
              </p>
            )}
          </div>

          {/* Шаг 3: Пользователь и количество */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Шаг 3: Назначить пользователю
              </label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите пользователя" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.email} {user.role === 'admin' && '(admin)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Количество задач
              </label>
              <div className="flex gap-2">
                {[5, 10, 20, 50, 100].map(count => (
                  <button
                    key={count}
                    onClick={() => setTaskCount(count)}
                    className={`px-4 py-2 border rounded transition-colors ${
                      taskCount === count
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Шаг 4: Превью и создание */}
          <div className="border-t pt-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-blue-900 mb-2">Превью создания задач</h3>
              <div className="text-sm text-blue-800 space-y-1">
                <p>• Доступно recognitions: <strong>{availableCount}</strong></p>
                <p>• Будет создано задач: <strong>{Math.min(taskCount, availableCount)}</strong></p>
                {filterSteps.length > 0 && (
                  <p>• С завершенными проверками: <strong>{filterSteps.map(id => STEP_TYPES.find(s => s.id === id)?.name).join(' + ')}</strong></p>
                )}
                {assignSteps.length > 0 && (
                  <p>• Новые проверки: <strong>{assignSteps.map(id => STEP_TYPES.find(s => s.id === id)?.name).join(', ')}</strong></p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {assignSteps.length === 0 ? (
                  <span className="text-red-600">
                    <X className="inline h-4 w-4 mr-1" />
                    Выберите проверки для назначения
                  </span>
                ) : !selectedUser ? (
                  <span className="text-red-600">
                    <X className="inline h-4 w-4 mr-1" />
                    Выберите пользователя
                  </span>
                ) : availableCount === 0 ? (
                  <span className="text-red-600">
                    <X className="inline h-4 w-4 mr-1" />
                    Нет подходящих recognitions (возможно проверки уже завершены)
                  </span>
                ) : (
                  <span className="text-green-600">
                    <Check className="inline h-4 w-4 mr-1" />
                    Готово к созданию
                  </span>
                )}
              </div>
              <Button
                onClick={handleCreateTasks}
                disabled={creating || assignSteps.length === 0 || !selectedUser || availableCount === 0}
                size="lg"
              >
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Создать задачи
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
