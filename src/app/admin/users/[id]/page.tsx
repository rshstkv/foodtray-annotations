'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { ArrowLeft, Key, Trash2, Save } from 'lucide-react'
import { PasswordGenerateDialog } from '@/components/admin/PasswordGenerateDialog'
import { PasswordSetDialog } from '@/components/admin/PasswordSetDialog'

interface UserData {
  id: string
  email: string
  full_name: string | null
  role: string
  created_at: string
}

interface Stats {
  total: number
  completed: number
  in_progress: number
  pending: number
}

export default function UserDetailPage() {
  const router = useRouter()
  const params = useParams()
  const userId = params.id as string
  const { user: currentUser, isAdmin } = useUser()

  const [userData, setUserData] = useState<UserData | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Форма редактирования
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'admin' | 'annotator'>('annotator')

  // Диалоги паролей
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [setPasswordDialogOpen, setSetPasswordDialogOpen] = useState(false)

  // Диалог удаления
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (isAdmin) {
      loadUserData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, userId])

  const loadUserData = async () => {
    try {
      setLoading(true)
      setError('')

      const response = await apiFetch<{ user: UserData; stats: Stats }>(
        `/api/admin/users/${userId}`
      )

      if (response.success && response.data) {
        setUserData(response.data.user)
        setStats(response.data.stats)
        
        // Инициализировать форму
        setEmail(response.data.user.email)
        setFullName(response.data.user.full_name || '')
        setRole(response.data.user.role as 'admin' | 'annotator')
      } else {
        setError(response.error || 'Ошибка загрузки данных пользователя')
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных пользователя')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setError('')
    setSuccess('')

    if (!email.trim()) {
      setError('Email обязателен')
      return
    }

    try {
      setSaving(true)

      const response = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          full_name: fullName.trim() || null,
          role,
        }),
      })

      if (response.success) {
        setSuccess('Изменения сохранены')
        loadUserData()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(response.error || 'Ошибка сохранения')
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      setDeleting(true)

      const response = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      })

      if (response.success) {
        router.push('/admin/users')
      } else {
        setError(response.error || 'Ошибка удаления пользователя')
        setDeleteConfirmOpen(false)
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка удаления пользователя')
      setDeleteConfirmOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  if (!currentUser || !isAdmin) {
    return <div>Loading...</div>
  }

  if (loading) {
    return (
      <div className="p-8">
        <Card className="p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка...</p>
        </Card>
      </div>
    )
  }

  if (error && !userData) {
    return (
      <div className="p-8">
        <Card className="p-12 text-center">
          <p className="text-red-600">{error}</p>
          <Button onClick={() => router.back()} className="mt-4">
            Назад
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Пользователь</h1>
          <p className="text-gray-600 mt-1">{userData?.email}</p>
        </div>
      </div>

      {/* Сообщения */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-6">
          {success}
        </div>
      )}

      <div className="space-y-6">
        {/* Информация */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Информация</h2>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">ID:</span>
              <p className="font-mono text-xs mt-1">{userData?.id}</p>
            </div>
            <div>
              <span className="text-gray-600">Дата создания:</span>
              <p className="mt-1">
                {userData?.created_at && new Date(userData.created_at).toLocaleString('ru-RU')}
              </p>
            </div>
          </div>
        </Card>

        {/* Статистика задач */}
        {stats && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Статистика задач</h2>
            
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                <div className="text-sm text-gray-600">Всего</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                <div className="text-sm text-gray-600">Завершено</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.in_progress}</div>
                <div className="text-sm text-gray-600">В работе</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{stats.pending}</div>
                <div className="text-sm text-gray-600">Ожидает</div>
              </div>
            </div>
          </Card>
        )}

        {/* Редактирование */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Редактирование</h2>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Имя</Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Роль</Label>
              <Select 
                value={role} 
                onValueChange={(value: any) => setRole(value)} 
                disabled={saving}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annotator">Аннотатор</SelectItem>
                  <SelectItem value="admin">Администратор</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Сохранение...' : 'Сохранить изменения'}
            </Button>
          </div>
        </Card>

        {/* Управление паролем */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Управление паролем</h2>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setGenerateDialogOpen(true)}
              className="flex-1"
            >
              <Key className="w-4 h-4 mr-2" />
              Сгенерировать новый пароль
            </Button>
            <Button
              variant="outline"
              onClick={() => setSetPasswordDialogOpen(true)}
              className="flex-1"
            >
              <Key className="w-4 h-4 mr-2" />
              Установить пароль вручную
            </Button>
          </div>
        </Card>

        {/* Опасная зона */}
        {currentUser.id !== userId && (
          <Card className="p-6 border-red-200">
            <h2 className="text-lg font-semibold mb-4 text-red-600">Опасная зона</h2>
            
            {!deleteConfirmOpen ? (
              <Button
                variant="destructive"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Удалить пользователя
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-red-600">
                  Вы уверены? Это действие нельзя отменить.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? 'Удаление...' : 'Да, удалить'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDeleteConfirmOpen(false)}
                    disabled={deleting}
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Диалоги управления паролем */}
      {userData && (
        <>
          <PasswordGenerateDialog
            open={generateDialogOpen}
            onOpenChange={setGenerateDialogOpen}
            userId={userData.id}
            userEmail={userData.email}
          />
          <PasswordSetDialog
            open={setPasswordDialogOpen}
            onOpenChange={setSetPasswordDialogOpen}
            userId={userData.id}
            userEmail={userData.email}
          />
        </>
      )}
    </div>
  )
}
