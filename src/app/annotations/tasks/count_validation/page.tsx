'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/**
 * Count Validation Task UI
 * Упрощенный интерфейс для проверки количества bbox
 * 
 * Фокус: Удаление лишних и добавление недостающих bbox
 * Layout: Две картинки рядом (Main и Qualifying)
 * Actions: bbox_delete, bbox_create, bbox_assign_dish, correct_dish_change_count
 */

interface Recognition {
  recognition_id: string
  correct_dishes: Array<{
    Count: number
    Dishes: Array<{ Name: string; ean?: string }>
  }>
  tier: number
  workflow_state: string
}

interface Image {
  id: number
  photo_type: string
  storage_path: string
  annotations: Array<{
    id: number
    dish_index: number | null
    bbox_x1: number
    bbox_y1: number
    bbox_x2: number
    bbox_y2: number
  }>
}

interface TaskData {
  recognition: Recognition
  images: Image[]
  task_type: {
    code: string
    name: string
    ui_config: {
      actions: Record<string, boolean>
      ui: {
        quick_keys: Record<string, string>
      }
    }
  }
  stage: {
    id: number
    name: string
  }
}

export default function CountValidationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tier = searchParams.get('tier')

  const [taskData, setTaskData] = useState<TaskData | null>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    fetchNextTask()
  }, [tier])

  const fetchNextTask = async () => {
    try {
      setLoading(true)
      const url = tier
        ? `/api/annotations/tasks/next?task_type=count_validation&tier=${tier}`
        : `/api/annotations/tasks/next?task_type=count_validation`
      
      const response = await fetch(url)
      
      if (response.status === 404) {
        // Нет доступных задач
        setTaskData(null)
        return
      }

      const data = await response.json()
      setTaskData(data)
    } catch (error) {
      console.error('Error fetching task:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async () => {
    if (!taskData) return

    try {
      setCompleting(true)
      
      const response = await fetch(
        `/api/annotations/tasks/${taskData.recognition.recognition_id}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stage_id: taskData.stage.id,
            move_to_next: true,
            changes: {
              completed_by: 'count_validation_ui',
              completed_at: new Date().toISOString()
            }
          })
        }
      )

      if (response.ok) {
        // Загружаем следующую задачу
        await fetchNextTask()
      } else {
        const error = await response.json()
        alert(`Ошибка: ${error.error}`)
      }
    } catch (error) {
      console.error('Error completing task:', error)
      alert('Ошибка при завершении задачи')
    } finally {
      setCompleting(false)
    }
  }

  const handleOpenFullEditor = () => {
    if (taskData) {
      router.push(`/annotations/${taskData.recognition.recognition_id}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg">Загрузка задачи...</div>
      </div>
    )
  }

  if (!taskData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Нет доступных задач</h2>
          <p className="text-gray-600 mb-6">
            Все задачи проверки количества {tier && `(Tier ${tier})`} выполнены!
          </p>
          <Button onClick={() => router.push('/annotations/tasks')}>
            ← Вернуться к списку задач
          </Button>
        </Card>
      </div>
    )
  }

  const mainImage = taskData.images.find(img => img.photo_type === 'Main')
  const qualifyingImage = taskData.images.find(img => img.photo_type === 'Qualifying')
  
  const mainCount = mainImage?.annotations.filter(a => a.dish_index !== null).length || 0
  const qualifyingCount = qualifyingImage?.annotations.filter(a => a.dish_index !== null).length || 0
  const expectedCount = taskData.recognition.correct_dishes.reduce((sum, dish) => sum + dish.Count, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Проверка количества bbox</h1>
              <p className="text-sm text-gray-600">
                Recognition {taskData.recognition.recognition_id} | Tier {taskData.recognition.tier}
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Count comparison */}
              <div className="flex items-center gap-3 text-sm">
                <div className="text-center">
                  <div className="text-xs text-gray-500">Ожидается</div>
                  <div className="text-2xl font-bold">{expectedCount}</div>
                </div>
                <div className="text-gray-400">=</div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Main</div>
                  <div className={`text-2xl font-bold ${mainCount === expectedCount ? 'text-green-600' : 'text-red-600'}`}>
                    {mainCount}
                  </div>
                </div>
                <div className="text-gray-400">&</div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Qualifying</div>
                  <div className={`text-2xl font-bold ${qualifyingCount === expectedCount ? 'text-green-600' : 'text-red-600'}`}>
                    {qualifyingCount}
                  </div>
                </div>
              </div>

              <div className="border-l pl-4 flex items-center gap-2">
                <Button variant="outline" onClick={handleOpenFullEditor}>
                  Полный редактор
                </Button>
                <Button
                  onClick={handleComplete}
                  disabled={completing}
                  size="lg"
                >
                  {completing ? 'Сохранение...' : 'Готово →'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        {/* Instructions */}
        <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
          <div className="text-sm">
            <span className="font-medium">Инструкция:</span> Проверьте количество bbox на обоих изображениях.
            Удалите лишние или добавьте недостающие. Количество должно совпадать с ожидаемым.
          </div>
          <div className="text-xs text-gray-600 mt-2">
            <span className="font-medium">Горячие клавиши:</span> D - рисовать | Del - удалить | 1-9 - выбор блюда | Esc - сброс
          </div>
        </Card>

        {/* Images Side by Side */}
        <div className="grid grid-cols-2 gap-6">
          {/* Main Image */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Main (45°)</h3>
              <Badge className={mainCount === expectedCount ? 'bg-green-500' : 'bg-red-500'}>
                {mainCount} bbox
              </Badge>
            </div>
            <div className="aspect-video bg-gray-100 rounded border relative">
              {mainImage && (
                <img
                  src={`/api/bbox-images/${mainImage.storage_path}`}
                  alt="Main"
                  className="w-full h-full object-contain"
                />
              )}
              <div className="absolute top-2 right-2 text-xs bg-black bg-opacity-60 text-white px-2 py-1 rounded">
                Используйте полный редактор для изменений
              </div>
            </div>
          </Card>

          {/* Qualifying Image */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Qualifying (90°)</h3>
              <Badge className={qualifyingCount === expectedCount ? 'bg-green-500' : 'bg-red-500'}>
                {qualifyingCount} bbox
              </Badge>
            </div>
            <div className="aspect-video bg-gray-100 rounded border relative">
              {qualifyingImage && (
                <img
                  src={`/api/bbox-images/${qualifyingImage.storage_path}`}
                  alt="Qualifying"
                  className="w-full h-full object-contain"
                />
              )}
              <div className="absolute top-2 right-2 text-xs bg-black bg-opacity-60 text-white px-2 py-1 rounded">
                Используйте полный редактор для изменений
              </div>
            </div>
          </Card>
        </div>

        {/* Dishes List */}
        <Card className="p-4 mt-6">
          <h3 className="font-semibold mb-3">Блюда из чека:</h3>
          <div className="grid grid-cols-3 gap-3">
            {taskData.recognition.correct_dishes.map((dish, idx) => (
              <div key={idx} className="border rounded p-3 bg-gray-50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-mono text-gray-500">#{idx + 1}</span>
                  <Badge>x{dish.Count}</Badge>
                </div>
                <div className="text-sm font-medium">
                  {dish.Dishes[0]?.Name || 'Unknown'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

