'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'
import { UserPlus, Eye } from 'lucide-react'
import { CreateUserDialog } from '@/components/admin/CreateUserDialog'

interface User {
  id: string
  email: string
  full_name: string | null
  role: string
  created_at: string
}

export default function AdminUsersPage() {
  const router = useRouter()
  const { user, isAdmin } = useUser()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  useEffect(() => {
    if (isAdmin) {
      loadUsers()
    }
  }, [isAdmin])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const response = await apiFetch<{ users: User[] }>('/api/admin/users')
      
      if (response.success && response.data) {
        setUsers(response.data.users || [])
      }
    } catch (err) {
      console.error('Error loading users:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!user || !isAdmin) {
    return <div>Loading...</div>
  }

  return (
    <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Пользователи</h1>
              <p className="text-gray-600 mt-2 text-base">Управление пользователями системы</p>
            </div>
            
            <Button onClick={() => setCreateDialogOpen(true)} className="h-10 rounded-lg">
              <UserPlus className="w-4 h-4 mr-2" />
              Создать пользователя
            </Button>
          </div>

          {/* Overview Cards */}
          {!loading && users.length > 0 && (
            <div className="grid grid-cols-3 gap-6 mb-8">
              <Card className="p-6">
                <div className="text-sm text-gray-600 mb-1 font-medium">Всего пользователей</div>
                <div className="text-3xl font-bold text-gray-900">{users.length}</div>
              </Card>
              <Card className="p-6 border-purple-200 bg-purple-50">
                <div className="text-sm text-purple-700 mb-1 font-medium">Администраторов</div>
                <div className="text-3xl font-bold text-purple-900">
                  {users.filter(u => u.role === 'admin').length}
                </div>
              </Card>
              <Card className="p-6 border-blue-200 bg-blue-50">
                <div className="text-sm text-blue-700 mb-1 font-medium">Аннотаторов</div>
                <div className="text-3xl font-bold text-blue-900">
                  {users.filter(u => u.role === 'annotator').length}
                </div>
              </Card>
            </div>
          )}

          {/* Users table */}
          {loading ? (
            <Card className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Загрузка...</p>
            </Card>
          ) : (
            <Card className="rounded-xl shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Имя
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Роль
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Дата создания
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Действия
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">{u.email}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">{u.full_name || '—'}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {u.role === 'admin' ? 'Админ' : 'Аннотатор'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(u.created_at).toLocaleDateString('ru-RU')}
                        </td>
                        <td className="px-6 py-4 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => router.push(`/admin/users/${u.id}`)}
                            className="rounded-lg"
                            >
                            <Eye className="w-4 h-4 mr-1" />
                              Просмотр
                            </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <CreateUserDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            onUserCreated={loadUsers}
          />
        </div>
  )
}

