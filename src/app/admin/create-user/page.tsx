'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export default function CreateUserPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'annotator'>('annotator')
  const [newFullName, setNewFullName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
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
          full_name: newFullName || null
        })
      })

      if (!res.ok) {
        const data = await res.json()
        toast({
          variant: 'destructive',
          title: 'Ошибка',
          description: data.error || 'Не удалось создать пользователя'
        })
      } else {
        toast({
          variant: 'success',
          title: 'Успешно',
          description: 'Пользователь создан'
        })
        router.push('/admin/users')
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Ошибка',
        description: 'Ошибка сети'
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <Card className="p-8 max-w-md w-full rounded-xl shadow-sm">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Создать пользователя</h1>
        <form onSubmit={handleCreateUser} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <Input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              className="h-10 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Пароль</label>
            <Input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="h-10 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Имя (опционально)</label>
            <Input
              type="text"
              value={newFullName}
              onChange={e => setNewFullName(e.target.value)}
              placeholder="Иван Иванов"
              className="h-10 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Роль</label>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value as 'admin' | 'annotator')}
              className="w-full h-10 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="annotator">Аннотатор</option>
              <option value="admin">Администратор</option>
            </select>
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/admin/users')}
              className="flex-1 h-10 rounded-lg"
            >
              Отмена
            </Button>
            <Button type="submit" disabled={creating} className="flex-1 h-10 rounded-lg">
              {creating ? 'Создание...' : 'Создать'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

