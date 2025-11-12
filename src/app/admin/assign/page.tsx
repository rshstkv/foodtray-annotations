'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Check, X } from 'lucide-react'

interface RecognitionStats {
  total_recognitions: number
  by_completed_steps: {
    [key: string]: {
      count: number
      step_ids: string[]
      step_names: string[]
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
  const [stats, setStats] = useState<RecognitionStats | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  // Простая форма
  const [assignSteps, setAssignSteps] = useState<string[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [taskCount, setTaskCount] = useState(10)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch('/api/admin/recognition-stats'),
        fetch('/api/admin/users')
      ])

      if (statsRes.ok) {
        const data = await statsRes.json()
        setStats(data)
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


  const handleCreateTasks = async () => {
    if (!selectedUser || assignSteps.length === 0) return

    setCreating(true)
    try {
      const response = await fetch('/api/admin/create-tasks-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter_by_completed_steps: [], // Всегда берем новые recognitions
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


  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  // Доступные recognitions - всегда новые (без проверок)
  const availableCount = stats?.by_completed_steps['none']?.count || 0

  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Назначение задач</h1>
        <p className="text-gray-600 mt-1">Создание новых проверок для recognitions</p>
      </div>

      {/* Статистика по пользователям */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Задачи по пользователям</h2>
          <div className="space-y-2">
            {users.map(user => {
              const userTasks = stats ? Object.entries(stats.by_completed_steps).reduce((sum, [_, data]) => sum + data.count, 0) : 0
              return (
                <div key={user.id} className="flex items-center justify-between p-3 border rounded hover:bg-gray-50">
                  <div>
                    <span className="font-medium">{user.email}</span>
                    {user.role === 'admin' && <Badge className="ml-2" variant="secondary">admin</Badge>}
                  </div>
                  <div className="text-sm text-gray-600">
                    Задач: <span className="font-mono font-semibold">0</span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Статистика recognitions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-600">Всего recognitions</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.total_recognitions || 0}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Без задач (доступно)</p>
              <p className="text-3xl font-bold text-green-600">
                {stats?.by_completed_steps['none']?.count || 0}
              </p>
            </div>
          </div>

          {/* Таблица по выполненным проверкам */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-700">Количество</th>
                  <th className="text-left p-3 font-medium text-gray-700">Статус проверок</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats?.by_completed_steps || {})
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

      {/* Форма создания задач - УПРОЩЕННАЯ */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">Создать новые задачи</h2>

          {/* Выбор проверок */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-3 block">
              Какие проверки назначить:
            </label>
            <Select
              value={assignSteps.length > 0 ? assignSteps.join(',') : ''}
              onValueChange={(value) => {
                if (value) {
                  setAssignSteps(value.split(','))
                } else {
                  setAssignSteps([])
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите проверки..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="validate_dishes">Блюда</SelectItem>
                <SelectItem value="validate_plates">Тарелки</SelectItem>
                <SelectItem value="validate_buzzers">Баззеры</SelectItem>
                <SelectItem value="check_overlaps">Перекрытия</SelectItem>
                <SelectItem value="validate_bottles">Бутылки</SelectItem>
                <SelectItem value="validate_nonfood">Non-food</SelectItem>
                <SelectItem value="validate_dishes,validate_plates">Блюда + Тарелки</SelectItem>
                <SelectItem value="validate_dishes,validate_plates,validate_buzzers">Блюда + Тарелки + Баззеры</SelectItem>
              </SelectContent>
            </Select>
            {assignSteps.length > 0 && (
              <p className="text-xs text-green-700 mt-2">
                ✓ Выбрано: {assignSteps.map(id => STEP_TYPES.find(s => s.id === id)?.name).join(', ')}
              </p>
            )}
          </div>

          {/* Пользователь и количество */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Назначить пользователю:
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
                Количество задач:
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

          {/* Кнопка создания */}
          <div className="flex items-center justify-between pt-4 border-t">
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
                  Нет подходящих recognitions
                </span>
              ) : (
                <span className="text-green-600">
                  <Check className="inline h-4 w-4 mr-1" />
                  Готово к созданию: {Math.min(taskCount, availableCount)} задач
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
        </CardContent>
      </Card>
    </div>
  )
}
