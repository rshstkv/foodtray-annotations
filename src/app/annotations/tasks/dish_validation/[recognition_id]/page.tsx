/**
 * Direct link to specific Dish Validation task
 * URL: /annotations/tasks/dish_validation/{recognition_id}
 * 
 * Показывает конкретную задачу:
 * - Если pending → редактирование
 * - Если completed → read-only просмотр
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AnnotationHeader } from '@/components/AnnotationHeader'

interface TaskData {
  recognition: any
  images: any[]
  menu_all: any[]
  task_type: any
  stage: any
}

export default function DirectDishValidationPage({ 
  params 
}: { 
  params: Promise<{ recognition_id: string }> 
}) {
  const router = useRouter()
  const [recognition_id, setRecognitionId] = useState<string | null>(null)
  const [taskData, setTaskData] = useState<TaskData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Unwrap params
  useEffect(() => {
    params.then(p => setRecognitionId(p.recognition_id))
  }, [params])

  // Load task data
  useEffect(() => {
    if (!recognition_id) return

    const loadTask = async () => {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/annotations/tasks/${recognition_id}/get`)
        
        if (!res.ok) {
          if (res.status === 404) {
            setError('Задача не найдена')
          } else {
            setError('Ошибка загрузки задачи')
          }
          return
        }

        const data = await res.json()
        setTaskData(data)
      } catch (err) {
        console.error('Error loading task:', err)
        setError('Ошибка загрузки задачи')
      } finally {
        setLoading(false)
      }
    }

    loadTask()
  }, [recognition_id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AnnotationHeader
          breadcrumbs={[
            { label: 'Главная', href: '/' },
            { label: 'Аннотации', href: '/annotations' },
            { label: 'Задачи', href: '/annotations/tasks' },
            { label: 'Загрузка...' }
          ]}
          title="Загрузка задачи..."
        />
        <div className="max-w-7xl mx-auto p-6">
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-[600px] w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !taskData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AnnotationHeader
          breadcrumbs={[
            { label: 'Главная', href: '/' },
            { label: 'Аннотации', href: '/annotations' },
            { label: 'Задачи', href: '/annotations/tasks' },
            { label: 'Ошибка' }
          ]}
          title="Ошибка"
        />
        <div className="max-w-7xl mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-700 text-lg font-medium mb-4">
              {error || 'Задача не найдена'}
            </p>
            <Button onClick={() => router.push('/annotations/tasks')}>
              ← Вернуться к списку задач
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const { recognition, images } = taskData
  const isCompleted = recognition.workflow_state === 'completed'
  const isPending = recognition.workflow_state === 'pending'

  // Determine mode based on data
  const mainImage = images.find((img: any) => img.photo_type === 'Main')
  const qualifyingImage = images.find((img: any) => img.photo_type === 'Qualifying')
  
  const mainCount = mainImage?.annotations.filter((a: any) => a.dish_index !== null).length || 0
  const qualCount = qualifyingImage?.annotations.filter((a: any) => a.dish_index !== null).length || 0
  const expectedCount = recognition.correct_dishes?.reduce((sum: number, dish: any) => sum + dish.Count, 0) || 0

  const checkPerDishAlignment = () => {
    if (!recognition.correct_dishes || !mainImage || !qualifyingImage) return false
    
    return recognition.correct_dishes.every((dish: any, dishIndex: number) => {
      const mainDishCount = mainImage.annotations.filter((a: any) => a.dish_index === dishIndex).length
      const qualDishCount = qualifyingImage.annotations.filter((a: any) => a.dish_index === dishIndex).length
      return mainDishCount === dish.Count && qualDishCount === dish.Count
    })
  }

  const isAligned = mainCount === qualCount && mainCount === expectedCount && checkPerDishAlignment()
  const mode = isAligned ? 'quick' : 'edit'

  // Redirect to appropriate page based on status
  useEffect(() => {
    if (isPending) {
      // Redirect to regular page for editing
      router.push(`/annotations/tasks/dish_validation?recognition_id=${recognition_id}`)
    }
  }, [isPending, recognition_id, router])

  if (isPending) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Перенаправление...</p>
          <Skeleton className="h-8 w-64 mx-auto" />
        </div>
      </div>
    )
  }

  // Read-only view for completed tasks
  return (
    <div className="min-h-screen bg-gray-50">
      <AnnotationHeader
        breadcrumbs={[
          { label: 'Главная', href: '/' },
          { label: 'Аннотации', href: '/annotations' },
          { label: 'Задачи', href: '/annotations/tasks' },
          { label: `Recognition ${recognition_id}` }
        ]}
        title={`Задача ${recognition_id}`}
        subtitle={`Recognition ${recognition_id} | Tier ${recognition.tier}`}
        actions={
          <Button variant="outline" onClick={() => router.push('/annotations/tasks')}>
            ← К списку задач
          </Button>
        }
      />

      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white rounded-lg border p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">Статус задачи</h2>
              <div className="flex items-center gap-4">
                <Badge variant={isCompleted ? 'default' : 'secondary'} className="text-lg py-1 px-3">
                  {isCompleted ? '✓ Выполнена' : recognition.workflow_state}
                </Badge>
                <Badge variant={mode === 'quick' ? 'default' : 'secondary'} className="text-lg py-1 px-3">
                  {mode === 'quick' ? 'Quick Mode' : 'Edit Mode'}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Recognition ID</div>
              <div className="text-2xl font-mono font-bold">{recognition_id}</div>
              <div className="text-sm text-gray-500 mt-2">Tier {recognition.tier}</div>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-blue-800">
            <strong>Read-only режим:</strong> Эта задача уже выполнена. 
            Для редактирования необходимо сначала вернуть задачу в статус "pending".
          </p>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Данные задачи</h3>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded">
              <div className="text-sm text-gray-500 mb-1">Ожидается</div>
              <div className="text-3xl font-bold">{expectedCount}</div>
            </div>
            <div className="bg-gray-50 p-4 rounded">
              <div className="text-sm text-gray-500 mb-1">Main</div>
              <div className="text-3xl font-bold">{mainCount}</div>
            </div>
            <div className="bg-gray-50 p-4 rounded">
              <div className="text-sm text-gray-500 mb-1">Qualifying</div>
              <div className="text-3xl font-bold">{qualCount}</div>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="font-semibold mb-2">Блюда из чека</h4>
            <div className="space-y-2">
              {recognition.correct_dishes?.map((dish: any, index: number) => (
                <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                  <div>
                    <span className="font-medium">#{index + 1}</span> {' '}
                    {dish.Dishes?.[0]?.MenuItemName || 'Unknown'}
                  </div>
                  <Badge>{dish.Count} шт</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm text-gray-500">
              Для просмотра изображений и аннотаций используйте основной интерфейс редактирования.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}


