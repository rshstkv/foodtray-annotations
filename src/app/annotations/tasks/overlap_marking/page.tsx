'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/**
 * Overlap Marking Task UI
 * Быстрая разметка перекрытий - бинарный выбор Да/Нет
 * 
 * Фокус: Быстрая разметка через Y/N
 * Layout: Две картинки рядом с подсветкой текущего bbox
 * Actions: bbox_toggle_overlap
 */

interface Annotation {
  id: number
  bbox_x1: number
  bbox_y1: number
  bbox_x2: number
  bbox_y2: number
  dish_index: number | null
  is_overlapped: boolean | null
  object_type: string
}

interface Image {
  id: number
  photo_type: string
  storage_path: string
  annotations: Annotation[]
}

interface Recognition {
  recognition_id: string
  tier: number
}

interface TaskData {
  recognition: Recognition
  images: Image[]
  task_type: {
    code: string
    name: string
  }
  stage: {
    id: number
    name: string
  }
}

export default function OverlapMarkingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tier = searchParams.get('tier')

  const [taskData, setTaskData] = useState<TaskData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentBboxIndex, setCurrentBboxIndex] = useState(0)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchNextTask()
  }, [tier])

  useEffect(() => {
    // Горячие клавиши
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!taskData || annotations.length === 0) return
      
      if (e.key === 'y' || e.key === 'Y' || e.key === 'д' || e.key === 'Д') {
        handleMarkOverlap(true)
      } else if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') {
        handleMarkOverlap(false)
      } else if (e.key === ' ') {
        e.preventDefault()
        handleNext()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [taskData, currentBboxIndex, annotations])

  const fetchNextTask = async () => {
    try {
      setLoading(true)
      const url = tier
        ? `/api/annotations/tasks/next?task_type=overlap_marking&tier=${tier}`
        : `/api/annotations/tasks/next?task_type=overlap_marking`
      
      const response = await fetch(url)
      
      if (response.status === 404) {
        setTaskData(null)
        return
      }

      const data = await response.json()
      setTaskData(data)
      
      // Собираем все food bbox для разметки
      const allFoodBboxes: Annotation[] = []
      data.images.forEach((img: Image) => {
        img.annotations
          .filter((a: Annotation) => a.object_type === 'food')
          .forEach((a: Annotation) => allFoodBboxes.push(a))
      })
      
      setAnnotations(allFoodBboxes)
      setCurrentBboxIndex(0)
    } catch (error) {
      console.error('Error fetching task:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkOverlap = async (isOverlapped: boolean) => {
    if (!taskData || annotations.length === 0) return

    const currentAnnotation = annotations[currentBboxIndex]
    
    // Обновляем аннотацию
    try {
      await fetch(`/api/annotations/${currentAnnotation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_overlapped: isOverlapped
        })
      })

      // Обновляем локальное состояние
      const updatedAnnotations = [...annotations]
      updatedAnnotations[currentBboxIndex] = {
        ...currentAnnotation,
        is_overlapped: isOverlapped
      }
      setAnnotations(updatedAnnotations)

      // Автоматически переходим к следующему
      await handleNext()
    } catch (error) {
      console.error('Error updating annotation:', error)
      alert('Ошибка при сохранении')
    }
  }

  const handleNext = async () => {
    if (!taskData) return

    const nextIndex = currentBboxIndex + 1
    
    if (nextIndex < annotations.length) {
      setCurrentBboxIndex(nextIndex)
    } else {
      // Все размечено, завершаем этап
      await completeTask()
    }
  }

  const completeTask = async () => {
    if (!taskData) return

    try {
      setSaving(true)
      
      const response = await fetch(
        `/api/annotations/tasks/${taskData.recognition.recognition_id}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stage_id: taskData.stage.id,
            move_to_next: true,
            changes: {
              completed_by: 'overlap_marking_ui',
              marked_count: annotations.length
            }
          })
        }
      )

      if (response.ok) {
        await fetchNextTask()
      }
    } catch (error) {
      console.error('Error completing task:', error)
      alert('Ошибка при завершении')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg">Загрузка задачи...</div>
      </div>
    )
  }

  if (!taskData || annotations.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Нет доступных задач</h2>
          <p className="text-gray-600 mb-6">
            {!taskData 
              ? `Все задачи разметки перекрытий ${tier ? `(Tier ${tier})` : ''} выполнены!`
              : 'В этом recognition нет food объектов для разметки'
            }
          </p>
          <Button onClick={() => router.push('/annotations/tasks')}>
            ← Вернуться к списку задач
          </Button>
        </Card>
      </div>
    )
  }

  if (saving) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg">Завершение задачи...</div>
      </div>
    )
  }

  const currentAnnotation = annotations[currentBboxIndex]
  const progress = ((currentBboxIndex + 1) / annotations.length) * 100

  // Найдем изображение с текущей аннотацией
  const mainImage = taskData.images.find(img => img.photo_type === 'Main')
  const qualifyingImage = taskData.images.find(img => img.photo_type === 'Qualifying')
  
  const currentImage = taskData.images.find(img => 
    img.annotations.some(a => a.id === currentAnnotation.id)
  )

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-white">Разметка перекрытий</h1>
              <p className="text-sm text-gray-400">
                Recognition {taskData.recognition.recognition_id} | Tier {taskData.recognition.tier}
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push('/annotations/tasks')}>
              ✕ Выход
            </Button>
          </div>
          
          {/* Progress */}
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-sm text-gray-300 mt-1">
            Bbox {currentBboxIndex + 1} из {annotations.length}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="max-w-7xl mx-auto px-6 py-4">
        <Card className="p-4 bg-yellow-900 border-yellow-700">
          <div className="text-white text-center">
            <p className="text-lg font-medium mb-2">
              Есть ли перекрытие этого объекта другими объектами?
            </p>
            <div className="flex items-center justify-center gap-8 text-sm">
              <div>
                <span className="font-bold">Y</span> - Да, есть перекрытие
              </div>
              <div>
                <span className="font-bold">N</span> - Нет перекрытия
              </div>
              <div>
                <span className="font-bold">Space</span> - Следующий (пропустить)
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content - Две картинки */}
      <div className="max-w-7xl mx-auto px-6 pb-6">
        <div className="grid grid-cols-2 gap-6">
          {/* Main Image */}
          <Card className="p-4 bg-gray-800 border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">Main (45°)</h3>
              {currentImage?.photo_type === 'Main' && (
                <Badge className="bg-green-600">← Текущий</Badge>
              )}
            </div>
            <div className="aspect-video bg-gray-900 rounded border border-gray-700 relative">
              {mainImage && (
                <>
                  <img
                    src={`/api/bbox-images/${mainImage.storage_path}`}
                    alt="Main"
                    className="w-full h-full object-contain"
                  />
                  {/* Подсветка текущего bbox */}
                  {currentImage?.photo_type === 'Main' && (
                    <div
                      className="absolute border-4 border-yellow-400 bg-yellow-400 bg-opacity-20"
                      style={{
                        left: `${(currentAnnotation.bbox_x1 / 1000) * 100}%`,
                        top: `${(currentAnnotation.bbox_y1 / 1000) * 100}%`,
                        width: `${((currentAnnotation.bbox_x2 - currentAnnotation.bbox_x1) / 1000) * 100}%`,
                        height: `${((currentAnnotation.bbox_y2 - currentAnnotation.bbox_y1) / 1000) * 100}%`,
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Qualifying Image */}
          <Card className="p-4 bg-gray-800 border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">Qualifying (90°)</h3>
              {currentImage?.photo_type === 'Qualifying' && (
                <Badge className="bg-green-600">← Текущий</Badge>
              )}
            </div>
            <div className="aspect-video bg-gray-900 rounded border border-gray-700 relative">
              {qualifyingImage && (
                <>
                  <img
                    src={`/api/bbox-images/${qualifyingImage.storage_path}`}
                    alt="Qualifying"
                    className="w-full h-full object-contain"
                  />
                  {/* Подсветка текущего bbox */}
                  {currentImage?.photo_type === 'Qualifying' && (
                    <div
                      className="absolute border-4 border-yellow-400 bg-yellow-400 bg-opacity-20"
                      style={{
                        left: `${(currentAnnotation.bbox_x1 / 1000) * 100}%`,
                        top: `${(currentAnnotation.bbox_y1 / 1000) * 100}%`,
                        width: `${((currentAnnotation.bbox_x2 - currentAnnotation.bbox_x1) / 1000) * 100}%`,
                        height: `${((currentAnnotation.bbox_y2 - currentAnnotation.bbox_y1) / 1000) * 100}%`,
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <Button
            size="lg"
            variant="outline"
            onClick={handleNext}
            className="h-20"
          >
            <div className="text-center">
              <div className="text-2xl mb-1">⏭</div>
              <div>Пропустить (Space)</div>
            </div>
          </Button>
          
          <Button
            size="lg"
            onClick={() => handleMarkOverlap(false)}
            className="h-20 bg-green-600 hover:bg-green-700"
          >
            <div className="text-center">
              <div className="text-3xl mb-1">✓</div>
              <div className="text-lg">НЕТ перекрытия (N)</div>
            </div>
          </Button>

          <Button
            size="lg"
            onClick={() => handleMarkOverlap(true)}
            className="h-20 bg-red-600 hover:bg-red-700"
          >
            <div className="text-center">
              <div className="text-3xl mb-1">⚠</div>
              <div className="text-lg">ЕСТЬ перекрытие (Y)</div>
            </div>
          </Button>
        </div>

        {/* Current bbox info */}
        <Card className="mt-4 p-4 bg-gray-800 border-gray-700">
          <div className="text-white text-sm">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <span className="text-gray-400">Dish Index:</span>{' '}
                <span className="font-medium">{currentAnnotation.dish_index ?? 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-400">Текущий статус:</span>{' '}
                <Badge className={currentAnnotation.is_overlapped === true ? 'bg-red-600' : currentAnnotation.is_overlapped === false ? 'bg-green-600' : 'bg-gray-600'}>
                  {currentAnnotation.is_overlapped === true ? 'Перекрыто' : currentAnnotation.is_overlapped === false ? 'Не перекрыто' : 'Не размечено'}
                </Badge>
              </div>
              <div className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/annotations/${taskData.recognition.recognition_id}`)}
                >
                  Полный редактор
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

