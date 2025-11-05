'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import dynamic from 'next/dynamic'

const BBoxAnnotator = dynamic(() => import('@/components/BBoxAnnotator'), { ssr: false })

/**
 * Overlap Marking Task UI
 * Быстрая маркировка перекрытий между объектами
 * 
 * Фокус: Показать bbox, быстро проставить Y (есть перекрытие) или N (нет)
 * Layout: Изображение с подсвеченным текущим bbox + крупные кнопки Y/N
 * Hotkeys: Y, N, Esc
 */

interface Annotation {
  id: number
  image_id: number
  bbox_x1: number
  bbox_y1: number
  bbox_x2: number
  bbox_y2: number
  object_type: string
  object_subtype: string | null
  dish_index: number | null
  is_overlapped: boolean
  is_bottle_up: boolean | null
  is_error: boolean
  source: string
}

interface Image {
  id: number
  photo_type: string
  storage_path: string
  image_width: number | null
  image_height: number | null
  annotations: Annotation[]
}

interface Recognition {
  recognition_id: string
  correct_dishes: Array<{
    Count: number
    Dishes: Array<{ Name: string }>
  }>
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
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [currentBBoxIndex, setCurrentBBoxIndex] = useState(0)
  const [processing, setProcessing] = useState(false)

  const currentBBoxIndexRef = useRef(currentBBoxIndex)

  useEffect(() => {
    currentBBoxIndexRef.current = currentBBoxIndex
  }, [currentBBoxIndex])

  useEffect(() => {
    fetchNextTask()
  }, [tier])

  useEffect(() => {
    // Горячие клавиши
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!taskData || processing) return
      
      const key = e.key.toLowerCase()
      
      if (key === 'y') {
        handleMarkOverlap(true)
      } else if (key === 'n') {
        handleMarkOverlap(false)
      } else if (key === 'escape') {
        handleSkip()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [taskData, currentBBoxIndex, processing])

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
      setImages(data.images)
      setCurrentBBoxIndex(0)
    } catch (error) {
      console.error('Error fetching task:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkOverlap = async (isOverlapped: boolean) => {
    if (!taskData || processing) return

    const allBBoxes = images?.flatMap(img => 
      img.annotations.filter(a => a.dish_index !== null)
    ) || []

    if (currentBBoxIndex >= allBBoxes.length) return

    const currentBBox = allBBoxes[currentBBoxIndex]

    try {
      setProcessing(true)

      // Обновляем annotation
      await fetch(`/api/annotations/annotations/${currentBBox.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_overlapped: isOverlapped,
          current_bbox_x1: currentBBox.bbox_x1,
          current_bbox_y1: currentBBox.bbox_y1,
          current_bbox_x2: currentBBox.bbox_x2,
          current_bbox_y2: currentBBox.bbox_y2
        })
      })

      // Обновляем локально
      setImages(prev => prev.map(img => ({
        ...img,
        annotations: img.annotations.map(ann =>
          ann.id === currentBBox.id ? { ...ann, is_overlapped: isOverlapped } : ann
        )
      })))

      // Переходим к следующему bbox
      const nextIndex = currentBBoxIndex + 1
      if (nextIndex >= allBBoxes.length) {
        // Все bbox обработаны, завершаем задачу
        await handleComplete()
      } else {
        setCurrentBBoxIndex(nextIndex)
      }
    } catch (error) {
      console.error('Error marking overlap:', error)
      alert('Ошибка при сохранении')
    } finally {
      setProcessing(false)
    }
  }

  const handleComplete = async () => {
    if (!taskData) return

    try {
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
              completed_at: new Date().toISOString()
            }
          })
        }
      )

      if (response.ok) {
        await fetchNextTask()
      }
    } catch (error) {
      console.error('Error completing task:', error)
    }
  }

  const handleSkip = async () => {
    if (!taskData) return
    
    try {
      await fetch(`/api/annotations/tasks/${taskData.recognition.recognition_id}/skip`, {
        method: 'POST'
      })
      
      await fetchNextTask()
    } catch (error) {
      console.error('Error skipping:', error)
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
            Все задачи маркировки перекрытий {tier && `(Tier ${tier})`} выполнены!
          </p>
          <Button onClick={() => router.push('/annotations/tasks')}>
            ← Вернуться к списку задач
          </Button>
        </Card>
      </div>
    )
  }

  const allBBoxes = images?.flatMap(img => 
    img.annotations
      .filter(a => a.dish_index !== null)
      .map(a => ({ ...a, imageType: img.photo_type }))
  ) || []
  
  const currentBBox = allBBoxes[currentBBoxIndex]
  const progress = allBBoxes.length > 0 ? ((currentBBoxIndex + 1) / allBBoxes.length) * 100 : 0

  // Находим изображение для текущего bbox
  const currentImage = currentBBox ? images?.find(img => 
    img.annotations.some(a => a.id === currentBBox.id)
  ) : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-xl font-bold">Маркировка перекрытий</h1>
              <p className="text-sm text-gray-600">
                Recognition {taskData.recognition.recognition_id} | Tier {taskData.recognition.tier}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleSkip}>
                Пропустить (Esc)
              </Button>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-sm text-gray-600 mt-1">
            BBox {currentBBoxIndex + 1} из {allBBoxes.length}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <Card className="max-w-7xl mx-auto mx-6 mt-4 p-3 bg-blue-50 border-blue-200">
        <div className="text-sm">
          <span className="font-medium">Инструкция:</span> Проверьте, перекрывается ли выделенный объект с другими объектами.
          Нажмите <span className="font-bold">Y</span> (есть перекрытие) или <span className="font-bold">N</span> (нет перекрытия)
        </div>
      </Card>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        {currentBBox && currentImage ? (
          <div className="grid grid-cols-3 gap-6">
            {/* Image with highlighted bbox */}
            <div className="col-span-2">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{currentImage.photo_type}</h3>
                  <Badge>
                    {currentBBox.is_overlapped ? 'Есть перекрытие' : 'Нет перекрытия'}
                  </Badge>
                </div>
                <div className="h-[calc(100vh-320px)] rounded border relative bg-gray-100">
                  <BBoxAnnotator
                    imageUrl={`/api/bbox-images/${currentImage.storage_path}`}
                    annotations={currentImage.annotations}
                    originalAnnotations={null}
                    imageId={currentImage.id}
                    dishNames={{}}
                    selectedDishIndex={currentBBox.dish_index}
                    onAnnotationCreate={() => {}}
                    onAnnotationUpdate={() => {}}
                    onAnnotationSelect={() => {}}
                    selectedAnnotation={currentBBox}
                    drawingMode={false}
                    referenceWidth={currentImage.photo_type === 'Main' ? 1810 : 1410}
                    referenceHeight={1080}
                  />
                </div>
              </Card>
            </div>

            {/* Action buttons */}
            <div className="col-span-1">
              <div className="space-y-4 sticky top-32">
                <Card className="p-6">
                  <h3 className="font-semibold mb-4 text-center">Есть перекрытие?</h3>
                  
                  <div className="space-y-3">
                    <Button
                      onClick={() => handleMarkOverlap(true)}
                      disabled={processing}
                      className="w-full h-24 text-2xl bg-red-600 hover:bg-red-700"
                      size="lg"
                    >
                      ✓ ДА (Y)
                      <div className="text-sm font-normal mt-1">Есть перекрытие</div>
                    </Button>
                    
                    <Button
                      onClick={() => handleMarkOverlap(false)}
                      disabled={processing}
                      className="w-full h-24 text-2xl bg-green-600 hover:bg-green-700"
                      size="lg"
                    >
                      ✗ НЕТ (N)
                      <div className="text-sm font-normal mt-1">Нет перекрытия</div>
                    </Button>
                  </div>
                </Card>

                {/* Info card */}
                <Card className="p-4">
                  <h4 className="font-semibold mb-2 text-sm">Информация о bbox:</h4>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>ID: {currentBBox.id}</div>
                    <div>Dish Index: {currentBBox.dish_index !== null ? `#${currentBBox.dish_index + 1}` : 'N/A'}</div>
                    <div>Type: {currentBBox.object_type}</div>
                    <div>Source: {currentBBox.source}</div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-600">Нет bbox для проверки</p>
          </div>
        )}
      </div>
    </div>
  )
}
