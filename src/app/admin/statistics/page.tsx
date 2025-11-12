'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'

interface User {
  id: string
  email: string
  full_name: string | null
}

interface Stats {
  total_tasks: number
  completed_tasks: number
  in_progress_tasks: number
  pending_tasks: number
  completion_rate: number
  by_scope: Record<string, number>
}

export default function AdminStatisticsPage() {
  const { user, isAdmin } = useUser()
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('all')
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)

  // Инициализируем selectedUserId для обычного пользователя
  useEffect(() => {
    if (user && !isAdmin) {
      setSelectedUserId(user.id)
    }
  }, [user, isAdmin])

  useEffect(() => {
    if (isAdmin) {
      loadUsers()
    }
  }, [isAdmin])

  useEffect(() => {
    if (selectedUserId) {
      loadStats(selectedUserId)
    } else {
      loadStats()
    }
  }, [selectedUserId])

  const loadUsers = async () => {
    try {
      const response = await apiFetch<{ users: User[] }>('/api/admin/users')
      if (response.success && response.data) {
        setUsers(response.data.users || [])
      }
    } catch (err) {
      console.error('Error loading users:', err)
    }
  }

  const loadStats = async (userId?: string) => {
    try {
      setLoading(true)
      const url = userId && userId !== 'all' ? `/api/tasks/list?userId=${userId}` : '/api/tasks/list'
      const response = await apiFetch<{ tasks: unknown[]; stats: Stats }>(url)
      
      if (response.success && response.data) {
        setStats(response.data.stats)
      }
    } catch (err) {
      console.error('Error loading stats:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Статистика</h1>
            <p className="text-gray-600">
              {isAdmin ? 'Аналитика выполнения задач' : 'Ваша статистика выполнения задач'}
            </p>
          </div>

          {/* User filter - только для админа */}
          {isAdmin && (
            <div className="mb-6">
              <div className="w-64">
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Все пользователи" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все пользователи</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Stats */}
          {loading ? (
            <Card className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            </Card>
          ) : stats ? (
            <div className="space-y-6">
              {/* Overview */}
              <div className="grid grid-cols-4 gap-4">
                <Card className="p-6">
                  <div className="text-sm text-gray-600 mb-1">Всего задач</div>
                  <div className="text-3xl font-bold">{stats.total_tasks}</div>
                </Card>
                <Card className="p-6 border-green-200 bg-green-50">
                  <div className="text-sm text-green-700 mb-1">Завершено</div>
                  <div className="text-3xl font-bold text-green-900">{stats.completed_tasks}</div>
                </Card>
                <Card className="p-6 border-blue-200 bg-blue-50">
                  <div className="text-sm text-blue-700 mb-1">В работе</div>
                  <div className="text-3xl font-bold text-blue-900">{stats.in_progress_tasks}</div>
                </Card>
                <Card className="p-6 border-amber-200 bg-amber-50">
                  <div className="text-sm text-amber-700 mb-1">Ожидают</div>
                  <div className="text-3xl font-bold text-amber-900">{stats.pending_tasks}</div>
                </Card>
              </div>

              {/* Completion rate */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Процент завершения</h3>
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-green-600 h-4 rounded-full"
                      style={{ width: `${stats.completion_rate}%` }}
                    />
                  </div>
                  <span className="text-2xl font-bold text-gray-900">
                    {stats.completion_rate?.toFixed(1) || '0.0'}%
                  </span>
                </div>
              </Card>

              {/* By scope */}
              {stats.by_scope && Object.keys(stats.by_scope).length > 0 && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">По скоупам</h3>
                  <div className="space-y-3">
                    {Object.entries(stats.by_scope).map(([scope, count]) => (
                      <div key={scope} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{scope}</span>
                        <span className="text-sm font-semibold">{count} задач</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          ) : null}
        </div>
  )
}

