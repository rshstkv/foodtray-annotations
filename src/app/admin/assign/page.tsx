'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { apiFetch } from '@/lib/api-response'
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react'

interface User {
  id: string
  email: string
  role: string
}

interface TasksByScope {
  [scopeKey: string]: {
    scope_names: string[]
    count: number
  }
}

interface UserStats {
  user_id: string
  user_email: string
  role: string
  total_tasks: number
  by_scope: TasksByScope
}

interface AvailableTasksStats {
  total_unassigned: number
  by_scope: TasksByScope
}

const STEP_TYPES = [
  { id: 'validate_dishes', name: 'Блюда' },
  { id: 'check_overlaps', name: 'Перекрытия' },
  { id: 'validate_buzzers', name: 'Баззеры' },
  { id: 'validate_bottles', name: 'Бутылки' },
  { id: 'validate_nonfood', name: 'Другие предметы' },
  { id: 'validate_plates', name: 'Тарелки' },
]

export default function AssignTasksPage() {
  const [userStats, setUserStats] = useState<UserStats[]>([])
  const [availableStats, setAvailableStats] = useState<AvailableTasksStats | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  
  // Параметры назначения для выбранного пользователя
  const [filterScopes, setFilterScopes] = useState<string[]>([])
  const [assignScopes, setAssignScopes] = useState<string[]>([])
  const [taskCount, setTaskCount] = useState(10)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [statsRes, availableRes] = await Promise.all([
        apiFetch<{ user_stats: UserStats[] }>('/api/admin/user-stats'),
        apiFetch<{ available: AvailableTasksStats }>('/api/admin/available-tasks-stats')
      ])

      if (statsRes.success && statsRes.data) {
        setUserStats(statsRes.data.user_stats)
      }

      if (availableRes.success && availableRes.data) {
        setAvailableStats(availableRes.data.available)
      }
    } catch (err) {
      console.error('Error loading data:', err)
    }
  }

  const handleAssign = async () => {
    if (!selectedUserId) return
    
    setLoading(true)
    try {
      const steps = assignScopes.map(id => ({
        id,
        name: STEP_TYPES.find(s => s.id === id)?.name || id
      }))

      await apiFetch('/api/admin/assign-tasks', {
        method: 'POST',
        body: JSON.stringify({
          user_ids: [selectedUserId],
          task_count: taskCount,
          scope: { steps },
          filter_by_existing_scope: filterScopes.length > 0 ? filterScopes : undefined
        })
      })

      // Reload data
      await loadData()
      
      // Reset
      setFilterScopes([])
      setAssignScopes([])
      setSelectedUserId(null)
    } catch (err) {
      console.error('Error assigning tasks:', err)
      alert('Ошибка при назначении задач')
    } finally {
      setLoading(false)
    }
  }

  const toggleFilterScope = (scopeId: string) => {
    setFilterScopes(prev =>
      prev.includes(scopeId) ? prev.filter(id => id !== scopeId) : [...prev, scopeId]
    )
  }

  const toggleAssignScope = (scopeId: string) => {
    setAssignScopes(prev =>
      prev.includes(scopeId) ? prev.filter(id => id !== scopeId) : [...prev, scopeId]
    )
  }

  const selectedUser = userStats.find(u => u.user_id === selectedUserId)

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Назначение задач</h1>
        <p className="text-gray-600 mt-2">Управление задачами аннотаторов</p>
      </div>

      {/* Available Tasks Stats */}
      {availableStats && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-900">Доступно задач для назначения</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{availableStats.total_unassigned}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(availableStats.by_scope).map(([scopeKey, data]) => (
                  <Badge key={scopeKey} variant="outline" className="bg-white">
                    {data.scope_names.join(' + ')}: {data.count}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users Table */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            {userStats.map((user) => {
              const isSelected = selectedUserId === user.user_id
              const isExpanded = isSelected

              return (
                <div key={user.user_id} className="border rounded-lg">
                  {/* User Row */}
                  <div
                    className={`flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => setSelectedUserId(isSelected ? null : user.user_id)}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{user.user_email}</p>
                          {user.role === 'admin' && (
                            <Badge variant="secondary">Админ</Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900">{user.total_tasks}</p>
                          <p className="text-xs text-gray-500">задач</p>
                        </div>

                        <div className="flex gap-2 flex-wrap max-w-md">
                          {Object.entries(user.by_scope).map(([scopeKey, data]) => (
                            <Badge key={scopeKey} variant="outline">
                              {data.scope_names.join('+')} ({data.count})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Assignment Panel */}
                  {isExpanded && (
                    <div className="border-t bg-gray-50 p-6 space-y-6">
                      {/* Filter Section */}
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-3">
                          Фильтр: назначить задачи, у которых УЖЕ есть
                        </p>
                        <div className="grid grid-cols-6 gap-2">
                          {STEP_TYPES.map((step) => (
                            <div
                              key={step.id}
                              className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors ${
                                filterScopes.includes(step.id)
                                  ? 'bg-purple-100 border-purple-300'
                                  : 'bg-white border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => toggleFilterScope(step.id)}
                            >
                              <Checkbox
                                checked={filterScopes.includes(step.id)}
                                onCheckedChange={() => toggleFilterScope(step.id)}
                              />
                              <span className="text-sm">{step.name}</span>
                            </div>
                          ))}
                        </div>
                        {filterScopes.length === 0 && (
                          <p className="text-xs text-gray-500 mt-2">Пусто = любые задачи</p>
                        )}
                      </div>

                      {/* Assign Section */}
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-3">
                          Назначить проверки (добавятся к существующим)
                        </p>
                        <div className="grid grid-cols-6 gap-2">
                          {STEP_TYPES.map((step) => (
                            <div
                              key={step.id}
                              className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors ${
                                assignScopes.includes(step.id)
                                  ? 'bg-green-100 border-green-300'
                                  : 'bg-white border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => toggleAssignScope(step.id)}
                            >
                              <Checkbox
                                checked={assignScopes.includes(step.id)}
                                onCheckedChange={() => toggleAssignScope(step.id)}
                              />
                              <span className="text-sm">{step.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Task Count */}
                      <div className="flex items-center gap-4">
                        <label className="text-sm font-medium text-gray-700">
                          Количество задач:
                        </label>
                        <div className="flex gap-2">
                          {[5, 10, 20, 50, 100].map((count) => (
                            <button
                              key={count}
                              onClick={() => setTaskCount(count)}
                              className={`px-3 py-1 rounded border text-sm ${
                                taskCount === count
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                              }`}
                            >
                              {count}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="text-sm text-gray-600">
                          {assignScopes.length === 0 ? (
                            <span className="text-red-600">Выберите хотя бы одну проверку</span>
                          ) : (
                            <span>
                              Будет назначено: <strong>{taskCount}</strong> задач с проверками{' '}
                              <strong>{assignScopes.map(id => STEP_TYPES.find(s => s.id === id)?.name).join(', ')}</strong>
                            </span>
                          )}
                        </div>
                        <Button
                          onClick={handleAssign}
                          disabled={loading || assignScopes.length === 0}
                          size="lg"
                        >
                          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Назначить
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {userStats.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              Нет пользователей
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
