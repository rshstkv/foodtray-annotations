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
  const [assigning, setAssigning] = useState(false)

  // New user state
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'annotator'>('annotator')
  const [newFullName, setNewFullName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchUsers()
  }, [])

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
          userId: assignUserId
        })
      })

      const data = await res.json()
      if (!res.ok) {
        alert(`Ошибка: ${data.error}`)
      } else {
        alert(`Назначено ${data.assigned} задач в режиме ${assignMode}`)
      }
    } catch (err) {
      alert('Ошибка сети')
    } finally {
      setAssigning(false)
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Админ панель</h1>
          <UserNav />
        </div>

        {/* Users section */}
        <Card className="p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Пользователи</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Email</th>
                  <th className="text-left py-2 px-3">Имя</th>
                  <th className="text-left py-2 px-3">Роль</th>
                  <th className="text-left py-2 px-3">Активен</th>
                  <th className="text-left py-2 px-3">Создан</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{user.email}</td>
                    <td className="py-2 px-3">{user.full_name || '—'}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        user.role === 'admin' 
                          ? 'bg-purple-100 text-purple-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-2 px-3">{user.is_active ? '✅' : '❌'}</td>
                    <td className="py-2 px-3 text-sm text-gray-600">
                      {new Date(user.created_at).toLocaleDateString('ru-RU')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-6">
          {/* Create user section */}
          <Card className="p-6">
            <h2 className="text-2xl font-semibold mb-4">Создать пользователя</h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Пароль</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Имя (опционально)</label>
                <Input
                  type="text"
                  value={newFullName}
                  onChange={e => setNewFullName(e.target.value)}
                  placeholder="Иван Иванов"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Роль</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as 'admin' | 'annotator')}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="annotator">Annotator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <Button type="submit" disabled={creating} className="w-full">
                {creating ? 'Создание...' : 'Создать пользователя'}
              </Button>
            </form>
          </Card>

          {/* Assign tasks section */}
          <Card className="p-6">
            <h2 className="text-2xl font-semibold mb-4">Назначить задачи</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Режим</label>
                <select
                  value={assignMode}
                  onChange={e => setAssignMode(e.target.value as 'quick' | 'edit')}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="quick">Quick (быстрая проверка)</option>
                  <option value="edit">Edit (редактирование)</option>
                </select>
              </div>
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
              <div>
                <label className="block text-sm font-medium mb-1">Пользователь</label>
                <select
                  value={assignUserId}
                  onChange={e => setAssignUserId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {users.filter(u => u.is_active).map(u => (
                    <option key={u.id} value={u.id}>
                      {u.email} {u.full_name ? `(${u.full_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={handleAssign}
                disabled={assigning || !assignUserId}
                className="w-full"
              >
                {assigning ? 'Назначение...' : 'Назначить задачи'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

