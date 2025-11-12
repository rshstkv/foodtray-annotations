'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { apiFetch } from '@/lib/api-response'
import { 
  Loader2, Users, Package, CheckCircle2, UtensilsCrossed, Bell, Disc3,
  ArrowRightLeft, Filter, AlertCircle, User, Layers
} from 'lucide-react'

interface User {
  id: string
  email: string
  role: string
}

interface TaskScope {
  steps: Array<{ id: string; name: string }>
}

interface TaskStats {
  total: number
  unassigned: number
  pending: number
  in_progress: number
  completed: number
}

interface TaskWithScope {
  id: string
  recognition_id: string
  assigned_to: string | null
  task_scope: TaskScope
  status: string
  priority: number
}

interface UserAssignments {
  user_id: string
  user_email: string
  task_count: number
  by_scope: Record<string, number>
}

interface ScopeStats {
  scope_key: string
  scope_names: string[]
  total: number
  assigned: number
  unassigned: number
}

// Доступные типы проверок
const STEP_TYPES = [
  {
    id: 'validate_dishes',
    name: 'Блюда',
    shortName: 'Блюда',
    icon: UtensilsCrossed,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  {
    id: 'check_overlaps',
    name: 'Перекрытия',
    shortName: 'Перекрытия',
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  {
    id: 'validate_buzzers',
    name: 'Баззеры',
    shortName: 'Баззеры',
    icon: Bell,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  {
    id: 'validate_bottles',
    name: 'Бутылки',
    shortName: 'Бутылки',
    icon: Package,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  {
    id: 'validate_nonfood',
    name: 'Другие предметы',
    shortName: 'Предметы',
    icon: Package,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
  },
  {
    id: 'validate_plates',
    name: 'Тарелки',
    shortName: 'Тарелки',
    icon: Disc3,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
]

// Режимы работы
type Mode = 'assign' | 'reassign' | 'view'

export default function AssignTasksPage() {
  const [mode, setMode] = useState<Mode>('assign')
  const [users, setUsers] = useState<User[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([]) // Включая админов
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [scopeStats, setScopeStats] = useState<ScopeStats[]>([])
  const [userAssignments, setUserAssignments] = useState<UserAssignments[]>([])
  
  // Параметры назначения
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [selectedSteps, setSelectedSteps] = useState<string[]>(['validate_dishes', 'check_overlaps', 'validate_plates']) // По умолчанию блюда + перекрытия + тарелки
  const [filterByExistingScope, setFilterByExistingScope] = useState<string[]>([]) // Фильтр: какие scope уже есть у задач
  const [taskCount, setTaskCount] = useState<string>('10')
  const [priority, setPriority] = useState<string>('medium')
  
  // Переназначение
  const [fromUserId, setFromUserId] = useState<string>('')
  const [toUserId, setToUserId] = useState<string>('')
  const [reassignCount, setReassignCount] = useState<string>('10')
  
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    loadUsers()
    loadStats()
    loadScopeStats()
    loadUserAssignments()
  }, [])

  const loadUsers = async () => {
    try {
      const response = await apiFetch<{ users: User[] }>('/api/admin/users')
      if (response.success && response.data) {
        const annotators = response.data.users.filter(u => u.role === 'annotator')
        setUsers(annotators)
        setAllUsers(response.data.users) // Все пользователи для переназначения
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

  const loadScopeStats = async () => {
    try {
      const response = await apiFetch<{ scope_stats: ScopeStats[] }>('/api/admin/scope-stats')
      if (response.success && response.data) {
        setScopeStats(response.data.scope_stats)
      }
    } catch (err) {
      console.error('Error loading scope stats:', err)
    }
  }

  const loadUserAssignments = async () => {
    try {
      const response = await apiFetch<{ assignments: UserAssignments[] }>('/api/admin/user-assignments')
      if (response.success && response.data) {
        setUserAssignments(response.data.assignments)
      }
    } catch (err) {
      console.error('Error loading user assignments:', err)
    }
  }

  const handleAssign = async () => {
    if (selectedUsers.length === 0) {
      alert('Выберите хотя бы одного аннотатора')
      return
    }

    if (selectedSteps.length === 0) {
      alert('Выберите хотя бы один тип проверки')
      return
    }

    setLoading(true)
    setSuccess(false)

    try {
      const steps = selectedSteps.map(stepId => {
        const stepType = STEP_TYPES.find(s => s.id === stepId)
        return {
          id: stepId,
          name: stepType?.name || stepId
        }
      })
      
      const response = await apiFetch('/api/admin/assign-tasks', {
        method: 'POST',
        body: JSON.stringify({
          user_ids: selectedUsers,
          task_count: parseInt(taskCount),
          priority,
          scope: { steps },
          filter_by_existing_scope: filterByExistingScope.length > 0 ? filterByExistingScope : undefined
        })
      })

      if (response.success) {
        setSuccess(true)
        setSelectedUsers([])
        await Promise.all([loadStats(), loadScopeStats(), loadUserAssignments()])
        
        setTimeout(() => setSuccess(false), 3000)
      }
    } catch (err) {
      console.error('Error assigning tasks:', err)
      alert('Ошибка при назначении задач')
    } finally {
      setLoading(false)
    }
  }

  const handleReassign = async () => {
    if (!fromUserId || !toUserId) {
      alert('Выберите пользователей для переназначения')
      return
    }

    if (fromUserId === toUserId) {
      alert('Выберите разных пользователей')
      return
    }

    setLoading(true)
    setSuccess(false)

    try {
      const response = await apiFetch('/api/admin/reassign-tasks', {
        method: 'POST',
        body: JSON.stringify({
          from_user_id: fromUserId,
          to_user_id: toUserId,
          task_count: parseInt(reassignCount)
        })
      })

      if (response.success) {
        setSuccess(true)
        setFromUserId('')
        setToUserId('')
        await Promise.all([loadStats(), loadUserAssignments()])
        
        setTimeout(() => setSuccess(false), 3000)
      }
    } catch (err) {
      console.error('Error reassigning tasks:', err)
      alert('Ошибка при переназначении задач')
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

  const toggleStep = (stepId: string) => {
    setSelectedSteps(prev =>
      prev.includes(stepId)
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    )
  }

  const selectAllSteps = () => {
    setSelectedSteps(STEP_TYPES.map(s => s.id))
  }

  const clearSteps = () => {
    setSelectedSteps([])
  }

  const toggleFilterScope = (stepId: string) => {
    setFilterByExistingScope(prev =>
      prev.includes(stepId)
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    )
  }

  const getScopeKey = (steps: string[]) => {
    return [...steps].sort().join('+')
  }

  const getScopeDisplay = (steps: string[]) => {
    if (steps.length === 0) return 'Не выбрано'
    if (steps.length === STEP_TYPES.length) return 'Полный цикл'
    return steps.map(id => STEP_TYPES.find(s => s.id === id)?.shortName || id).join(' + ')
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Управление задачами</h1>
        <p className="text-gray-600 mt-2">Назначение и переназначение задач между аннотаторами</p>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-2">
        <Button
          variant={mode === 'assign' ? 'default' : 'outline'}
          onClick={() => setMode('assign')}
        >
          <Package className="w-4 h-4 mr-2" />
          Назначить задачи
        </Button>
        <Button
          variant={mode === 'reassign' ? 'default' : 'outline'}
          onClick={() => setMode('reassign')}
        >
          <ArrowRightLeft className="w-4 h-4 mr-2" />
          Переназначить
        </Button>
        <Button
          variant={mode === 'view' ? 'default' : 'outline'}
          onClick={() => setMode('view')}
        >
          <Users className="w-4 h-4 mr-2" />
          Обзор
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
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
                  <p className="text-3xl font-bold text-amber-600">
                    {stats.total - stats.pending - stats.in_progress - stats.completed}
                  </p>
                </div>
                <AlertCircle className="w-10 h-10 text-amber-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">В работе</p>
                  <p className="text-3xl font-bold text-blue-600">{stats.in_progress}</p>
                </div>
                <Users className="w-10 h-10 text-blue-400" />
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

      {/* Scope Statistics */}
      {mode === 'view' && scopeStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Статистика по типам задач</CardTitle>
            <CardDescription>Распределение задач по комбинациям проверок</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scopeStats.map((stat) => (
                <div key={stat.scope_key} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {stat.scope_names.map((name) => {
                        const stepType = STEP_TYPES.find(s => s.name === name)
                        const Icon = stepType?.icon || Package
                        return (
                          <div
                            key={name}
                            className={`p-2 rounded ${stepType?.bgColor || 'bg-gray-100'}`}
                          >
                            <Icon className={`w-4 h-4 ${stepType?.color || 'text-gray-600'}`} />
                          </div>
                        )
                      })}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{stat.scope_names.join(' + ')}</p>
                      <p className="text-sm text-gray-500">
                        {stat.total} задач ({stat.assigned} назначено, {stat.unassigned} свободно)
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline">{stat.total} всего</Badge>
                    <Badge variant="secondary">{stat.unassigned} свободно</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* User Assignments */}
      {mode === 'view' && userAssignments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Назначения по пользователям</CardTitle>
            <CardDescription>Сколько задач назначено каждому аннотатору</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {userAssignments.map((assignment) => (
                <div key={assignment.user_id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">{assignment.user_email}</p>
                      <p className="text-sm text-gray-500">{assignment.task_count} задач</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {Object.entries(assignment.by_scope).map(([scopeKey, count]) => {
                      const scopeNames = scopeKey.split('+')
                      return (
                        <Badge key={scopeKey} variant="outline">
                          {scopeNames.map(name => STEP_TYPES.find(s => s.id === name)?.shortName || name).join('+')} ({count})
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assignment Form */}
      {mode === 'assign' && (
        <Card>
          <CardHeader>
            <CardTitle>Назначение новых задач</CardTitle>
            <CardDescription>Выберите аннотаторов, типы проверок и фильтры</CardDescription>
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

            {/* Filter by Existing Scope */}
            <div className="border-t pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-gray-500" />
                <Label className="text-base">Фильтр: назначить задачи, у которых УЖЕ есть</Label>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                Выберите какие проверки уже должны быть в задачах. Пусто = любые задачи.
              </p>
              
              <div className="grid grid-cols-3 gap-3">
                {STEP_TYPES.map((stepType) => {
                  const Icon = stepType.icon
                  const isSelected = filterByExistingScope.includes(stepType.id)
                  
                  return (
                    <div
                      key={stepType.id}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? 'border-purple-300 bg-purple-50' 
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                      onClick={() => toggleFilterScope(stepType.id)}
                    >
                      <Checkbox 
                        checked={isSelected} 
                        onCheckedChange={() => toggleFilterScope(stepType.id)}
                      />
                      <Icon className={`w-4 h-4 ${isSelected ? 'text-purple-600' : 'text-gray-400'}`} />
                      <p className={`text-sm font-medium ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
                        {stepType.name}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Step Types Selection */}
            <div className="border-t pt-6">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base">Назначить проверки ({selectedSteps.length} выбрано)</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllSteps}>
                    Все
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearSteps}>
                    Сбросить
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {STEP_TYPES.map((stepType) => {
                  const Icon = stepType.icon
                  const isSelected = selectedSteps.includes(stepType.id)
                  
                  return (
                    <div
                      key={stepType.id}
                      className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? `${stepType.borderColor} ${stepType.bgColor}` 
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                      onClick={() => toggleStep(stepType.id)}
                    >
                      <Checkbox 
                        checked={isSelected} 
                        onCheckedChange={() => toggleStep(stepType.id)}
                      />
                      <Icon className={`w-5 h-5 ${isSelected ? stepType.color : 'text-gray-400'}`} />
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
                          {stepType.name}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Parameters Grid */}
            <div className="grid grid-cols-2 gap-4">
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
                    <SelectItem value="100">100 задач</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
            </div>

            {/* Submit */}
            <div className="pt-4 border-t space-y-3">
              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Аннотаторов:</span>
                  <span className="font-semibold text-gray-900">{selectedUsers.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Задач на каждого:</span>
                  <span className="font-semibold text-gray-900">{taskCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Фильтр (уже есть):</span>
                  <span className="font-semibold text-gray-900">
                    {filterByExistingScope.length === 0 
                      ? 'Любые' 
                      : getScopeDisplay(filterByExistingScope)
                    }
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Назначить проверки:</span>
                  <span className="font-semibold text-gray-900">
                    {getScopeDisplay(selectedSteps)}
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-sm text-gray-600">Всего будет назначено:</span>
                  <span className="text-lg font-bold text-blue-600">
                    {selectedUsers.length * parseInt(taskCount)} задач
                  </span>
                </div>
              </div>
              
              {/* Action Button */}
              <Button 
                onClick={handleAssign} 
                disabled={loading || selectedUsers.length === 0 || selectedSteps.length === 0}
                size="lg"
                className="w-full"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {success ? '✓ Назначено!' : 'Назначить задачи'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reassignment Form */}
      {mode === 'reassign' && (
        <Card>
          <CardHeader>
            <CardTitle>Переназначение задач</CardTitle>
            <CardDescription>Перенести задачи от одного пользователя к другому</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>От пользователя</Label>
                <Select value={fromUserId} onValueChange={setFromUserId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Выберите пользователя" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers.map((user) => {
                      const assignment = userAssignments.find(a => a.user_id === user.id)
                      return (
                        <SelectItem key={user.id} value={user.id}>
                          {user.email} {assignment ? `(${assignment.task_count} задач)` : ''}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>К пользователю</Label>
                <Select value={toUserId} onValueChange={setToUserId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Выберите пользователя" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers.map((user) => {
                      const assignment = userAssignments.find(a => a.user_id === user.id)
                      return (
                        <SelectItem key={user.id} value={user.id}>
                          {user.email} {assignment ? `(${assignment.task_count} задач)` : ''}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Количество задач для переназначения</Label>
              <Select value={reassignCount} onValueChange={setReassignCount}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 задач</SelectItem>
                  <SelectItem value="10">10 задач</SelectItem>
                  <SelectItem value="20">20 задач</SelectItem>
                  <SelectItem value="50">50 задач</SelectItem>
                  <SelectItem value="all">Все задачи</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleReassign} 
              disabled={loading || !fromUserId || !toUserId}
              size="lg"
              className="w-full"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {success ? '✓ Переназначено!' : 'Переназначить задачи'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
