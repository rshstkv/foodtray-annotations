/**
 * Unified Dish Validation Task
 * Объединяет count_validation и dish_selection в одну задачу
 * 
 * Режимы:
 * 1. Quick Validation: counts совпадают → быстрая проверка с кнопками действий
 * 2. Edit Mode: counts не совпадают → редактирование bbox
 */

'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTaskEngine } from '@/hooks/useTaskEngine'
import { useAnnotations } from '@/hooks/useAnnotations'
import { useHotkeys } from '@/hooks/useHotkeys'
import dynamic from 'next/dynamic'
import { DishList } from '@/components/tasks/DishList'
import type { Image, Annotation } from '@/types/annotations'

const BBoxAnnotator = dynamic(() => import('@/components/BBoxAnnotator'), { ssr: false })

export default function DishValidationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tier = searchParams.get('tier')
  const queueParam = searchParams.get('queue') as 'pending' | 'requires_correction' | null
  const modeParam = searchParams.get('mode') as 'quick' | 'edit' | null
  const [queue, setQueue] = useState<'pending' | 'requires_correction'>(
    queueParam || 'pending'
  )

  // Определяем tier фильтры на основе mode
  const effectiveTier = useMemo(() => {
    if (tier) return parseInt(tier)
    return undefined
  }, [tier])
  
  const minTier = useMemo(() => {
    if (tier) return undefined
    if (modeParam === 'edit') return 3 // Edit mode = tier >= 3 (только с несовпадениями)
    return undefined
  }, [tier, modeParam])
  
  const maxTier = useMemo(() => {
    if (tier) return undefined
    if (modeParam === 'quick') return 2 // Quick mode = tier <= 2 (все где M=Q=Expected)
    return undefined
  }, [tier, modeParam])

  console.log('[DishValidation] Config:', { tier, modeParam, effectiveTier, minTier, maxTier, queue })

  const {
    taskData,
    loading,
    completing,
    completeTask,
    skipTask,
    flagTask,
  } = useTaskEngine({
    taskType: 'dish_validation',
    tier: effectiveTier,
    minTier,
    maxTier,
    queue,
  })

  const {
    images,
    setLocalImages,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    updateAnnotationLocally,
  } = useAnnotations(taskData?.images || [])

  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)
  const [drawingMode, setDrawingMode] = useState(false)
  const [activeImage, setActiveImage] = useState<'Main' | 'Qualifying'>('Main')
  const [highlightedDishIndex, setHighlightedDishIndex] = useState<number | null>(null)
  const [selectedBBoxIndexInDish, setSelectedBBoxIndexInDish] = useState<number>(0)
  const [showAllBBoxes, setShowAllBBoxes] = useState(true) // H - показать/скрыть все bbox (по умолчанию показываем все)
  const [pendingBBox, setPendingBBox] = useState<{
    bbox_x1: number
    bbox_y1: number
    bbox_x2: number
    bbox_y2: number
    image_id: number
  } | null>(null)

  // Sync taskData images to annotations hook ONLY on initial load
  const taskIdRef = useRef<string | null>(null)
  if (taskData && taskData.recognition.recognition_id !== taskIdRef.current) {
    taskIdRef.current = taskData.recognition.recognition_id
    setLocalImages(taskData.images)
  }

  const mainImage = images?.find((img: Image) => img.photo_type === 'Main')
  const qualifyingImage = images?.find((img: Image) => img.photo_type === 'Qualifying')

  const mainCount = mainImage?.annotations.filter((a) => a.dish_index !== null).length || 0
  const qualCount = qualifyingImage?.annotations.filter((a) => a.dish_index !== null).length || 0
  const expectedCount =
    taskData?.recognition?.correct_dishes?.reduce(
      (sum, dish) => sum + dish.Count,
      0
    ) || 0

  const isAligned = mainCount === qualCount && mainCount === expectedCount
  const mode = isAligned ? 'quick_validation' : 'edit_mode'

  console.log('[DishValidation] Task loaded:', { 
    recognition_id: taskData?.recognition?.recognition_id,
    tier: taskData?.recognition?.tier,
    mainCount, 
    qualCount, 
    expectedCount, 
    isAligned, 
    mode 
  })

  // Handlers
  const handleDishClick = useCallback((dishIndex: number) => {
    // Проверяем что блюдо с таким индексом существует
    if (!taskData?.recognition?.correct_dishes?.[dishIndex]) {
      console.log(`[DishValidation] Dish ${dishIndex} does not exist`)
      return
    }
    
    // Если кликнули на тот же блюдо - переключаемся к следующему bbox этого блюда
    if (highlightedDishIndex === dishIndex) {
      const currentImage = images.find(img => img.photo_type === activeImage)
      const dishBBoxes = currentImage?.annotations.filter(ann => ann.dish_index === dishIndex) || []
      
      if (dishBBoxes.length > 0) {
        const nextIndex = (selectedBBoxIndexInDish + 1) % dishBBoxes.length
        setSelectedBBoxIndexInDish(nextIndex)
        setSelectedAnnotation(dishBBoxes[nextIndex])
      }
    } else {
      // Новое блюдо - показываем его первый bbox
      setHighlightedDishIndex(dishIndex)
      setSelectedBBoxIndexInDish(0)
      setShowAllBBoxes(false) // Скрываем остальные bbox
      setDrawingMode(false)
      
      const currentImage = images.find(img => img.photo_type === activeImage)
      const dishBBoxes = currentImage?.annotations.filter(ann => ann.dish_index === dishIndex) || []
      if (dishBBoxes.length > 0) {
        setSelectedAnnotation(dishBBoxes[0])
      } else {
        setSelectedAnnotation(null)
      }
    }
  }, [highlightedDishIndex, selectedBBoxIndexInDish, images, activeImage, taskData])

  const handleAnnotationCreate = async (
    imageId: number,
    bbox: {
      bbox_x1: number
      bbox_y1: number
      bbox_x2: number
      bbox_y2: number
    }
  ) => {
    setPendingBBox({ ...bbox, image_id: imageId })
  }

  const finishAnnotationCreate = async (dishIndex: number) => {
    if (!pendingBBox) return

    await createAnnotation({
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
      is_error: false,
    })

    setPendingBBox(null)
    setDrawingMode(false)
  }

  const handleComplete = async () => {
    await completeTask()
  }

  const handleBBoxError = async () => {
    await flagTask('bbox_error', 'Bounding boxes неправильные (границы или привязка к блюду)')
  }

  const handleCheckError = async () => {
    await flagTask('check_error', 'Ошибка в чеке (неверные данные заказа)')
  }

  const handleBuzzerPresent = async () => {
    await flagTask('buzzer_present', 'На изображениях присутствуют баззеры, требуется разметка')
  }

  // Hotkeys
  useHotkeys([
    {
      key: 'h',
      handler: () => setShowAllBBoxes((prev) => !prev),
    },
    {
      key: 'd',
      handler: () => {
        // В quick_validation mode рисование запрещено
        if (mode === 'quick_validation') {
          console.log('Drawing is disabled in quick validation mode')
          return
        }
        setDrawingMode((prev) => !prev)
      },
    },
    {
      key: 'Delete',
      handler: () => {
        // В quick_validation mode удаление запрещено
        if (mode === 'quick_validation') {
          console.log('Deletion is disabled in quick validation mode')
          return
        }
        if (selectedAnnotation) {
          deleteAnnotation(selectedAnnotation.id)
        }
      },
    },
    {
      key: 'Backspace',
      handler: (e) => {
        e.preventDefault()
        // В quick_validation mode удаление запрещено
        if (mode === 'quick_validation') {
          console.log('Deletion is disabled in quick validation mode')
          return
        }
        if (selectedAnnotation) {
          deleteAnnotation(selectedAnnotation.id)
        }
      },
    },
    {
      key: 'Escape',
      handler: () => {
        if (pendingBBox) {
          setPendingBBox(null)
          return
        }
        if (selectedAnnotation || highlightedDishIndex !== null) {
          setHighlightedDishIndex(null)
          setSelectedAnnotation(null)
          setShowAllBBoxes(true) // Показать все bbox при отмене
          return
        }
        skipTask()
      },
    },
    {
      key: 'ArrowLeft',
      handler: (e) => {
        e.preventDefault()
        const currentImage = images.find(img => img.photo_type === activeImage)
        const allBBoxes = currentImage?.annotations.filter(ann => ann.dish_index !== null) || []
        
        if (allBBoxes.length === 0) return
        
        const currentIndex = selectedAnnotation 
          ? allBBoxes.findIndex(ann => ann.id === selectedAnnotation.id)
          : 0
        
        const prevIndex = currentIndex <= 0 ? allBBoxes.length - 1 : currentIndex - 1
        setSelectedAnnotation(allBBoxes[prevIndex])
        setHighlightedDishIndex(allBBoxes[prevIndex].dish_index)
        setShowAllBBoxes(false) // Показываем только текущее блюдо
      },
    },
    {
      key: 'ArrowRight',
      handler: (e) => {
        e.preventDefault()
        const currentImage = images.find(img => img.photo_type === activeImage)
        const allBBoxes = currentImage?.annotations.filter(ann => ann.dish_index !== null) || []
        
        if (allBBoxes.length === 0) return
        
        const currentIndex = selectedAnnotation 
          ? allBBoxes.findIndex(ann => ann.id === selectedAnnotation.id)
          : -1
        
        const nextIndex = (currentIndex + 1) % allBBoxes.length
        setSelectedAnnotation(allBBoxes[nextIndex])
        setHighlightedDishIndex(allBBoxes[nextIndex].dish_index)
        setShowAllBBoxes(false) // Показываем только текущее блюдо
      },
    },
    {
      key: 'Tab',
      handler: (e) => {
        e.preventDefault()
        const newActiveImage = activeImage === 'Main' ? 'Qualifying' : 'Main'
        setActiveImage(newActiveImage)
        
        // Если есть выбранное блюдо, найдем его bbox на новом изображении
        if (highlightedDishIndex !== null) {
          const newImage = images.find(img => img.photo_type === newActiveImage)
          const dishBBoxes = newImage?.annotations.filter(ann => ann.dish_index === highlightedDishIndex) || []
          if (dishBBoxes.length > 0) {
            setSelectedBBoxIndexInDish(0)
            setSelectedAnnotation(dishBBoxes[0])
          } else {
            setSelectedAnnotation(null)
          }
        }
      },
    },
    {
      key: 'Enter',
      handler: (e) => {
        e.preventDefault()
        if (isAligned) {
          handleComplete()
        }
      },
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      key: String(i + 1),
      handler: () => {
        if (pendingBBox) {
          finishAnnotationCreate(i)
        } else {
          handleDishClick(i)
        }
      },
    })),
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
            Все задачи проверки блюд {tier && `(Tier ${tier})`} выполнены!
          </p>
          <Button onClick={() => router.push('/annotations/tasks')}>
            ← Вернуться к списку задач
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-4 mb-1">
                <h1 className="text-xl font-bold">Проверка блюд и количества</h1>
                <Select value={queue} onValueChange={(value: 'pending' | 'requires_correction') => setQueue(value)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">📝 Новые задачи</SelectItem>
                    <SelectItem value="requires_correction">⚠️ Требуют исправления</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-gray-600">
                Recognition {taskData.recognition.recognition_id} | Tier{' '}
                {taskData.recognition.tier} |{' '}
                <span className={
                  queue === 'requires_correction'
                    ? 'text-red-600 font-medium'
                    : mode === 'quick_validation'
                      ? 'text-green-600 font-medium'
                      : 'text-orange-600 font-medium'
                }>
                  {queue === 'requires_correction' 
                    ? '⚠️ Требуют исправления' 
                    : mode === 'quick_validation' 
                      ? 'Быстрая проверка' 
                      : 'Редактирование'}
                </span>
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
                  <div
                    className={`text-2xl font-bold ${
                      mainCount === expectedCount
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {mainCount}
                  </div>
                </div>
                <div className="text-gray-400">&</div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Qualifying</div>
                  <div
                    className={`text-2xl font-bold ${
                      qualCount === expectedCount
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {qualCount}
                  </div>
                </div>
              </div>

              {/* Actions */}
              {mode === 'quick_validation' ? (
                <div className="border-l pl-4 flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleBBoxError}
                    disabled={completing}
                  >
                    ❌ Неверные bbox
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleCheckError}
                    disabled={completing}
                  >
                    ⚠️ Ошибка в чеке
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleBuzzerPresent}
                    disabled={completing}
                  >
                    🔔 Есть баззер
                  </Button>
                  <Button
                    onClick={handleComplete}
                    disabled={completing}
                    size="lg"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {completing ? 'Сохранение...' : '✅ ВСЁ ВЕРНО'}
                  </Button>
                </div>
              ) : (
                <div className="border-l pl-4 flex items-center gap-2">
                  {selectedAnnotation && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => deleteAnnotation(selectedAnnotation.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      🗑️ Удалить bbox
                    </Button>
                  )}
                  <Button variant="outline" onClick={skipTask}>
                    Пропустить (Esc)
                  </Button>
                  {isAligned && (
                    <Button
                      onClick={handleComplete}
                      disabled={completing}
                      size="lg"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {completing ? 'Сохранение...' : '✅ Готово'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hotkeys hint */}
      <Card className="max-w-[1920px] mx-auto mx-6 mt-4 p-3 bg-blue-50 border-blue-200">
        <div className="text-sm">
          <span className="font-medium">Hotkeys:</span> H - показать все bbox | 
          {mode === 'edit_mode' && 'D - рисовать | Del - удалить | '}
          1-9 - выбор блюда (повтор = след. bbox) | ← → - навигация по bbox | 
          Tab - переключить Main/Qualifying | Enter - завершить | Esc - отмена
        </div>
      </Card>

      {/* Main Content */}
      <div className="max-w-[1920px] mx-auto p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar - Список блюд */}
          <div className="col-span-3">
            <DishList
              dishes={taskData.recognition.correct_dishes}
              images={images}
              onDishClick={handleDishClick}
              highlightedIndex={highlightedDishIndex}
              className="h-[calc(100vh-220px)] overflow-y-auto"
            />
          </div>

          {/* Images Side by Side */}
          <div className="col-span-9">
            <div className="grid grid-cols-2 gap-4">
              {/* Main Image */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Main (45°)</h3>
                    {!showAllBBoxes && selectedAnnotation && selectedAnnotation.dish_index !== null && activeImage === 'Main' && mainImage && (
                      <Badge variant="outline" className="text-xs">
                        bbox {selectedBBoxIndexInDish + 1} / {mainImage.annotations.filter(ann => ann.dish_index === selectedAnnotation.dish_index).length || 0}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        mainCount === expectedCount
                          ? 'bg-green-500'
                          : 'bg-red-500'
                      }
                    >
                      {mainCount} bbox
                    </Badge>
                    {!isAligned && (
                      <Button
                        size="sm"
                        variant={
                          activeImage === 'Main' && drawingMode
                            ? 'default'
                            : 'outline'
                        }
                        onClick={() => {
                          setActiveImage('Main')
                          setDrawingMode(true)
                        }}
                      >
                        Рисовать (D)
                      </Button>
                    )}
                  </div>
                </div>
                <div
                  className="h-[calc(100vh-320px)] rounded border relative bg-gray-100 cursor-pointer"
                  onClick={() => setActiveImage('Main')}
                >
                  {mainImage && (
                    <BBoxAnnotator
                      imageUrl={`/api/bbox-images/${mainImage.storage_path}`}
                      annotations={
                        !showAllBBoxes && selectedAnnotation && selectedAnnotation.dish_index !== null
                          ? mainImage.annotations.filter(ann => 
                              ann.dish_index === selectedAnnotation.dish_index || 
                              ann.dish_index === null // Всегда показываем plate
                            )
                          : mainImage.annotations
                      }
                      originalAnnotations={mainImage.original_annotations}
                      imageId={mainImage.id}
                      highlightDishIndex={highlightedDishIndex}
                      onAnnotationCreate={(bbox) =>
                        handleAnnotationCreate(mainImage.id, bbox)
                      }
                      onAnnotationUpdate={updateAnnotation}
                      onAnnotationSelect={setSelectedAnnotation}
                      selectedAnnotation={selectedAnnotation}
                      drawingMode={activeImage === 'Main' && drawingMode}
                      readOnly={mode === 'quick_validation' && !selectedAnnotation}
                      showControls={false}
                      updateAnnotationLocally={updateAnnotationLocally}
                      referenceWidth={1810}
                      referenceHeight={1080}
                    />
                  )}
                </div>
              </Card>

              {/* Qualifying Image */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Qualifying (90°)</h3>
                    {!showAllBBoxes && selectedAnnotation && selectedAnnotation.dish_index !== null && activeImage === 'Qualifying' && qualifyingImage && (
                      <Badge variant="outline" className="text-xs">
                        bbox {selectedBBoxIndexInDish + 1} / {qualifyingImage.annotations.filter(ann => ann.dish_index === selectedAnnotation.dish_index).length || 0}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        qualCount === expectedCount
                          ? 'bg-green-500'
                          : 'bg-red-500'
                      }
                    >
                      {qualCount} bbox
                    </Badge>
                    {!isAligned && (
                      <Button
                        size="sm"
                        variant={
                          activeImage === 'Qualifying' && drawingMode
                            ? 'default'
                            : 'outline'
                        }
                        onClick={() => {
                          setActiveImage('Qualifying')
                          setDrawingMode(true)
                        }}
                      >
                        Рисовать (D)
                      </Button>
                    )}
                  </div>
                </div>
                <div
                  className="h-[calc(100vh-320px)] rounded border relative bg-gray-100 cursor-pointer"
                  onClick={() => setActiveImage('Qualifying')}
                >
                  {qualifyingImage && (
                    <BBoxAnnotator
                      imageUrl={`/api/bbox-images/${qualifyingImage.storage_path}`}
                      annotations={
                        !showAllBBoxes && selectedAnnotation && selectedAnnotation.dish_index !== null
                          ? qualifyingImage.annotations.filter(ann => 
                              ann.dish_index === selectedAnnotation.dish_index || 
                              ann.dish_index === null // Всегда показываем plate
                            )
                          : qualifyingImage.annotations
                      }
                      originalAnnotations={qualifyingImage.original_annotations}
                      imageId={qualifyingImage.id}
                      highlightDishIndex={highlightedDishIndex}
                      onAnnotationCreate={(bbox) =>
                        handleAnnotationCreate(qualifyingImage.id, bbox)
                      }
                      onAnnotationUpdate={updateAnnotation}
                      onAnnotationSelect={setSelectedAnnotation}
                      selectedAnnotation={selectedAnnotation}
                      drawingMode={activeImage === 'Qualifying' && drawingMode}
                      readOnly={mode === 'quick_validation' && !selectedAnnotation}
                      showControls={false}
                      updateAnnotationLocally={updateAnnotationLocally}
                      referenceWidth={1410}
                      referenceHeight={1080}
                    />
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Modal для выбора блюда */}
      {pendingBBox && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-md">
            <h3 className="text-lg font-semibold mb-4">Выберите блюдо:</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {taskData.recognition.correct_dishes.map((dish, index) => (
                <button
                  key={index}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3 text-sm rounded border"
                  onClick={() => finishAnnotationCreate(index)}
                >
                  <div className="flex-1">
                    <span className="font-medium text-gray-700">
                      [{index + 1}]
                    </span>
                    <span className="text-gray-900 ml-2">
                      {dish.Dishes[0]?.Name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => setPendingBBox(null)}
            >
              Отмена (Esc)
            </Button>
          </Card>
        </div>
      )}
    </div>
  )
}

