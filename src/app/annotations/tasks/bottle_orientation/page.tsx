'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import dynamic from 'next/dynamic'

const BBoxAnnotator = dynamic(() => import('@/components/BBoxAnnotator'), { ssr: false })

/**
 * Bottle Orientation Task UI
 * Быстрая маркировка ориентации бутылок
 * 
 * Фокус: Показать bbox бутылок, проставить вертикально/горизонтально/не определено
 * Layout: Изображение с подсвеченным bbox + крупные кнопки V/H/N
 * Hotkeys: V (вертикально), H (горизонтально), N (не определено), Esc
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

export default function BottleOrientationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tier = searchParams.get('tier')

  const [taskData, setTaskData] = useState<TaskData | null>(null)
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [currentBottleIndex, setCurrentBottleIndex] = useState(0)
  const [processing, setProcessing] = useState(false)

  const currentBottleIndexRef = useRef(currentBottleIndex)

  useEffect(() => {
    currentBottleIndexRef.current = currentBottleIndex
  }, [currentBottleIndex])

  useEffect(() => {
    fetchNextTask()
  }, [tier])

  useEffect(() => {
    // Горячие клавиши
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!taskData || processing) return
      
      const key = e.key.toLowerCase()
      
      if (key === 'v' || key === 'arrowup') {
        handleSetOrientation(true) // Вертикально
      } else if (key === 'h' || key === 'arrowright') {
        handleSetOrientation(false) // Горизонтально
      } else if (key === 'n' || key === ' ') {
        e.preventDefault()
        handleSetOrientation(null) // Не определено
      } else if (key === 'escape') {
        handleSkip()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [taskData, currentBottleIndex, processing])

  const fetchNextTask = async () => {
    try {
      setLoading(true)
      const url = tier
        ? `/api/annotations/tasks/next?task_type=bottle_orientation&tier=${tier}`
        : `/api/annotations/tasks/next?task_type=bottle_orientation`
      
      const response = await fetch(url)
      
      if (response.status === 404) {
        setTaskData(null)
        return
      }

      const data = await response.json()
      setTaskData(data)
      setImages(data.images)
      setCurrentBottleIndex(0)
    } catch (error) {
      console.error('Error fetching task:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSetOrientation = async (isBottleUp: boolean | null) => {
    if (!taskData || processing) return

    // Находим все бутылки
    const allBottles = images.flatMap(img => 
      img.annotations.filter(a => a.object_subtype === 'bottle' || a.object_type === 'bottle')
    )

    if (currentBottleIndex >= allBottles.length) return

    const currentBottle = allBottles[currentBottleIndex]

    try {
      setProcessing(true)

      // Обновляем annotation
      await fetch(`/api/annotations/annotations/${currentBottle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_bottle_up: isBottleUp,
          current_bbox_x1: currentBottle.bbox_x1,
          current_bbox_y1: currentBottle.bbox_y1,
          current_bbox_x2: currentBottle.bbox_x2,
          current_bbox_y2: currentBottle.bbox_y2
        })
      })

      // Обновляем локально
      setImages(prev => prev.map(img => ({
        ...img,
        annotations: img.annotations.map(ann =>
          ann.id === currentBottle.id ? { ...ann, is_bottle_up: isBottleUp } : ann
        )
      })))

      // Переходим к следующей бутылке
      const nextIndex = currentBottleIndex + 1
      if (nextIndex >= allBottles.length) {
        // Все бутылки обработаны, завершаем задачу
        await handleComplete()
      } else {
        setCurrentBottleIndex(nextIndex)
      }
    } catch (error) {
      console.error('Error setting orientation:', error)
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
              completed_by: 'bottle_orientation_ui',
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
            Все задачи ориентации бутылок {tier && `(Tier ${tier})`} выполнены!
          </p>
          <Button onClick={() => router.push('/annotations/tasks')}>
            ← Вернуться к списку задач
          </Button>
        </Card>
      </div>
    )
  }

  const allBottles = images.flatMap(img => 
    img.annotations
      .filter(a => a.object_subtype === 'bottle' || a.object_type === 'bottle')
      .map(a => ({ ...a, imageType: img.photo_type }))
  )
  
  const currentBottle = allBottles[currentBottleIndex]
  const progress = allBottles.length > 0 ? ((currentBottleIndex + 1) / allBottles.length) * 100 : 0

  // Находим изображение для текущей бутылки
  const currentImage = currentBottle ? images.find(img => 
    img.annotations.some(a => a.id === currentBottle.id)
  ) : null

  const getOrientationText = (isBottleUp: boolean | null) => {
    if (isBottleUp === null) return 'Не определено'
    return isBottleUp ? 'Вертикально ↑' : 'Горизонтально →'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-xl font-bold">Ориентация бутылок</h1>
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
            Бутылка {currentBottleIndex + 1} из {allBottles.length}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <Card className="max-w-7xl mx-auto mx-6 mt-4 p-3 bg-blue-50 border-blue-200">
        <div className="text-sm">
          <span className="font-medium">Инструкция:</span> Определите ориентацию бутылки.
          Нажмите <span className="font-bold">V/↑</span> (вертикально), <span className="font-bold">H/→</span> (горизонтально)
          или <span className="font-bold">N/Space</span> (не определено)
        </div>
      </Card>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        {currentBottle && currentImage ? (
          <div className="grid grid-cols-3 gap-6">
            {/* Image with highlighted bottle */}
            <div className="col-span-2">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{currentImage.photo_type}</h3>
                  <Badge className={
                    currentBottle.is_bottle_up === null ? 'bg-gray-500' :
                    currentBottle.is_bottle_up ? 'bg-blue-500' : 'bg-green-500'
                  }>
                    {getOrientationText(currentBottle.is_bottle_up)}
                  </Badge>
                </div>
                <div className="h-[calc(100vh-320px)] rounded border relative bg-gray-100">
                  <BBoxAnnotator
                    imageUrl={`/api/bbox-images/${currentImage.storage_path}`}
                    annotations={currentImage.annotations}
                    originalAnnotations={null}
                    imageId={currentImage.id}
                    dishNames={{}}
                    selectedDishIndex={null}
                    onAnnotationCreate={() => {}}
                    onAnnotationUpdate={() => {}}
                    onAnnotationSelect={() => {}}
                    selectedAnnotation={currentBottle}
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
                  <h3 className="font-semibold mb-4 text-center">Ориентация бутылки</h3>
                  
                  <div className="space-y-3">
                    <Button
                      onClick={() => handleSetOrientation(true)}
                      disabled={processing}
                      className="w-full h-20 text-xl bg-blue-600 hover:bg-blue-700 flex flex-col"
                      size="lg"
                    >
                      <div className="text-3xl">↑</div>
                      <div className="text-sm mt-1">Вертикально (V)</div>
                    </Button>
                    
                    <Button
                      onClick={() => handleSetOrientation(false)}
                      disabled={processing}
                      className="w-full h-20 text-xl bg-green-600 hover:bg-green-700 flex flex-col"
                      size="lg"
                    >
                      <div className="text-3xl">→</div>
                      <div className="text-sm mt-1">Горизонтально (H)</div>
                    </Button>

                    <Button
                      onClick={() => handleSetOrientation(null)}
                      disabled={processing}
                      variant="outline"
                      className="w-full h-20 text-xl flex flex-col"
                      size="lg"
                    >
                      <div className="text-2xl">?</div>
                      <div className="text-sm mt-1">Не определено (N)</div>
                    </Button>
                  </div>
                </Card>

                {/* Info card */}
                <Card className="p-4">
                  <h4 className="font-semibold mb-2 text-sm">Информация:</h4>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>ID: {currentBottle.id}</div>
                    <div>Type: {currentBottle.object_type}</div>
                    <div>Subtype: {currentBottle.object_subtype || 'N/A'}</div>
                    <div>Source: {currentBottle.source}</div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-600">Нет бутылок для проверки</p>
          </div>
        )}
      </div>
    </div>
  )
}

