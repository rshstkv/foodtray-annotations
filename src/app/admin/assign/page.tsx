'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api-response'
import { Loader2, Users, Package, CheckCircle2 } from 'lucide-react'

interface User {
  id: string
  email: string
  role: string
}

interface TaskScope {
  id: string
  name: string
  steps: Array<{ id: string; name: string }>
}

interface TaskStats {
  total: number
  unassigned: number
  pending: number
  in_progress: number
  completed: number
}

const DEFAULT_SCOPES: TaskScope[] = [
  {
    id: 'dishes_only',
    name: 'Только блюда',
    steps: [{ id: 'validate_dishes', name: 'Проверка блюд' }]
  },
  {
    id: 'buzzers_only',
    name: 'Только buzzers',
    steps: [{ id: 'validate_buzzers', name: 'Проверка buzzers' }]
  },
  {
    id: 'plates_only',
    name: 'Только тарелки',
    steps: [{ id: 'validate_plates', name: 'Проверка тарелок' }]
  },
  {
    id: 'full',
    name: 'Полный цикл',
    steps: [
      { id: 'validate_dishes', name: 'Проверка блюд' },
      { id: 'validate_buzzers', name: 'Проверка buzzers' },
      { id: 'validate_plates', name: 'Проверка тарелок' }
    ]
  }
]

export default function AssignTasksPage() {
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [selectedScope, setSelectedScope] = useState<string>('full')
  const [taskCount, setTaskCount] = useState<string>('10')
  const [priority, setPriority] = useState<string>('medium')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    loadUsers()
    loadStats()
  }, [])

  const loadUsers = async () => {
    try {
      const response = await apiFetch<{ users: User[] }>('/api/admin/users')
      if (response.success && response.data) {
        const annotators = response.data.users.filter(u => u.role === 'annotator')
        setUsers(annotators)
      }
    } catch (err) {
      console.error('Error loading users:', err)
    }
  }

  const loadStats = async () => {
    try {
      const response = await apiFetch<{ tasks: any[], stats: TaskStats }>('/api/tasks/list')
      if (response.success && response.data) {
        setStats(response.data.stats)
      }
    } catch (err) {
      console.error('Error loading stats:', err)
    }
  }

  const handleAssign = async () => {
    if (selectedUsers.length === 0) {
      alert('Выберите хотя бы одного аннотатора')
      return
    }

    setLoading(true)
    setSuccess(false)

    try {
      const scope = DEFAULT_SCOPES.find(s => s.id === selectedScope)
      
      const response = await apiFetch('/api/admin/assign-tasks', {
        method: 'POST',
        body: JSON.stringify({
          user_ids: selectedUsers,
          task_count: parseInt(taskCount),
          priority,
          scope: {
            steps: scope?.steps || DEFAULT_SCOPES[3].steps
          }
        })
      })

      if (response.success) {
        setSuccess(true)
        setSelectedUsers([])
        await loadStats()
        
        setTimeout(() => setSuccess(false), 3000)
      }
    } catch (err) {
      console.error('Error assigning tasks:', err)
      alert('Ошибка при назначении задач')
    } finally {
      setLoading(false)
    }
  }

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const selectAllUsers = () => {
    setSelectedUsers(users.map(u => u.id))
  }

  const unselectAll = () => {
    setSelectedUsers([])
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Назначение задач</h1>
        <p className="text-gray-600 mt-2">Распределение задач между аннотаторами</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Всего задач</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <Package className="w-10 h-10 text-gray-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Не назначено</p>
                  <p className="text-3xl font-bold text-amber-600">{stats.total - stats.pending - stats.in_progress - stats.completed}</p>
                </div>
                <Users className="w-10 h-10 text-amber-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Завершено</p>
                  <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
                </div>
                <CheckCircle2 className="w-10 h-10 text-green-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Assignment Form */}
      <Card>
        <CardHeader>
          <CardTitle>Параметры назначения</CardTitle>
          <CardDescription>Выберите аннотаторов и настройте параметры задач</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Users Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base">Аннотаторы ({selectedUsers.length} выбрано)</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllUsers}>
                  Выбрать всех
                </Button>
                <Button variant="outline" size="sm" onClick={unselectAll}>
                  Снять выбор
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedUsers.includes(user.id) 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleUser(user.id)}
                >
                  <Checkbox 
                    checked={selectedUsers.includes(user.id)} 
                    onCheckedChange={() => toggleUser(user.id)}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{user.email}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scope Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Тип задач</Label>
              <Select value={selectedScope} onValueChange={setSelectedScope}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_SCOPES.map(scope => (
                    <SelectItem key={scope.id} value={scope.id}>
                      {scope.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Количество задач на пользователя</Label>
              <Select value={taskCount} onValueChange={setTaskCount}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 задач</SelectItem>
                  <SelectItem value="10">10 задач</SelectItem>
                  <SelectItem value="20">20 задач</SelectItem>
                  <SelectItem value="50">50 задач</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Priority */}
          <div>
            <Label>Приоритет</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Низкий</SelectItem>
                <SelectItem value="medium">Средний</SelectItem>
                <SelectItem value="high">Высокий</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-gray-600">
              Будет назначено: <span className="font-semibold">{selectedUsers.length * parseInt(taskCount)}</span> задач
            </p>
            <Button 
              onClick={handleAssign} 
              disabled={loading || selectedUsers.length === 0}
              size="lg"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {success ? '✓ Назначено!' : 'Назначить задачи'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

