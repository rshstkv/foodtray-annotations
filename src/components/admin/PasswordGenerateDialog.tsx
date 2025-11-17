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
import { Copy, Check, AlertCircle } from 'lucide-react'

interface PasswordGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userEmail: string
}

export function PasswordGenerateDialog({ 
  open, 
  onOpenChange, 
  userId, 
  userEmail 
}: PasswordGenerateDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleGenerate = async () => {
    setError('')
    setLoading(true)

    try {
      const response = await apiFetch<{ password: string }>(`/api/admin/users/${userId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // пустое тело - автогенерация
      })

      if (response.success && response.data) {
        setGeneratedPassword(response.data.password)
      } else {
        setError(response.error || 'Ошибка генерации пароля')
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка генерации пароля')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (generatedPassword) {
      await navigator.clipboard.writeText(generatedPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleClose = () => {
    setGeneratedPassword(null)
    setError('')
    setCopied(false)
    onOpenChange(false)
  }

  // Если пароль еще не сгенерирован
  if (!generatedPassword) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Сгенерировать новый пароль</DialogTitle>
            <DialogDescription>
              Будет создан новый случайный пароль для пользователя {userEmail}
            </DialogDescription>
          </DialogHeader>

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

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              Отмена
            </Button>
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? 'Генерация...' : 'Сгенерировать пароль'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Если пароль сгенерирован
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый пароль создан</DialogTitle>
          <DialogDescription>
            Сохраните пароль, он будет показан только один раз
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input value={userEmail} readOnly className="bg-gray-50" />
          </div>

          <div className="space-y-2">
            <Label>Новый пароль</Label>
            <div className="flex gap-2">
              <Input
                value={generatedPassword}
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
          <Button onClick={handleClose} className="w-full">
            Понятно, я скопировал пароль
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

