'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api-response'
import { AlertCircle } from 'lucide-react'

interface PasswordSetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userEmail: string
}

export function PasswordSetDialog({ 
  open, 
  onOpenChange, 
  userId, 
  userEmail 
}: PasswordSetDialogProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClose = () => {
    setPassword('')
    setConfirmPassword('')
    setError('')
    onOpenChange(false)
  }

  const validateForm = () => {
    if (!password) {
      setError('Пароль обязателен')
      return false
    }
    if (password.length < 8) {
      setError('Пароль должен быть минимум 8 символов')
      return false
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают')
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    setError('')

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const response = await apiFetch(`/api/admin/users/${userId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (response.success) {
        handleClose()
        // Можно показать уведомление об успехе
      } else {
        setError('error' in response ? response.error : 'Ошибка установки пароля')
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка установки пароля')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Установить новый пароль</DialogTitle>
          <DialogDescription>
            Введите новый пароль для пользователя {userEmail}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="bg-yellow-50 border border-yellow-200 px-4 py-3 rounded-lg">
            <p className="text-sm text-yellow-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Старый пароль перестанет работать
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Новый пароль *</Label>
            <Input
              id="password"
              type="password"
              placeholder="Минимум 8 символов"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Подтвердите пароль *</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Повторите пароль"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Сохранение...' : 'Установить пароль'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

