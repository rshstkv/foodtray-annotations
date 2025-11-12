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
  const [selectedRecognitionGroup, setSelectedRecognitionGroup] = useState<string | null>(null)  // Выбранная группа recognitions
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

  const toggleAssignStep = (stepId: string) => {
    setAssignSteps(prev =>
      prev.includes(stepId)
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    )
  }

  // Получить уже завершенные проверки для выбранной группы
  const getCompletedStepsForGroup = (): string[] => {
    if (!selectedRecognitionGroup || !recognitionStats) return []
    const groupData = recognitionStats.by_completed_checks[selectedRecognitionGroup]
    return groupData?.step_ids || []
  }

  // Проверить доступность проверки (не должна быть уже завершена)
  const isStepAvailable = (stepId: string): boolean => {
    const completedSteps = getCompletedStepsForGroup()
    return !completedSteps.includes(stepId)
  }

  const handleCreateTasks = async () => {
    if (!selectedUser || assignSteps.length === 0 || !selectedRecognitionGroup) return

    setCreating(true)
    try {
      const completedSteps = getCompletedStepsForGroup()
      
      const response = await fetch('/api/admin/create-tasks-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter_by_completed_steps: completedSteps,
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
        setSelectedRecognitionGroup(null)
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

  // Получить количество recognitions в выбранной группе
  const getSelectedGroupCount = (): number => {
    if (!selectedRecognitionGroup || !recognitionStats) return 0
    return recognitionStats.by_completed_checks[selectedRecognitionGroup]?.count || 0
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const selectedGroupCount = getSelectedGroupCount()
  const completedStepsForGroup = getCompletedStepsForGroup()

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

      {/* Шаг 1: Выбор группы recognitions */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Шаг 1: Выберите группу recognitions
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Всего recognitions: <strong>{recognitionStats?.total_recognitions || 0}</strong>
          </p>

          {/* Таблица групп recognitions */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-700 w-16"></th>
                  <th className="text-left p-3 font-medium text-gray-700">Количество</th>
                  <th className="text-left p-3 font-medium text-gray-700">Завершенные проверки</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(recognitionStats?.by_completed_checks || {})
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([key, data]) => (
                    <tr 
                      key={key} 
                      className={`border-b last:border-0 cursor-pointer transition-colors ${
                        selectedRecognitionGroup === key 
                          ? 'bg-blue-100 border-blue-300' 
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        setSelectedRecognitionGroup(key)
                        setAssignSteps([])  // Сбрасываем выбранные проверки
                      }}
                    >
                      <td className="p-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedRecognitionGroup === key 
                            ? 'border-blue-500 bg-blue-500' 
                            : 'border-gray-300'
                        }`}>
                          {selectedRecognitionGroup === key && (
                            <Check className="h-3 w-3 text-white" />
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="font-mono text-base font-semibold">
                          {data.count}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {data.step_names.length === 0 ? (
                          <span className="text-green-600 font-medium">Новые (без проверок)</span>
                        ) : (
                          <span className="text-gray-700 font-medium">{data.step_names.join(' + ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {selectedRecognitionGroup && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                <Check className="inline h-4 w-4 mr-1" />
                Выбрано: <strong>{selectedGroupCount} recognitions</strong>
                {completedStepsForGroup.length > 0 && (
                  <span> с завершенными проверками: <strong>{completedStepsForGroup.map(id => STEP_TYPES.find(s => s.id === id)?.name).join(', ')}</strong></span>
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Шаг 2: Выбор проверок для назначения */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Шаг 2: Какие проверки назначить
          </h2>

          {!selectedRecognitionGroup ? (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
              <p className="text-gray-600">Сначала выберите группу recognitions выше</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Выберите проверки для создания задач. Уже завершенные проверки недоступны.
              </p>
              <div className="grid grid-cols-6 gap-2">
                {STEP_TYPES.map((step) => {
                  const isAvailable = isStepAvailable(step.id)
                  const isSelected = assignSteps.includes(step.id)
                  
                  return (
                    <div
                      key={step.id}
                      className={`flex items-center gap-2 p-3 border rounded transition-colors ${
                        !isAvailable
                          ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
                          : isSelected
                          ? 'bg-green-100 border-green-400 cursor-pointer'
                          : 'bg-white border-gray-200 hover:border-gray-300 cursor-pointer'
                      }`}
                      onClick={() => isAvailable && toggleAssignStep(step.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={!isAvailable}
                        onCheckedChange={() => isAvailable && toggleAssignStep(step.id)}
                      />
                      <span className="text-sm">{step.name}</span>
                      {!isAvailable && (
                        <Badge variant="secondary" className="ml-auto text-xs">завершено</Badge>
                      )}
                    </div>
                  )
                })}
              </div>
              {assignSteps.length > 0 && (
                <p className="text-xs text-green-700 mt-2">
                  ✓ Будут созданы задачи с проверками: {assignSteps.map(id => STEP_TYPES.find(s => s.id === id)?.name).join(', ')}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Шаг 3: Пользователь и количество */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Шаг 3: Назначить исполнителя
          </h2>

          {!selectedRecognitionGroup || assignSteps.length === 0 ? (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
              <p className="text-gray-600">Сначала выберите группу recognitions и проверки</p>
            </div>
          ) : (
            <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Выберите пользователя
              </label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите пользователя" />
                </SelectTrigger>
                <SelectContent>
                  {userStats.map(user => {
                    const userInfo = users.find(u => u.id === user.user_id)
                    return (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{user.user_email}</span>
                          <Badge variant="outline" className="ml-2">
                            {user.total_tasks} задач
                          </Badge>
                          {userInfo?.role === 'admin' && (
                            <Badge variant="secondary" className="ml-1">admin</Badge>
                          )}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {selectedUser && (
                <p className="text-xs text-gray-600 mt-2">
                  Загрузка: <strong>{userStats.find(u => u.user_id === selectedUser)?.total_tasks || 0} задач</strong> в работе
                </p>
              )}
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

          {/* Превью и создание */}
          <div className="border-t pt-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-blue-900 mb-2">Превью создания задач</h3>
              <div className="text-sm text-blue-800 space-y-1">
                <p>• Группа recognitions: <strong>{selectedGroupCount}</strong></p>
                <p>• Будет создано задач: <strong>{Math.min(taskCount, selectedGroupCount)}</strong></p>
                {completedStepsForGroup.length > 0 && (
                  <p>• Уже завершены: <strong>{completedStepsForGroup.map(id => STEP_TYPES.find(s => s.id === id)?.name).join(', ')}</strong></p>
                )}
                {assignSteps.length > 0 && (
                  <p>• Новые проверки: <strong>{assignSteps.map(id => STEP_TYPES.find(s => s.id === id)?.name).join(', ')}</strong></p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {!selectedRecognitionGroup ? (
                  <span className="text-red-600">
                    <X className="inline h-4 w-4 mr-1" />
                    Выберите группу recognitions
                  </span>
                ) : assignSteps.length === 0 ? (
                  <span className="text-red-600">
                    <X className="inline h-4 w-4 mr-1" />
                    Выберите проверки для назначения
                  </span>
                ) : !selectedUser ? (
                  <span className="text-red-600">
                    <X className="inline h-4 w-4 mr-1" />
                    Выберите пользователя
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
                disabled={creating || assignSteps.length === 0 || !selectedUser || !selectedRecognitionGroup}
                size="lg"
              >
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Создать задачи
              </Button>
            </div>
          </div>
          </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
