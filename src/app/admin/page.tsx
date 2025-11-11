'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { UserNav } from '@/components/UserNav'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  email: string
  role: 'admin' | 'annotator'
  full_name?: string
  is_active: boolean
  created_at: string
}

export default function AdminPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Assignment state
  const [assignMode, setAssignMode] = useState<'quick' | 'edit'>('quick')
  const [assignCount, setAssignCount] = useState(10)
  const [assignUserId, setAssignUserId] = useState('')
  const [assignTaskQueue, setAssignTaskQueue] = useState<string>('dish_validation')
  const [assigning, setAssigning] = useState(false)

  // New user state
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'annotator'>('annotator')
  const [newFullName, setNewFullName] = useState('')
  const [creating, setCreating] = useState(false)

  // Password generation state
  const [generatingPassword, setGeneratingPassword] = useState<string | null>(null)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [copiedPassword, setCopiedPassword] = useState(false)

  // Tasks by user stats
  const [tasksByUser, setTasksByUser] = useState<any>(null)
  
  // Assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignModalUserId, setAssignModalUserId] = useState('')

  useEffect(() => {
    fetchUsers()
    fetchTasksByUser()
    
    // Обновляем данные при возврате на страницу
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchUsers()
        fetchTasksByUser()
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const fetchTasksByUser = async () => {
    try {
      const res = await fetch('/api/admin/tasks-by-user')
      if (res.ok) {
        const data = await res.json()
        setTasksByUser(data)
      }
    } catch (err) {
      console.error('Error fetching tasks by user:', err)
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to fetch users')
        setLoading(false)
        return
      }
      const data = await res.json()
      setUsers(data.users || [])
      if (data.users.length > 0 && !assignUserId) {
        setAssignUserId(data.users[0].id)
      }
      setLoading(false)
    } catch (err) {
      setError('Network error')
      setLoading(false)
    }
  }

  const handleAssign = async () => {
    if (!assignUserId) {
      alert('Выберите пользователя')
      return
    }

    setAssigning(true)
    try {
      const res = await fetch('/api/admin/assign-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: assignMode,
          count: assignCount,
          userId: assignUserId,
          taskQueue: assignTaskQueue
        })
      })

      const data = await res.json()
      if (!res.ok) {
        alert(`Ошибка: ${data.error}`)
      } else {
        alert(`Назначено ${data.assigned} задач`)
        // Обновляем статистику после назначения
        fetchTasksByUser()
      }
    } catch (err) {
      alert('Ошибка сети')
    } finally {
      setAssigning(false)
    }
  }

  const handleGeneratePassword = async (userId: string) => {
    setGeneratingPassword(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      const data = await res.json()
      if (!res.ok) {
        alert(`Ошибка: ${data.error}`)
      } else {
        setGeneratedPassword(data.password)
        // Автоматически копируем пароль
        await navigator.clipboard.writeText(data.password)
        setCopiedPassword(true)
        setTimeout(() => setCopiedPassword(false), 3000)
      }
    } catch (err) {
      alert('Ошибка сети')
    } finally {
      setGeneratingPassword(null)
    }
  }

  const handleCopyPassword = async (password: string) => {
    try {
      await navigator.clipboard.writeText(password)
      setCopiedPassword(true)
      setTimeout(() => setCopiedPassword(false), 2000)
    } catch (err) {
      alert('Не удалось скопировать')
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newEmail || !newPassword) {
      alert('Email и пароль обязательны')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: newRole,
          full_name: newFullName || undefined
        })
      })

      const data = await res.json()
      if (!res.ok) {
        alert(`Ошибка: ${data.error}`)
      } else {
        alert(`Пользователь создан: ${newEmail}`)
        setNewEmail('')
        setNewPassword('')
        setNewFullName('')
        setNewRole('annotator')
        fetchUsers()
      }
    } catch (err) {
      alert('Ошибка сети')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Загрузка...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8">
          <h2 className="text-xl font-bold text-red-600 mb-4">Ошибка</h2>
          <p>{error}</p>
          <Button onClick={() => router.push('/annotations/tasks')} className="mt-4">
            Вернуться к задачам
          </Button>
        </Card>
      </div>
    )
  }

  const getUserStats = (userId: string) => {
    const found = tasksByUser?.userStats.find((s: any) => s.userId === userId)
    return found?.tasks || {
      quick_validation: 0,
      edit_mode: 0,
      check_errors: 0,
      buzzer: 0,
      other_items: 0,
      total: 0,
      completed: 0
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Админ панель</h1>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.push('/annotations/tasks')}>
              К задачам →
            </Button>
            <UserNav />
          </div>
        </div>

        {/* Unassigned tasks bar */}
        {tasksByUser && tasksByUser.unassigned.total > 0 && (
          <div className="mb-6 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">🆓 Неназначенные задачи:</span>
                <span className="text-sm font-semibold text-blue-600">{tasksByUser.unassigned.total}</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                {tasksByUser.unassigned.quick_validation > 0 && (
                  <span className="text-gray-600">
                    Quick: <strong className="text-green-600">{tasksByUser.unassigned.quick_validation}</strong>
                  </span>
                )}
                {tasksByUser.unassigned.edit_mode > 0 && (
                  <span className="text-gray-600">
                    Edit: <strong className="text-blue-600">{tasksByUser.unassigned.edit_mode}</strong>
                  </span>
                )}
                {tasksByUser.unassigned.check_errors > 0 && (
                  <span className="text-gray-600">
                    Чек: <strong className="text-yellow-600">{tasksByUser.unassigned.check_errors}</strong>
                  </span>
                )}
                {tasksByUser.unassigned.buzzer > 0 && (
                  <span className="text-gray-600">
                    Баззер: <strong className="text-purple-600">{tasksByUser.unassigned.buzzer}</strong>
                  </span>
                )}
                {tasksByUser.unassigned.other_items > 0 && (
                  <span className="text-gray-600">
                    Предметы: <strong className="text-orange-600">{tasksByUser.unassigned.other_items}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Password notification */}
        {generatedPassword && (
          <div className="mb-4 flex items-center gap-2 bg-green-50 px-4 py-3 rounded-lg border border-green-200">
            <span className="text-sm text-gray-700">Новый пароль:</span>
            <span className="text-sm font-mono font-semibold text-green-800">{generatedPassword}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCopyPassword(generatedPassword)}
              className="h-7 ml-auto"
            >
              {copiedPassword ? '✓ Скопировано' : '📋 Копировать'}
            </Button>
          </div>
        )}

        {/* Main users table */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Пользователи</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                fetchUsers()
                fetchTasksByUser()
              }}>
                ↻ Обновить
              </Button>
              <Button size="sm" onClick={() => router.push('/admin/create-user')}>
                + Создать пользователя
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-gray-700">Пользователь</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-700">Назначено</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-700">Всего</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-700">Выполнено</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-700">Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const stats = getUserStats(user.id)
                  return (
                    <tr key={user.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{user.email}</span>
                            {user.role === 'admin' && (
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded font-medium">
                                admin
                              </span>
                            )}
                          </div>
                          {user.full_name && <div className="text-xs text-gray-500">{user.full_name}</div>}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        {stats.total > 0 ? (
                          <div className="flex items-center gap-2 text-xs">
                            {stats.quick_validation > 0 && (
                              <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                                Q: {stats.quick_validation}
                              </span>
                            )}
                            {stats.edit_mode > 0 && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                E: {stats.edit_mode}
                              </span>
                            )}
                            {stats.check_errors > 0 && (
                              <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                                Чек: {stats.check_errors}
                              </span>
                            )}
                            {stats.buzzer > 0 && (
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                                Б: {stats.buzzer}
                              </span>
                            )}
                            {stats.other_items > 0 && (
                              <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">
                                П: {stats.other_items}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">Нет задач</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className="font-semibold text-gray-900">{stats.total}</span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className="text-green-600 font-semibold">{stats.completed || 0}</span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAssignModalUserId(user.id)
                              setAssignUserId(user.id)
                              setAssignModalOpen(true)
                            }}
                            className="text-xs h-7"
                          >
                            Назначить
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGeneratePassword(user.id)}
                            disabled={generatingPassword === user.id}
                            className="text-xs h-7"
                          >
                            {generatingPassword === user.id ? '...' : '🔑'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Assignment Modal */}
        {assignModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Назначить задачи</h2>
                <button
                  onClick={() => setAssignModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {/* Available tasks info */}
              {tasksByUser && tasksByUser.unassigned.total > 0 && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm">
                  <div className="font-medium text-gray-700 mb-2">Доступно для назначения:</div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {tasksByUser.unassigned.quick_validation > 0 && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
                        Quick: {tasksByUser.unassigned.quick_validation}
                      </span>
                    )}
                    {tasksByUser.unassigned.edit_mode > 0 && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                        Edit: {tasksByUser.unassigned.edit_mode}
                      </span>
                    )}
                    {tasksByUser.unassigned.check_errors > 0 && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                        Чек: {tasksByUser.unassigned.check_errors}
                      </span>
                    )}
                    {tasksByUser.unassigned.buzzer > 0 && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
                        Баззер: {tasksByUser.unassigned.buzzer}
                      </span>
                    )}
                    {tasksByUser.unassigned.other_items > 0 && (
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded">
                        Предметы: {tasksByUser.unassigned.other_items}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Тип очереди</label>
                  <select
                    value={assignTaskQueue}
                    onChange={e => setAssignTaskQueue(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="dish_validation">Проверка блюд</option>
                    <option value="check_error">Проверка чека</option>
                    <option value="buzzer">Разметка баззеров</option>
                    <option value="other_items">Другие предметы</option>
                  </select>
                </div>
                {assignTaskQueue === 'dish_validation' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Режим</label>
                    <select
                      value={assignMode}
                      onChange={e => setAssignMode(e.target.value as 'quick' | 'edit')}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    >
                      <option value="quick">Quick</option>
                      <option value="edit">Edit</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Количество задач</label>
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    value={assignCount}
                    onChange={e => setAssignCount(Number(e.target.value))}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setAssignModalOpen(false)}
                    className="flex-1"
                  >
                    Отмена
                  </Button>
                  <Button
                    onClick={async () => {
                      await handleAssign()
                      setAssignModalOpen(false)
                    }}
                    disabled={assigning}
                    className="flex-1"
                  >
                    {assigning ? 'Назначение...' : 'Назначить'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

