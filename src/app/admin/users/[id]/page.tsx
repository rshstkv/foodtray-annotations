'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'
import { ArrowLeft, Save, Key, Trash2, Copy, Check, Mail } from 'lucide-react'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface UserProfile {
  id: string
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  created_at: string
}

interface UserStats {
  total: number
  completed: number
  in_progress: number
  pending: number
}

export default function UserProfilePage() {
  const router = useRouter()
  const params = useParams()
  const userId = params.id as string
  const { user: currentUser, isAdmin } = useUser()
  
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Форма редактирования
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'admin' | 'annotator'>('annotator')
  
  // Диалоги
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [passwordCopied, setPasswordCopied] = useState(false)

  useEffect(() => {
    if (isAdmin) {
      loadUserProfile()
    }
  }, [isAdmin, userId])

  const loadUserProfile = async () => {
    try {
      setLoading(true)
      const response = await apiFetch<{ user: UserProfile; stats: UserStats }>(
        `/api/admin/users/${userId}`
      )
      
      if (response.success && response.data) {
        const { user, stats } = response.data
        setProfile(user)
        setStats(stats)
        setEmail(user.email)
        setFullName(user.full_name || '')
        setRole(user.role as 'admin' | 'annotator')
      }
    } catch (err) {
      console.error('Error loading user profile:', err)
      alert('Ошибка загрузки профиля пользователя')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      
      const response = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email,
          full_name: fullName,
          role,
        }),
      })
      
      if (response.success) {
        alert('Профиль успешно обновлен')
        await loadUserProfile()
      }
    } catch (err) {
      console.error('Error updating user:', err)
      alert('Ошибка обновления профиля')
    } finally {
      setSaving(false)
    }
  }

  const handleGeneratePassword = async () => {
    try {
      const response = await apiFetch<{ password: string }>(
        `/api/admin/users/${userId}/password`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      )
      
      if (response.success && response.data) {
        setGeneratedPassword(response.data.password)
        setPasswordCopied(false)
        alert('Новый пароль сгенерирован')
      }
    } catch (err) {
      console.error('Error generating password:', err)
      alert('Ошибка генерации пароля')
    }
  }

  const handleSetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert('Пароль должен содержать минимум 6 символов')
      return
    }

    try {
      const response = await apiFetch(
        `/api/admin/users/${userId}/password`,
        {
          method: 'POST',
          body: JSON.stringify({ password: newPassword }),
        }
      )
      
      if (response.success) {
        alert('Пароль успешно изменен')
        setShowPasswordDialog(false)
        setNewPassword('')
      }
    } catch (err) {
      console.error('Error setting password:', err)
      alert('Ошибка изменения пароля')
    }
  }

  const handleSendResetEmail = async () => {
    try {
      const response = await apiFetch<{ message: string }>(
        `/api/admin/users/${userId}/reset-password-email`,
        {
          method: 'POST',
        }
      )
      
      if (response.success && response.data) {
        alert(response.data.message)
      }
    } catch (err) {
      console.error('Error sending reset email:', err)
      alert('Ошибка отправки письма')
    }
  }

  const handleDelete = async () => {
    try {
      const response = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      })
      
      if (response.success) {
        alert('Пользователь удален')
        router.push('/admin/users')
      }
    } catch (err) {
      console.error('Error deleting user:', err)
      alert('Ошибка удаления пользователя')
    }
  }

  const copyPassword = () => {
    navigator.clipboard.writeText(generatedPassword)
    setPasswordCopied(true)
    setTimeout(() => setPasswordCopied(false), 2000)
  }

  if (!currentUser || !isAdmin) {
    return <div>Loading...</div>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-gray-900 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-500">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-gray-900 font-medium mb-4">Пользователь не найден</p>
          <Button 
            onClick={() => router.push('/admin/users')} 
            variant="outline"
            className="text-sm"
          >
            Вернуться к списку
          </Button>
        </div>
      </div>
    )
  }

  const isCurrentUser = currentUser.id === userId

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <button
            onClick={() => router.push('/admin/users')}
            className="group flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            <span>Назад к списку</span>
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                {profile.full_name || 'Профиль пользователя'}
              </h1>
              <p className="text-sm text-gray-500 mt-1.5">
                {profile.email}
              </p>
            </div>
            
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
              profile.role === 'admin' 
                ? 'bg-gray-900 text-white' 
                : 'bg-gray-100 text-gray-700'
            }`}>
              {profile.role === 'admin' ? 'Администратор' : 'Аннотатор'}
            </span>
          </div>
        </div>

        <div className="space-y-8">
        {/* Статистика */}
        {stats && (
          <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
            <h2 className="text-base font-medium text-gray-900 mb-6">Статистика задач</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="text-3xl font-semibold text-gray-900 tracking-tight">{stats.total}</div>
                <div className="text-sm text-gray-500 mt-1">Всего</div>
              </div>
              <div>
                <div className="text-3xl font-semibold text-gray-900 tracking-tight">{stats.completed}</div>
                <div className="text-sm text-gray-500 mt-1">Завершено</div>
              </div>
              <div>
                <div className="text-3xl font-semibold text-gray-900 tracking-tight">{stats.in_progress}</div>
                <div className="text-sm text-gray-500 mt-1">В работе</div>
              </div>
              <div>
                <div className="text-3xl font-semibold text-gray-900 tracking-tight">{stats.pending}</div>
                <div className="text-sm text-gray-500 mt-1">Ожидают</div>
              </div>
            </div>
          </div>
        )}

        {/* Основная информация */}
        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
          <h2 className="text-base font-medium text-gray-900 mb-6">Основная информация</h2>
          
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="h-10 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-medium text-gray-700">Полное имя</Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Иван Иванов"
                className="h-10 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role" className="text-sm font-medium text-gray-700">Роль</Label>
              <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'annotator')}>
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annotator">Аннотатор</SelectItem>
                  <SelectItem value="admin">Администратор</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <Button 
                onClick={handleSave} 
                disabled={saving} 
                className="h-10 text-sm font-medium rounded-lg"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Сохранение...' : 'Сохранить изменения'}
              </Button>
            </div>
          </div>
        </div>

        {/* Управление паролем */}
        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
          <h2 className="text-base font-medium text-gray-900 mb-6">Управление паролем</h2>
          
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => setShowPasswordDialog(true)}
                variant="outline"
                className="h-10 text-sm font-medium rounded-lg"
              >
                <Key className="w-3.5 h-3.5 mr-2" />
                Установить пароль
              </Button>
              
              <Button
                onClick={handleGeneratePassword}
                variant="outline"
                className="h-10 text-sm font-medium rounded-lg"
              >
                <Key className="w-3.5 h-3.5 mr-2" />
                Сгенерировать
              </Button>

              <Button
                onClick={handleSendResetEmail}
                variant="outline"
                className="h-10 text-sm font-medium rounded-lg"
              >
                <Mail className="w-3.5 h-3.5 mr-2" />
                Отправить письмо
              </Button>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              При отправке письма пользователь получит email со ссылкой для самостоятельного сброса пароля
            </p>

            {generatedPassword && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-700 mb-3 font-medium">
                  Новый пароль сгенерирован
                </p>
                <div className="flex gap-2">
                  <code className="flex-1 px-3 py-2 bg-white rounded-lg border border-gray-200 text-sm font-mono text-gray-900">
                    {generatedPassword}
                  </code>
                  <Button
                    size="sm"
                    onClick={copyPassword}
                    variant={passwordCopied ? 'default' : 'outline'}
                    className="h-9 text-sm rounded-lg"
                  >
                    {passwordCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1.5" />
                        Скопировано
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1.5" />
                        Копировать
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Сохраните этот пароль — он больше не будет показан
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Метаданные */}
        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
          <h2 className="text-base font-medium text-gray-900 mb-6">Метаданные</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-sm text-gray-600">ID пользователя</span>
              <code className="text-xs bg-gray-50 text-gray-900 px-3 py-1.5 rounded-md border border-gray-200 font-mono">
                {profile.id}
              </code>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-600">Дата создания</span>
              <span className="text-sm text-gray-900 font-medium">
                {new Date(profile.created_at).toLocaleString('ru-RU', { 
                  year: 'numeric',
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Опасная зона */}
        {!isCurrentUser && (
          <div className="bg-white border border-red-200 rounded-xl p-8 shadow-sm">
            <h2 className="text-base font-medium text-red-600 mb-3">Опасная зона</h2>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              Удаление пользователя необратимо. Все данные пользователя будут удалены без возможности восстановления.
            </p>
            <Button
              onClick={() => setShowDeleteDialog(true)}
              variant="destructive"
              className="h-10 text-sm font-medium rounded-lg"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Удалить пользователя
            </Button>
          </div>
        )}
      </div>

      {/* Диалог установки пароля */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Установить новый пароль</DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              Введите новый пароль для пользователя. Минимум 6 символов.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-2">
            <Label htmlFor="newPassword" className="text-sm font-medium text-gray-700">
              Новый пароль
            </Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              className="h-10 rounded-lg"
            />
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowPasswordDialog(false)}
              className="h-10 text-sm rounded-lg"
            >
              Отмена
            </Button>
            <Button 
              onClick={handleSetPassword}
              className="h-10 text-sm rounded-lg"
            >
              Установить пароль
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог удаления */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Удалить пользователя?</DialogTitle>
            <DialogDescription className="text-sm text-gray-600 leading-relaxed">
              Это действие необратимо. Все данные пользователя <strong className="font-semibold text-gray-900">{profile.email}</strong> будут удалены без возможности восстановления.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteDialog(false)}
              className="h-10 text-sm rounded-lg"
            >
              Отмена
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              className="h-10 text-sm rounded-lg"
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}

