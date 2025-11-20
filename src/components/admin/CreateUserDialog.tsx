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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api-response'
import { Copy, Check, AlertCircle } from 'lucide-react'

interface CreateUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUserCreated: () => void
}

export function CreateUserDialog({ open, onOpenChange, onUserCreated }: CreateUserDialogProps) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'admin' | 'annotator'>('annotator')
  const [autoGenerate, setAutoGenerate] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdPassword, setCreatedPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const resetForm = () => {
    setEmail('')
    setFullName('')
    setRole('annotator')
    setAutoGenerate(true)
    setPassword('')
    setConfirmPassword('')
    setError('')
    setCreatedPassword(null)
    setCopied(false)
  }

  const handleClose = () => {
    resetForm()
    onOpenChange(false)
  }

  const validateForm = () => {
    if (!email.trim()) {
      setError('Email обязателен')
      return false
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Некорректный email')
      return false
    }

    if (!autoGenerate) {
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
    }

    return true
  }

  const handleSubmit = async () => {
    setError('')
    
    if (!validateForm()) {
      return
    }

    try {
      setLoading(true)

      const response = await apiFetch<{ user: any; password?: string }>('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          full_name: fullName.trim() || undefined,
          role,
          password: autoGenerate ? undefined : password,
        }),
      })

      if (response.success && response.data) {
        // Если пароль был сгенерирован, показываем его
        if (autoGenerate && response.data.password) {
          setCreatedPassword(response.data.password)
        } else {
          // Если пароль вводился вручную, сразу закрываем и обновляем список
          handleClose()
          onUserCreated()
        }
      } else {
        const errorMessage = !response.success && 'error' in response ? response.error : 'Ошибка создания пользователя'
        setError(errorMessage)
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка создания пользователя')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (createdPassword) {
      await navigator.clipboard.writeText(createdPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handlePasswordShown = () => {
    handleClose()
    onUserCreated()
  }

  // Если пароль создан и показан
  if (createdPassword) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Пользователь создан</DialogTitle>
            <DialogDescription>
              Сохраните пароль, он будет показан только один раз
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input value={email} readOnly className="bg-gray-50" />
            </div>

            <div className="space-y-2">
              <Label>Пароль</Label>
              <div className="flex gap-2">
                <Input
                  value={createdPassword}
                  readOnly
                  className="bg-yellow-50 border-yellow-300 font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-orange-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Пароль показывается только один раз. Скопируйте его сейчас.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handlePasswordShown} className="w-full">
              Понятно, я скопировал пароль
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Форма создания пользователя
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Создать пользователя</DialogTitle>
          <DialogDescription>
            Добавьте нового пользователя в систему
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Имя</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Иван Иванов"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Роль</Label>
            <Select value={role} onValueChange={(value: any) => setRole(value)} disabled={loading}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="annotator">Аннотатор</SelectItem>
                <SelectItem value="admin">Администратор</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Сгенерировать пароль автоматически</Label>
                <p className="text-xs text-gray-500">
                  Пароль будет создан системой и показан после создания
                </p>
              </div>
              <Switch
                checked={autoGenerate}
                onCheckedChange={setAutoGenerate}
                disabled={loading}
              />
            </div>

            {!autoGenerate && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="password">Пароль *</Label>
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
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Создание...' : 'Создать пользователя'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

