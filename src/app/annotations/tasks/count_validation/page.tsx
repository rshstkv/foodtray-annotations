'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useHotkeys } from '@/hooks/useHotkeys'
import dynamic from 'next/dynamic'

const BBoxAnnotator = dynamic(() => import('@/components/BBoxAnnotator'), { ssr: false })

/**
 * Count Validation Task UI - полноценный редактор
 * 
 * Показывает Main и Qualifying изображения одновременно
 * Позволяет добавлять/удалять/редактировать bbox
 * Показывает qwen разметку полупрозрачно
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
  qwen_detection_index?: number | null
  qwen_detection_type?: string | null
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
    Dishes: Array<{ Name: string; ean?: string }>
  }>
  tier: number
  workflow_state: string
}

interface TaskData {
  recognition: Recognition
  images: Image[]
  task_type: {
    code: string
    name: string
    ui_config: Record<string, unknown>
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

export default function CountValidationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tier = searchParams.get('tier')

  const [taskData, setTaskData] = useState<TaskData | null>(null)
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)
  const [drawingMode, setDrawingMode] = useState(false)
  const [activeImage, setActiveImage] = useState<'Main' | 'Qualifying'>('Main')
  const [pendingBBox, setPendingBBox] = useState<{bbox_x1: number; bbox_y1: number; bbox_x2: number; bbox_y2: number; image_id: number} | null>(null)
  const [selectingDishFor, setSelectingDishFor] = useState<number | null>(null)

  const imagesRef = useRef(images)
  const selectedAnnotationRef = useRef(selectedAnnotation)

  useEffect(() => {
    imagesRef.current = images
    selectedAnnotationRef.current = selectedAnnotation
  }, [images, selectedAnnotation])

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
        setTaskData(null)
        return
      }

      const data = await response.json()
      setTaskData(data)
      setImages(data.images)
    } catch (error) {
      console.error('Error fetching task:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = async () => {
    if (!taskData) return

    try {
      await fetch(`/api/annotations/tasks/${taskData.recognition.recognition_id}/skip`, {
        method: 'POST'
      })
      
      // Загружаем следующую задачу
      await fetchNextTask()
    } catch (error) {
      console.error('Error skipping task:', error)
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

  const handleAnnotationCreate = async (imageId: number, bbox: { bbox_x1: number; bbox_y1: number; bbox_x2: number; bbox_y2: number }) => {
    setPendingBBox({ ...bbox, image_id: imageId })
    setSelectingDishFor(imageId)
  }

  const finishAnnotationCreate = async (dishIndex: number) => {
    if (!pendingBBox || !taskData) return
    
    try {
      const response = await fetch('/api/annotations/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: pendingBBox.image_id,
          object_type: 'food',
          object_subtype: null,
          dish_index: dishIndex,
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
      setSelectingDishFor(null)
      setDrawingMode(false)
      setSelectedAnnotation(newAnnotation)
    } catch (error) {
      console.error('Error creating annotation:', error)
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

  const handleAnnotationDelete = async (annotationId?: number) => {
    const annToDelete = annotationId !== undefined 
      ? images?.flatMap(img => img.annotations).find(a => a.id === annotationId)
      : selectedAnnotation

    if (!annToDelete || annToDelete.id === -1) return

    try {
      const response = await fetch(`/api/annotations/annotations/${annToDelete.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete annotation')
      }

      // Обновляем локально
      setImages(prev => prev.map(img => ({
        ...img,
        annotations: img.annotations.filter(ann => ann.id !== annToDelete.id)
      })))

      if (selectedAnnotation?.id === annToDelete.id) {
        setSelectedAnnotation(null)
      }
    } catch (error) {
      console.error('Error deleting annotation:', error)
    }
  }

  const selectNextBboxForDish = useCallback((dishIndex: number) => {
    setDrawingMode(false)
    
    const img = imagesRef.current.find(i => i.photo_type === activeImage)
    if (!img) return
    
    const dishAnnotations = img.annotations
      .filter(a => a.dish_index === dishIndex)
      .sort((a, b) => a.id - b.id)
    
    if (dishAnnotations.length === 0) return
    
    const currentAnn = selectedAnnotationRef.current
    if (currentAnn && currentAnn.dish_index === dishIndex) {
      const currentIndex = dishAnnotations.findIndex(a => a.id === currentAnn.id)
      if (currentIndex !== -1) {
        const nextIndex = (currentIndex + 1) % dishAnnotations.length
        setSelectedAnnotation(dishAnnotations[nextIndex])
        return
      }
    }
    
    setSelectedAnnotation(dishAnnotations[0])
  }, [activeImage])

  // Горячие клавиши
  useHotkeys([
    {
      key: 'd',
      handler: () => {
        setDrawingMode(prev => !prev)
        if (!drawingMode) {
          setSelectedAnnotation(null)
        }
      }
    },
    {
      key: 'Delete',
      handler: () => {
        if (selectedAnnotation) {
          handleAnnotationDelete()
        }
      }
    },
    {
      key: 'Backspace',
      handler: (e) => {
        e.preventDefault()
        if (selectedAnnotation) {
          handleAnnotationDelete()
        }
      }
    },
    {
      key: 'Escape',
      handler: () => {
        if (pendingBBox) {
          setPendingBBox(null)
          setSelectingDishFor(null)
          return
        }
        
        if (drawingMode) {
          setDrawingMode(false)
          return
        }
        
        setSelectedAnnotation(null)
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
      handler: (e) => {
        e.preventDefault()
        handleComplete()
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
            Все задачи проверки количества {tier && `(Tier ${tier})`} выполнены!
          </p>
          <Button onClick={() => router.push('/annotations/tasks')}>
            ← Вернуться к списку задач
          </Button>
        </Card>
      </div>
    )
  }

  const mainImage = images?.find(img => img.photo_type === 'Main')
  const qualifyingImage = images?.find(img => img.photo_type === 'Qualifying')
  
  const mainCount = mainImage?.annotations.filter(a => a.dish_index !== null).length || 0
  const qualifyingCount = qualifyingImage?.annotations.filter(a => a.dish_index !== null).length || 0
  const expectedCount = taskData?.recognition?.correct_dishes?.reduce((sum, dish) => sum + dish.Count, 0) || 0

  const getDishColor = (index: number) => DISH_COLORS[index % DISH_COLORS.length]

  const getDishAnnotationCount = (dishIndex: number, photoType: string) => {
    const img = images?.find(i => i.photo_type === photoType)
    if (!img) return 0
    return img.annotations.filter(a => a.dish_index === dishIndex).length
  }

  const currentImage = images?.find(img => img.photo_type === activeImage)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
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
                <Button variant="outline" onClick={handleSkip}>
                  Пропустить
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

      {/* Hotkeys hint */}
      <Card className="max-w-[1920px] mx-auto mx-6 mt-4 p-3 bg-blue-50 border-blue-200">
        <div className="text-sm">
          <span className="font-medium">Hotkeys:</span> D - рисовать | Del - удалить | 1-9 - выбор блюда | 
          Tab - переключить Main/Qualifying | Enter - завершить | Esc - сброс
        </div>
      </Card>

      {/* Main Content */}
      <div className="max-w-[1920px] mx-auto p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar - Список блюд */}
          <div className="col-span-3">
            <Card className="p-4 h-[calc(100vh-220px)] overflow-y-auto">
              <h3 className="font-semibold mb-3 text-sm text-gray-700">Блюда из чека</h3>
              <div className="space-y-2">
                {taskData?.recognition?.correct_dishes?.map((dish, index) => {
                  const count = dish.Count || 1
                  const mainBboxCount = getDishAnnotationCount(index, 'Main')
                  const qualBboxCount = getDishAnnotationCount(index, 'Qualifying')
                  const displayName = dish.Dishes[0]?.Name || 'Unknown'

                  return (
                    <div
                      key={index}
                      className="border rounded p-2 bg-white cursor-pointer hover:bg-gray-50"
                      onClick={() => selectNextBboxForDish(index)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded border-2 border-gray-300 flex-shrink-0"
                            style={{ backgroundColor: getDishColor(index) }}
                          />
                          <span className="text-xs font-mono text-gray-500">#{index + 1}</span>
                        </div>
                        <Badge className={mainBboxCount >= count && qualBboxCount >= count ? 'bg-green-500' : 'bg-yellow-500'}>
                          M:{mainBboxCount}/{count} Q:{qualBboxCount}/{count}
                        </Badge>
                      </div>
                      <p className="text-xs font-medium">{displayName}</p>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>

          {/* Images Side by Side */}
          <div className="col-span-9">
            <div className="grid grid-cols-2 gap-4">
              {/* Main Image */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Main (45°)</h3>
                  <div className="flex items-center gap-2">
                    <Badge className={mainCount === expectedCount ? 'bg-green-500' : 'bg-red-500'}>
                      {mainCount} bbox
                    </Badge>
                    <Button 
                      size="sm"
                      variant={activeImage === 'Main' ? 'default' : 'outline'}
                      onClick={() => setActiveImage('Main')}
                    >
                      Активно
                    </Button>
                  </div>
                </div>
                <div className="h-[calc(100vh-320px)] rounded border relative bg-gray-100">
                  {mainImage && (
                    <BBoxAnnotator
                      imageUrl={`/api/bbox-images/${mainImage.storage_path}`}
                      annotations={activeImage === 'Main' ? mainImage.annotations : []}
                      originalAnnotations={mainImage.original_annotations}
                      imageId={mainImage.id}
                      dishNames={{}}
                      selectedDishIndex={selectedAnnotation?.dish_index ?? null}
                      onAnnotationCreate={(bbox) => handleAnnotationCreate(mainImage.id, bbox)}
                      onAnnotationUpdate={handleAnnotationUpdate}
                      onAnnotationSelect={setSelectedAnnotation}
                      selectedAnnotation={activeImage === 'Main' ? selectedAnnotation : null}
                      drawingMode={activeImage === 'Main' && drawingMode}
                      referenceWidth={1810}
                      referenceHeight={1080}
                      onDelete={() => handleAnnotationDelete()}
                    />
                  )}
                  {activeImage !== 'Main' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 text-white">
                      Неактивно (Tab для переключения)
                    </div>
                  )}
                </div>
              </Card>

              {/* Qualifying Image */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Qualifying (90°)</h3>
                  <div className="flex items-center gap-2">
                    <Badge className={qualifyingCount === expectedCount ? 'bg-green-500' : 'bg-red-500'}>
                      {qualifyingCount} bbox
                    </Badge>
                    <Button 
                      size="sm"
                      variant={activeImage === 'Qualifying' ? 'default' : 'outline'}
                      onClick={() => setActiveImage('Qualifying')}
                    >
                      Активно
                    </Button>
                  </div>
                </div>
                <div className="h-[calc(100vh-320px)] rounded border relative bg-gray-100">
                  {qualifyingImage && (
                    <BBoxAnnotator
                      imageUrl={`/api/bbox-images/${qualifyingImage.storage_path}`}
                      annotations={activeImage === 'Qualifying' ? qualifyingImage.annotations : []}
                      originalAnnotations={qualifyingImage.original_annotations}
                      imageId={qualifyingImage.id}
                      dishNames={{}}
                      selectedDishIndex={selectedAnnotation?.dish_index ?? null}
                      onAnnotationCreate={(bbox) => handleAnnotationCreate(qualifyingImage.id, bbox)}
                      onAnnotationUpdate={handleAnnotationUpdate}
                      onAnnotationSelect={setSelectedAnnotation}
                      selectedAnnotation={activeImage === 'Qualifying' ? selectedAnnotation : null}
                      drawingMode={activeImage === 'Qualifying' && drawingMode}
                      referenceWidth={1410}
                      referenceHeight={1080}
                      onDelete={() => handleAnnotationDelete()}
                    />
                  )}
                  {activeImage !== 'Qualifying' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 text-white">
                      Неактивно (Tab для переключения)
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Modal для выбора блюда */}
      {pendingBBox && selectingDishFor !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-md">
            <h3 className="text-lg font-semibold mb-4">Выберите блюдо:</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {taskData?.recognition?.correct_dishes?.map((dish, index) => (
                <button
                  key={index}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors flex items-center gap-3 text-sm rounded border"
                  onClick={() => finishAnnotationCreate(index)}
                >
                  <div 
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getDishColor(index) }}
                  />
                  <div className="flex-1">
                    <span className="font-medium text-gray-700">#{index + 1}</span>
                    <span className="text-gray-600 ml-2">{dish.Dishes[0]?.Name}</span>
                  </div>
                </button>
              ))}
            </div>
            <Button 
              variant="outline" 
              className="w-full mt-4"
              onClick={() => {
                setPendingBBox(null)
                setSelectingDishFor(null)
              }}
            >
              Отмена (Esc)
            </Button>
          </Card>
        </div>
      )}
    </div>
  )
}
