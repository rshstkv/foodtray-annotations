'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

export default function CreateUserPage() {
  const router = useRouter()
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
        alert(`Ошибка: ${data.error}`)
      } else {
        alert('Пользователь создан')
        router.push('/admin')
      }
    } catch (err) {
      alert('Ошибка сети')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <Card className="p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6">Создать пользователя</h1>
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
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/admin')}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button type="submit" disabled={creating} className="flex-1">
              {creating ? 'Создание...' : 'Создать'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

