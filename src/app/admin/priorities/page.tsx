'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api-response'
import type { ValidationPriorityConfig } from '@/types/domain'
import { VALIDATION_TYPE_LABELS } from '@/types/domain'
import { Save, ArrowUp, ArrowDown } from 'lucide-react'

export default function AdminPrioritiesPage() {
  const [priorities, setPriorities] = useState<ValidationPriorityConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPriorities()
  }, [])

  const loadPriorities = async () => {
    try {
      setLoading(true)
      const response = await apiFetch<{ priorities: ValidationPriorityConfig[] }>(
        '/api/admin/validation-priorities'
      )
      if (response.success && response.data) {
        setPriorities(response.data.priorities || [])
      }
    } catch (error) {
      console.error('Error loading priorities:', error)
    } finally {
      setLoading(false)
    }
  }

  const savePriorities = async () => {
    try {
      setSaving(true)
      const response = await apiFetch('/api/admin/validation-priorities', {
        method: 'PATCH',
        body: JSON.stringify({ priorities }),
      })
      if (response.success) {
        alert('Приоритеты сохранены')
      }
    } catch (error) {
      console.error('Error saving priorities:', error)
      alert('Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = (id: number) => {
    setPriorities((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_active: !p.is_active } : p))
    )
  }

  const movePriority = (id: number, direction: 'up' | 'down') => {
    const index = priorities.findIndex((p) => p.id === id)
    if (index === -1) return

    const newPriorities = [...priorities]
    if (direction === 'up' && index > 0) {
      ;[newPriorities[index - 1], newPriorities[index]] = [
        newPriorities[index],
        newPriorities[index - 1],
      ]
    } else if (direction === 'down' && index < newPriorities.length - 1) {
      ;[newPriorities[index], newPriorities[index + 1]] = [
        newPriorities[index + 1],
        newPriorities[index],
      ]
    }

    // Update priority and order_in_session
    newPriorities.forEach((p, i) => {
      p.priority = i + 1
      p.order_in_session = i + 1
    })

    setPriorities(newPriorities)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Приоритеты валидации</h1>
            <p className="text-gray-600 mt-1">
              Управление порядком и активностью типов валидации
            </p>
          </div>
          <Button onClick={savePriorities} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>

        <Card className="p-6">
          <div className="space-y-3">
            {priorities.map((priority, index) => (
              <div
                key={priority.id}
                className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => movePriority(priority.id, 'up')}
                    disabled={index === 0}
                  >
                    <ArrowUp className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => movePriority(priority.id, 'down')}
                    disabled={index === priorities.length - 1}
                  >
                    <ArrowDown className="w-3 h-3" />
                  </Button>
                </div>

                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {VALIDATION_TYPE_LABELS[priority.validation_type]}
                  </div>
                  <div className="text-sm text-gray-500">
                    Приоритет: {priority.priority} | Порядок: {priority.order_in_session}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Активно</span>
                  <Switch
                    checked={priority.is_active}
                    onCheckedChange={() => toggleActive(priority.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-medium text-blue-900 mb-2">
            Как работают приоритеты
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              • Более высокие типы в списке имеют более высокий приоритет (выполняются
              первыми)
            </li>
            <li>
              • Неактивные типы не будут предлагаться пользователям для валидации
            </li>
            <li>• Изменения применяются сразу после сохранения</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

