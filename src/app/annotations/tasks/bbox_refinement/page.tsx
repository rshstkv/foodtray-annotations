'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import dynamic from 'next/dynamic'
import { useHotkeys } from '@/hooks/useHotkeys'

const BBoxAnnotator = dynamic(() => import('@/components/BBoxAnnotator'), { ssr: false })

/**
 * BBox Refinement Task UI
 * Точная настройка границ bbox
 * 
 * Фокус: Уточнение границ bbox с помощью arrow keys
 * Layout: Изображение с BBoxAnnotator (редактирование) + qwen разметка
 * Hotkeys: Arrow keys (перемещение), Ctrl+Arrow (изменение размера), 1-9 (выбор bbox), Enter (следующий/завершить)
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
  original_annotations?: {
    qwen_dishes_detections?: unknown[]
    qwen_plates_detections?: unknown[]
  } | null
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

const DISH_COLORS = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16'
]

export default function BBoxRefinementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tier = searchParams.get('tier')

  const [taskData, setTaskData] = useState<TaskData | null>(null)
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)
  const [activeImage, setActiveImage] = useState<'Main' | 'Qualifying'>('Main')

  useEffect(() => {
    fetchNextTask()
  }, [tier])

  const fetchNextTask = async () => {
    try {
      setLoading(true)
      const url = tier
        ? `/api/annotations/tasks/next?task_type=bbox_refinement&tier=${tier}`
        : `/api/annotations/tasks/next?task_type=bbox_refinement`
      
      const response = await fetch(url)
      
      if (response.status === 404) {
        setTaskData(null)
        return
      }

      const data = await response.json()
      setTaskData(data)
      setImages(data.images)
      
      // Автоматически выбираем первый bbox
      if (data.images.length > 0 && data.images[0].annotations.length > 0) {
        setSelectedAnnotation(data.images[0].annotations[0])
      }
    } catch (error) {
      console.error('Error fetching task:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAnnotationUpdate = async (id: number, updates: Partial<Annotation>) => {
    if (id === -1) return
    
    try {
      const annotation = images
        .flatMap(img => img.annotations)
        .find(a => a.id === id)

      if (!annotation) return

      // Обновляем локально
      setImages(prev => prev.map(img => ({
        ...img,
        annotations: img.annotations.map(ann =>
          ann.id === id ? { ...ann, ...updates } : ann
        )
      })))

      if (selectedAnnotation?.id === id) {
        setSelectedAnnotation(prev => prev ? { ...prev, ...updates } : null)
      }

      // Отправляем на сервер
      await fetch(`/api/annotations/annotations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updates,
          current_bbox_x1: annotation.bbox_x1,
          current_bbox_y1: annotation.bbox_y1,
          current_bbox_x2: annotation.bbox_x2,
          current_bbox_y2: annotation.bbox_y2
        })
      })
    } catch (error) {
      console.error('Error updating annotation:', error)
    }
  }

  const selectNextBbox = useCallback(() => {
    const currentImage = images.find(i => i.photo_type === activeImage)
    if (!currentImage) return
    
    const currentIndex = selectedAnnotation 
      ? currentImage.annotations.findIndex(a => a.id === selectedAnnotation.id)
      : -1
    
    const nextIndex = (currentIndex + 1) % currentImage.annotations.length
    setSelectedAnnotation(currentImage.annotations[nextIndex])
  }, [images, activeImage, selectedAnnotation])

  const selectNextBboxForDish = useCallback((dishIndex: number) => {
    const currentImage = images.find(i => i.photo_type === activeImage)
    if (!currentImage) return
    
    const dishAnnotations = currentImage.annotations
      .filter(a => a.dish_index === dishIndex)
      .sort((a, b) => a.id - b.id)
    
    if (dishAnnotations.length === 0) return
    
    if (selectedAnnotation && selectedAnnotation.dish_index === dishIndex) {
      const currentIndex = dishAnnotations.findIndex(a => a.id === selectedAnnotation.id)
      if (currentIndex !== -1) {
        const nextIndex = (currentIndex + 1) % dishAnnotations.length
        setSelectedAnnotation(dishAnnotations[nextIndex])
        return
      }
    }
    
    setSelectedAnnotation(dishAnnotations[0])
  }, [images, activeImage, selectedAnnotation])

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
              completed_by: 'bbox_refinement_ui',
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
      key: 'Enter',
      handler: () => {
        if (selectedAnnotation) {
          selectNextBbox()
        } else {
          handleComplete()
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
      key: 'Escape',
      handler: () => {
        if (selectedAnnotation) {
          setSelectedAnnotation(null)
        } else {
          handleSkip()
        }
      }
    },
    // Цифры 1-9 для выбора блюд
    ...Array.from({ length: 9 }, (_, i) => ({
      key: String(i + 1),
      handler: () => selectNextBboxForDish(i)
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
            Все задачи уточнения bbox {tier && `(Tier ${tier})`} выполнены!
          </p>
          <Button onClick={() => router.push('/annotations/tasks')}>
            ← Вернуться к списку задач
          </Button>
        </Card>
      </div>
    )
  }

  const currentImage = images.find(img => img.photo_type === activeImage)
  const getDishColor = (index: number) => DISH_COLORS[index % DISH_COLORS.length]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Уточнение границ bbox</h1>
              <p className="text-sm text-gray-600">
                Recognition {taskData.recognition.recognition_id} | Tier {taskData.recognition.tier}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
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
          <span className="font-medium">Hotkeys:</span> Arrow keys - перемещение bbox (+ Shift = 10px) | 
          1-9 - выбор блюда | Tab - переключить Main/Qualifying | Enter - следующий bbox | Esc - сброс
        </div>
      </Card>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar - Список блюд */}
          <div className="col-span-3">
            <Card className="p-4 h-[calc(100vh-220px)] overflow-y-auto">
              <h3 className="font-semibold mb-3 text-sm text-gray-700">Блюда</h3>
              <div className="space-y-2">
                {taskData.recognition.correct_dishes.map((dish, index) => {
                  const bboxCount = currentImage?.annotations.filter(a => a.dish_index === index).length || 0
                  
                  if (bboxCount === 0) return null

                  return (
                    <div
                      key={index}
                      className="border rounded p-2 bg-white cursor-pointer hover:bg-gray-50"
                      onClick={() => selectNextBboxForDish(index)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded border-2 border-gray-300"
                            style={{ backgroundColor: getDishColor(index) }}
                          />
                          <span className="text-xs font-mono">#{index + 1}</span>
                        </div>
                        <Badge>{bboxCount} bbox</Badge>
                      </div>
                      <p className="text-xs">{dish.Dishes[0]?.Name || 'Unknown'}</p>
                    </div>
                  )
                })}
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
                {selectedAnnotation && (
                  <Badge>
                    BBox #{selectedAnnotation.id} | Dish #{selectedAnnotation.dish_index !== null ? selectedAnnotation.dish_index + 1 : 'N/A'}
                  </Badge>
                )}
              </div>
              <div className="h-[calc(100vh-280px)] rounded border relative bg-gray-100">
                {currentImage && (
                  <BBoxAnnotator
                    imageUrl={`/api/bbox-images/${currentImage.storage_path}`}
                    annotations={currentImage.annotations}
                    originalAnnotations={currentImage.original_annotations}
                    imageId={currentImage.id}
                    dishNames={{}}
                    selectedDishIndex={selectedAnnotation?.dish_index ?? null}
                    onAnnotationCreate={() => {}}
                    onAnnotationUpdate={handleAnnotationUpdate}
                    onAnnotationSelect={setSelectedAnnotation}
                    selectedAnnotation={selectedAnnotation}
                    drawingMode={false}
                    referenceWidth={currentImage.photo_type === 'Main' ? 1810 : 1410}
                    referenceHeight={1080}
                  />
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

