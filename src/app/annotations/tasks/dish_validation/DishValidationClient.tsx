'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserNav } from '@/components/UserNav'
import { useTaskEngine } from '@/hooks/useTaskEngine'
import { useAnnotations } from '@/hooks/useAnnotations'
import { useHotkeys } from '@/hooks/useHotkeys'
import { DishList } from '@/components/tasks/DishList'
import type { Image, Annotation } from '@/types/annotations'

const BBoxAnnotator = dynamic(() => import('@/components/BBoxAnnotator'), { ssr: false })

type DishValidationClientProps = {
  mode: 'quick' | 'edit'
}

export function DishValidationClient({ mode }: DishValidationClientProps) {
  console.log('[DishValidationClient] Rendering with mode:', mode)
  const router = useRouter()

  const {
    taskData,
    loading,
    completing,
    completeTask,
    skipTask,
    flagTask,
  } = useTaskEngine({
    taskType: 'dish_validation',
    queue: 'pending',
    mode,
  })
  
  console.log('[DishValidationClient] State:', { loading, hasTaskData: !!taskData })

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
  const [highlightedPlate, setHighlightedPlate] = useState(false)
  const [selectedBBoxIndexInDish, setSelectedBBoxIndexInDish] = useState<number>(0)
  const [showAllBBoxes, setShowAllBBoxes] = useState(true)
  const [pendingBBox, setPendingBBox] = useState<{
    bbox_x1: number
    bbox_y1: number
    bbox_x2: number
    bbox_y2: number
    image_id: number
  } | null>(null)

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

  const checkPerDishAlignment = () => {
    if (!taskData?.recognition?.correct_dishes || !mainImage || !qualifyingImage) return false

    return taskData.recognition.correct_dishes.every((dish, dishIndex) => {
      const mainDishCount = mainImage.annotations.filter((a) => a.dish_index === dishIndex).length
      const qualDishCount = qualifyingImage.annotations.filter((a) => a.dish_index === dishIndex).length
      return mainDishCount === dish.Count && qualDishCount === dish.Count
    })
  }

  const isAligned = mainCount === qualCount && mainCount === expectedCount && checkPerDishAlignment()
  const backendMode = (taskData?.recognition?.validation_mode as 'quick' | 'edit' | null) || null
  const displayMode: 'quick' | 'edit' = backendMode ?? mode
  const modeMismatch = backendMode !== null && backendMode !== mode

  console.log('[DishValidation] Task loaded:', {
    recognition_id: taskData?.recognition?.recognition_id,
    mainCount,
    qualCount,
    expectedCount,
    isAligned,
    backendMode,
    displayMode,
    requestedMode: mode,
    modeMismatch,
  })

  const handlePlateClick = useCallback(() => {
    if (highlightedPlate) {
      // Если plate уже выделена, переключаемся на следующий plate bbox
      const currentImage = images.find(img => img.photo_type === activeImage)
      const plateBBoxes = currentImage?.annotations.filter(ann => ann.object_type === 'plate') || []

      if (plateBBoxes.length > 0) {
        const nextIndex = (selectedBBoxIndexInDish + 1) % plateBBoxes.length
        setSelectedBBoxIndexInDish(nextIndex)
        setSelectedAnnotation(plateBBoxes[nextIndex])
      }
    } else {
      // Первый клик на plate
      setHighlightedPlate(true)
      setHighlightedDishIndex(null)
      setSelectedBBoxIndexInDish(0)
      setShowAllBBoxes(false)
      setDrawingMode(false)

      const currentImage = images.find(img => img.photo_type === activeImage)
      const plateBBoxes = currentImage?.annotations.filter(ann => ann.object_type === 'plate') || []
      if (plateBBoxes.length > 0) {
        setSelectedAnnotation(plateBBoxes[0])
      } else {
        setSelectedAnnotation(null)
      }
    }
  }, [highlightedPlate, selectedBBoxIndexInDish, images, activeImage])

  const handleDishClick = useCallback((dishIndex: number) => {
    if (!taskData?.recognition?.correct_dishes?.[dishIndex]) {
      console.log(`[DishValidation] Dish ${dishIndex} does not exist`)
      return
    }

    if (highlightedDishIndex === dishIndex && !highlightedPlate) {
      const currentImage = images.find(img => img.photo_type === activeImage)
      const dishBBoxes = currentImage?.annotations.filter(ann => ann.dish_index === dishIndex) || []

      if (dishBBoxes.length > 0) {
        const nextIndex = (selectedBBoxIndexInDish + 1) % dishBBoxes.length
        setSelectedBBoxIndexInDish(nextIndex)
        setSelectedAnnotation(dishBBoxes[nextIndex])
      }
    } else {
      setHighlightedPlate(false)
      setHighlightedDishIndex(dishIndex)
      setSelectedBBoxIndexInDish(0)
      setShowAllBBoxes(false)
      setDrawingMode(false)

      const currentImage = images.find(img => img.photo_type === activeImage)
      const dishBBoxes = currentImage?.annotations.filter(ann => ann.dish_index === dishIndex) || []
      if (dishBBoxes.length > 0) {
        setSelectedAnnotation(dishBBoxes[0])
      } else {
        setSelectedAnnotation(null)
      }
    }
  }, [highlightedDishIndex, highlightedPlate, selectedBBoxIndexInDish, images, activeImage, taskData])

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

    // dishIndex = -1 означает plate
    const isPlate = dishIndex === -1

    await createAnnotation({
      image_id: pendingBBox.image_id,
      object_type: isPlate ? 'plate' : 'food',
      object_subtype: null,
      dish_index: isPlate ? null : dishIndex,
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

  useHotkeys([
    {
      key: 'h',
      handler: () => setShowAllBBoxes((prev) => !prev),
    },
    {
      key: 'd',
      handler: () => {
        if (displayMode === 'quick') {
          console.log('Drawing is disabled in quick validation mode')
          return
        }
        setDrawingMode((prev) => !prev)
      },
    },
    {
      key: 'Delete',
      handler: () => {
        if (displayMode === 'quick') {
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
        if (displayMode === 'quick') {
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
          setShowAllBBoxes(true)
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
        setShowAllBBoxes(false)
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
        setShowAllBBoxes(false)
      },
    },
    {
      key: 'Tab',
      handler: (e) => {
        e.preventDefault()
        const newActiveImage = activeImage === 'Main' ? 'Qualifying' : 'Main'
        setActiveImage(newActiveImage)

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
    // Клавиша "1" для plates
    {
      key: '1',
      handler: () => {
        if (pendingBBox) {
          // В режиме рисования - создать plate bbox
          finishAnnotationCreate(-1) // -1 означает plate
        } else {
          handlePlateClick()
        }
      },
    },
    // Клавиши "2-9" для блюд из чека
    ...Array.from({ length: 8 }, (_, i) => ({
      key: String(i + 2),
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
            Все задачи проверки блюд ({mode === 'quick' ? 'быстрая проверка' : 'редактирование'}) выполнены!
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
      {/* Компактный Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-[1920px] mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/annotations/tasks')}
                className="text-gray-600 hover:text-gray-900"
              >
                ← К задачам
              </Button>
              <div className="border-l pl-6">
                <h1 className="text-lg font-bold">Проверка блюд</h1>
                <p className="text-xs text-gray-500">
                  Recognition {taskData.recognition.recognition_id}
                </p>
              </div>
              
              {/* Счетчики */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Ожидается:</span>
                <span className="font-bold">{expectedCount}</span>
                <span className="text-gray-400">=</span>
                <span className="text-gray-500">Main:</span>
                <span className={`font-bold ${mainCount === expectedCount ? 'text-green-600' : 'text-red-600'}`}>
                  {mainCount}
                </span>
                <span className="text-gray-400">&</span>
                <span className="text-gray-500">Qual:</span>
                <span className={`font-bold ${qualCount === expectedCount ? 'text-green-600' : 'text-red-600'}`}>
                  {qualCount}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {displayMode === 'quick' ? (
                <>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await fetch(`/api/annotations/tasks/${taskData?.recognition.recognition_id}/move-to-edit`, {
                          method: 'POST'
                        })
                        skipTask()
                      } catch (error) {
                        console.error('[DishValidation] Error moving to edit:', error)
                      }
                    }}
                    disabled={completing}
                  >
                    ❌ Неверные bbox
                  </Button>
                  <Button
                    onClick={handleComplete}
                    disabled={completing}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {completing ? 'Сохранение...' : '✅ ВСЁ ВЕРНО'}
                  </Button>
                </>
              ) : (
                <>
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
                    Пропустить
                  </Button>
                  {isAligned && (
                    <Button
                      onClick={handleComplete}
                      disabled={completing}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {completing ? 'Сохранение...' : '✅ Готово'}
                    </Button>
                  )}
                </>
              )}
              <UserNav />
            </div>
          </div>
        </div>
      </div>

      {modeMismatch && (
        <Card className="max-w-[1920px] mx-auto mx-6 mt-4 p-3 bg-yellow-50 border-yellow-200">
          <div className="text-sm text-yellow-800">
            Сервер выдал задачу в режиме <span className="font-medium">{backendMode}</span>, хотя запрошен режим <span className="font-medium">{mode}</span>.
            Проверьте данные после завершения задачи.
          </div>
        </Card>
      )}

      <Card className="max-w-[1920px] mx-auto mx-6 mt-4 p-3 bg-blue-50 border-blue-200">
        <div className="text-sm">
          <span className="font-medium">Hotkeys:</span> H - показать все bbox |
          {displayMode === 'edit' && 'D - рисовать | Del - удалить | '}
          1 - тарелки | 2-9 - блюда (повтор = след. bbox) | ← → - навигация по bbox |
          Tab - переключить Main/Qualifying | Enter - завершить | Esc - отмена
        </div>
      </Card>

      <div className="max-w-[1920px] mx-auto p-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3 space-y-4">
            {/* Кнопка "Ошибка в чеке" */}
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCheckError}
              disabled={completing}
            >
              ⚠️ Ошибка в чеке
            </Button>
            
            {/* Чекбоксы для особых случаев */}
            <Card className="p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  onChange={(e) => {
                    if (e.target.checked) {
                      handleBuzzerPresent()
                    }
                  }}
                />
                <span className="text-sm">🔔 Есть баззер</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  onChange={(e) => {
                    if (e.target.checked) {
                      flagTask('manual_review', 'Есть другие предметы')
                    }
                  }}
                />
                <span className="text-sm">📦 Есть другие предметы</span>
              </label>
            </Card>
            
            {/* Список объектов (plates + блюда) */}
            <DishList
              dishes={taskData.recognition.correct_dishes}
              images={images}
              onDishClick={handleDishClick}
              onPlateClick={handlePlateClick}
              highlightedIndex={highlightedDishIndex}
              highlightedPlate={highlightedPlate}
              className="h-[calc(100vh-380px)] overflow-y-auto"
            />
          </div>

          <div className="col-span-9">
            <div className="grid grid-cols-2 gap-4">
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
                              ann.dish_index === null
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
                      readOnly={displayMode === 'quick' && !selectedAnnotation}
                      showControls={false}
                      updateAnnotationLocally={updateAnnotationLocally}
                      referenceWidth={1810}
                      referenceHeight={1080}
                    />
                  )}
                </div>
              </Card>

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
                              ann.dish_index === null
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
                      readOnly={displayMode === 'quick' && !selectedAnnotation}
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

