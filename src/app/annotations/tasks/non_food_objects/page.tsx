'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import dynamic from 'next/dynamic'
import { useHotkeys } from '@/hooks/useHotkeys'

const BBoxAnnotator = dynamic(() => import('@/components/BBoxAnnotator'), { ssr: false })

/**
 * Non-Food Objects Task UI
 * Создание bbox для non-food объектов
 * 
 * Фокус: Быстрое создание bbox и выбор типа объекта
 * Layout: Изображение с BBoxAnnotator (рисование) + список non-food типов
 * Hotkeys: D (рисовать), 1-6 (выбор типа), Esc, Enter
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

const NON_FOOD_OBJECTS = [
  { id: 'hand', name: 'Рука', icon: '✋' },
  { id: 'phone', name: 'Телефон', icon: '📱' },
  { id: 'wallet', name: 'Кошелек', icon: '👛' },
  { id: 'cards', name: 'Карты', icon: '💳' },
  { id: 'cutlery', name: 'Столовые приборы', icon: '🍴' },
  { id: 'other', name: 'Другое', icon: '📦' }
]

export default function NonFoodObjectsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tier = searchParams.get('tier')

  const [taskData, setTaskData] = useState<TaskData | null>(null)
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [drawingMode, setDrawingMode] = useState(true)
  const [activeImage, setActiveImage] = useState<'Main' | 'Qualifying'>('Main')
  const [pendingBBox, setPendingBBox] = useState<{bbox_x1: number; bbox_y1: number; bbox_x2: number; bbox_y2: number; image_id: number} | null>(null)
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)

  useEffect(() => {
    fetchNextTask()
  }, [tier])

  const fetchNextTask = async () => {
    try {
      setLoading(true)
      const url = tier
        ? `/api/annotations/tasks/next?task_type=non_food_objects&tier=${tier}`
        : `/api/annotations/tasks/next?task_type=non_food_objects`
      
      const response = await fetch(url)
      
      if (response.status === 404) {
        setTaskData(null)
        return
      }

      const data = await response.json()
      setTaskData(data)
      setImages(data.images)
      setDrawingMode(true) // По умолчанию включен режим рисования
    } catch (error) {
      console.error('Error fetching task:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAnnotationCreate = async (imageId: number, bbox: { bbox_x1: number; bbox_y1: number; bbox_x2: number; bbox_y2: number }) => {
    setPendingBBox({ ...bbox, image_id: imageId })
    setDrawingMode(false) // Выключаем режим рисования до выбора типа
  }

  const finishAnnotationCreate = async (objectSubtype: string) => {
    if (!pendingBBox || !taskData) return
    
    try {
      const response = await fetch('/api/annotations/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: pendingBBox.image_id,
          object_type: 'non_food',
          object_subtype: objectSubtype,
          dish_index: null,
          bbox_x1: pendingBBox.bbox_x1,
          bbox_y1: pendingBBox.bbox_y1,
          bbox_x2: pendingBBox.bbox_x2,
          bbox_y2: pendingBBox.bbox_y2,
          is_overlapped: false,
          is_bottle_up: null,
          is_error: false
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error('Failed to create annotation')
      }

      const newAnnotation = result.data

      // Обновляем локальное состояние
      setImages(prev => prev.map(img =>
        img.id === pendingBBox.image_id
          ? { ...img, annotations: [...img.annotations, newAnnotation] }
          : img
      ))

      setPendingBBox(null)
      setDrawingMode(true) // Включаем режим рисования снова
      setSelectedAnnotation(newAnnotation)
    } catch (error) {
      console.error('Error creating annotation:', error)
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
              completed_by: 'non_food_objects_ui',
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

  // Горячие клавиши
  useHotkeys([
    {
      key: 'd',
      handler: () => {
        setDrawingMode(prev => !prev)
      }
    },
    {
      key: 'Escape',
      handler: () => {
        if (pendingBBox) {
          setPendingBBox(null)
          setDrawingMode(true)
          return
        }
        
        if (selectedAnnotation) {
          setSelectedAnnotation(null)
        } else {
          handleSkip()
        }
      }
    },
    {
      key: 'Tab',
      handler: (e) => {
        e.preventDefault()
        setActiveImage(prev => prev === 'Main' ? 'Qualifying' : 'Main')
      }
    },
    {
      key: 'Enter',
      handler: () => {
        handleComplete()
      }
    },
    // Цифры 1-6 для быстрого выбора типа объекта
    ...Array.from({ length: 6 }, (_, i) => ({
      key: String(i + 1),
      handler: () => {
        if (pendingBBox) {
          finishAnnotationCreate(NON_FOOD_OBJECTS[i].id)
        }
      }
    }))
  ])

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
            Все задачи non-food объектов {tier && `(Tier ${tier})`} выполнены!
          </p>
          <Button onClick={() => router.push('/annotations/tasks')}>
            ← Вернуться к списку задач
          </Button>
        </Card>
      </div>
    )
  }

  const currentImage = images?.find(img => img.photo_type === activeImage)
  const nonFoodCount = currentImage?.annotations.filter(a => a.object_type === 'non_food').length || 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Маркировка non-food объектов</h1>
              <p className="text-sm text-gray-600">
                Recognition {taskData.recognition.recognition_id} | Tier {taskData.recognition.tier}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge>
                Non-food: {nonFoodCount}
              </Badge>
              <Button variant="outline" onClick={handleSkip}>
                Пропустить (Esc)
              </Button>
              <Button onClick={handleComplete}>
                Завершить (Enter)
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Hotkeys hint */}
      <Card className="max-w-7xl mx-auto mx-6 mt-4 p-3 bg-blue-50 border-blue-200">
        <div className="text-sm">
          <span className="font-medium">Hotkeys:</span> D - рисовать | 1-6 - выбор типа объекта | 
          Tab - переключить Main/Qualifying | Enter - завершить | Esc - отмена/пропустить
        </div>
      </Card>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar - Типы non-food объектов */}
          <div className="col-span-3">
            <Card className="p-4">
              <h3 className="font-semibold mb-3 text-sm text-gray-700">Типы объектов</h3>
              <div className="space-y-2">
                {NON_FOOD_OBJECTS.map((obj, index) => (
                  <button
                    key={obj.id}
                    className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-center gap-3 text-sm rounded border ${
                      pendingBBox ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                    }`}
                    onClick={() => {
                      if (pendingBBox) {
                        finishAnnotationCreate(obj.id)
                      }
                    }}
                    disabled={!pendingBBox}
                  >
                    <span className="text-2xl">{obj.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium text-gray-700">
                        <span className="text-xs bg-gray-200 px-1 rounded">{index + 1}</span> {obj.name}
                      </div>
                      <div className="text-xs text-gray-500">{obj.id}</div>
                    </div>
                  </button>
                ))}
              </div>
              
              <div className="mt-6 p-3 bg-gray-100 rounded text-xs text-gray-600">
                {pendingBBox ? (
                  <p className="font-medium text-blue-600">
                    👆 Выберите тип объекта выше или нажмите 1-6
                  </p>
                ) : (
                  <p>
                    Нарисуйте bbox на изображении (D для включения/выключения режима рисования)
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Image */}
          <div className="col-span-9">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm"
                    variant={activeImage === 'Main' ? 'default' : 'outline'}
                    onClick={() => setActiveImage('Main')}
                  >
                    Main (45°)
                  </Button>
                  <Button 
                    size="sm"
                    variant={activeImage === 'Qualifying' ? 'default' : 'outline'}
                    onClick={() => setActiveImage('Qualifying')}
                  >
                    Qualifying (90°)
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={drawingMode ? 'default' : 'outline'}
                    onClick={() => setDrawingMode(prev => !prev)}
                  >
                    {drawingMode ? 'Рисование ВКЛ' : 'Рисование ВЫКЛ'} (D)
                  </Button>
                </div>
              </div>
              <div className="h-[calc(100vh-280px)] rounded border relative bg-gray-100">
                {currentImage && (
                  <BBoxAnnotator
                    imageUrl={`/api/bbox-images/${currentImage.storage_path}`}
                    annotations={currentImage.annotations}
                    originalAnnotations={null}
                    imageId={currentImage.id}
                    dishNames={{}}
                    selectedDishIndex={null}
                    onAnnotationCreate={(bbox) => handleAnnotationCreate(currentImage.id, bbox)}
                    onAnnotationUpdate={() => {}}
                    onAnnotationSelect={setSelectedAnnotation}
                    selectedAnnotation={selectedAnnotation}
                    drawingMode={drawingMode}
                    referenceWidth={currentImage.photo_type === 'Main' ? 1810 : 1410}
                    referenceHeight={1080}
                  />
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Modal для выбора типа (альтернативный вариант, если hotkeys не используются) */}
      {pendingBBox && (
        <div className="fixed bottom-4 right-4 z-50">
          <Card className="p-4 shadow-2xl">
            <p className="text-sm font-medium mb-2">Выберите тип объекта:</p>
            <div className="flex gap-2">
              {NON_FOOD_OBJECTS.slice(0, 3).map((obj, index) => (
                <Button
                  key={obj.id}
                  size="sm"
                  onClick={() => finishAnnotationCreate(obj.id)}
                >
                  {obj.icon} {index + 1}
                </Button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

