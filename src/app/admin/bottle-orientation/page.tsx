'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserNav } from '@/components/UserNav'

interface BottleOrientationEAN {
  id: number
  ean: string
  description: string | null
  created_at: string
}

export default function BottleOrientationEANsPage() {
  const [eans, setEans] = useState<BottleOrientationEAN[]>([])
  const [newEan, setNewEan] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Загрузка списка EAN
  const loadEans = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/bottle-orientation-eans')
      if (response.ok) {
        const data = await response.json()
        setEans(data)
      } else {
        console.error('Failed to load EANs')
      }
    } catch (err) {
      console.error('Error loading EANs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEans()
  }, [])

  // Добавить EAN
  const handleAdd = async () => {
    if (!newEan.trim()) {
      setError('EAN не может быть пустым')
      return
    }

    try {
      setSaving(true)
      setError(null)
      const response = await fetch('/api/admin/bottle-orientation-eans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ean: newEan.trim(), 
          description: description.trim() || null 
        })
      })

      if (response.ok) {
        setNewEan('')
        setDescription('')
        await loadEans()
      } else {
        const data = await response.json()
        setError(data.error || 'Ошибка при добавлении EAN')
      }
    } catch (err) {
      console.error('Error adding EAN:', err)
      setError('Ошибка при добавлении EAN')
    } finally {
      setSaving(false)
    }
  }

  // Удалить EAN
  const handleDelete = async (id: number) => {
    if (!confirm('Вы уверены, что хотите удалить этот EAN?')) {
      return
    }

    try {
      const response = await fetch(`/api/admin/bottle-orientation-eans?id=${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadEans()
      } else {
        console.error('Failed to delete EAN')
      }
    } catch (err) {
      console.error('Error deleting EAN:', err)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Настройка Bottle Orientation</h1>
              <p className="text-sm text-gray-600 mt-1">
                Управление списком EAN для задач проверки ориентации бутылок
              </p>
            </div>
            <UserNav />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Форма добавления */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Добавить EAN</h2>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                EAN *
              </label>
              <Input
                value={newEan}
                onChange={(e) => setNewEan(e.target.value)}
                placeholder="Например: 5601012011111"
                disabled={saving}
              />
            </div>
            <div className="col-span-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Описание (опционально)
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Например: Coca-Cola 1.5L"
                disabled={saving}
              />
            </div>
            <div className="col-span-2 flex items-end">
              <Button
                onClick={handleAdd}
                disabled={saving || !newEan.trim()}
                className="w-full"
              >
                {saving ? 'Добавление...' : 'Добавить'}
              </Button>
            </div>
          </div>
          {error && (
            <div className="mt-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </Card>

        {/* Список EAN */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Список EAN ({eans.length})
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={loadEans}
              disabled={loading}
            >
              🔄 Обновить
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">
              Загрузка...
            </div>
          ) : eans.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Нет настроенных EAN. Добавьте первый EAN выше.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      EAN
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Описание
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Дата добавления
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {eans.map((ean) => (
                    <tr key={ean.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-mono text-sm">
                        {ean.ean}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700">
                        {ean.description || <span className="text-gray-400 italic">—</span>}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {new Date(ean.created_at).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(ean.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          Удалить
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Информация */}
        <Card className="p-6 bg-blue-50 border-blue-200">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            ℹ️ Информация
          </h3>
          <div className="text-sm text-blue-800 space-y-1">
            <p>
              • Completed заказы с этими EAN будут автоматически попадать в очередь bottle_orientation
            </p>
            <p>
              • Задачи bottle_orientation создаются только для заказов, которые прошли dish_validation
            </p>
            <p>
              • В задаче нужно проверить правильную ориентацию бутылок (горлышком вверх/вниз)
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

