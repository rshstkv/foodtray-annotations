'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { UserNav } from '@/components/UserNav'
import { useTaskEngine } from '@/hooks/useTaskEngine'
import { useAnnotations } from '@/hooks/useAnnotations'
import { useHotkeys } from '@/hooks/useHotkeys'
import { DishList } from '@/components/tasks/DishList'
import type { Image, Annotation } from '@/types/annotations'

const BBoxAnnotator = dynamic(() => import('@/components/BBoxAnnotator'), { ssr: false })

// Non-food объекты (hardcoded)
const NON_FOOD_OBJECTS = [
  { id: 'hand', name: 'Рука', icon: '✋' },
  { id: 'phone', name: 'Телефон', icon: '📱' },
  { id: 'wallet', name: 'Кошелек', icon: '👛' },
  { id: 'cards', name: 'Карты', icon: '💳' },
  { id: 'cutlery', name: 'Столовые приборы', icon: '🍴' },
  { id: 'other', name: 'Другое', icon: '📦' }
]

type DishValidationClientProps = {
  mode: 'quick' | 'edit'
  taskQueue?: 'dish_validation' | 'check_error' | 'buzzer' | 'other_items'
}

export function DishValidationClient({ mode, taskQueue = 'dish_validation' }: DishValidationClientProps) {
  console.log('[DishValidationClient] Rendering with mode:', mode, 'taskQueue:', taskQueue)
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
    taskQueue,
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
  const [localEditMode, setLocalEditMode] = useState(false)
  const [showInstructions, setShowInstructions] = useState(true)
  const [pendingBBox, setPendingBBox] = useState<{
    bbox_x1: number
    bbox_y1: number
    bbox_x2: number
    bbox_y2: number
    image_id: number
  } | null>(null)
  const [activeTab, setActiveTab] = useState<'check' | 'menu' | 'nonfood' | 'plate' | 'buzzer'>('check')
  const [menuSearch, setMenuSearch] = useState('')
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const taskIdRef = useRef<string | null>(null)
  if (taskData && taskData.recognition.recognition_id !== taskIdRef.current) {
    taskIdRef.current = taskData.recognition.recognition_id
    setLocalImages(taskData.images)
    setLocalEditMode(false) // Сбросить локальный edit mode при новой задаче
  }

  // Обработчики для draggable модального окна
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setModalPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset])

  const handleModalMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const modalEl = e.currentTarget.parentElement
    if (!modalEl) return
    
    const rect = modalEl.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
    setIsDragging(true)
  }

  const mainImage = useMemo(() => images?.find((img: Image) => img.photo_type === 'Main'), [images])
  const qualifyingImage = useMemo(() => images?.find((img: Image) => img.photo_type === 'Qualifying'), [images])

  const mainCount = useMemo(() => mainImage?.annotations.filter((a) => a.dish_index !== null).length || 0, [mainImage])
  const qualCount = useMemo(() => qualifyingImage?.annotations.filter((a) => a.dish_index !== null).length || 0, [qualifyingImage])
  const expectedCount = useMemo(() =>
    taskData?.recognition?.correct_dishes?.reduce(
      (sum, dish) => sum + dish.Count,
      0
    ) || 0, [taskData?.recognition?.correct_dishes])

  // Подсчет тарелок
  const mainPlatesCount = useMemo(() => mainImage?.annotations.filter((a) => a.object_type === 'plate').length || 0, [mainImage])
  const qualPlatesCount = useMemo(() => qualifyingImage?.annotations.filter((a) => a.object_type === 'plate').length || 0, [qualifyingImage])

  const checkPerDishAlignment = () => {
    if (!taskData?.recognition?.correct_dishes || !mainImage || !qualifyingImage) return false

    return taskData.recognition.correct_dishes.every((dish, dishIndex) => {
      const mainDishCount = mainImage.annotations.filter((a) => a.dish_index === dishIndex).length
      const qualDishCount = qualifyingImage.annotations.filter((a) => a.dish_index === dishIndex).length
      return mainDishCount === dish.Count && qualDishCount === dish.Count
    })
  }

  const isAligned = mainCount === qualCount && mainCount === expectedCount && checkPerDishAlignment() && mainPlatesCount === qualPlatesCount
  const backendMode = (taskData?.recognition?.validation_mode as 'quick' | 'edit' | null) || null
  // Если localEditMode активен, показываем edit mode независимо от backend
  const displayMode: 'quick' | 'edit' = localEditMode ? 'edit' : (backendMode ?? mode)
  const modeMismatch = backendMode !== null && backendMode !== mode

  console.log('[DishValidation] Task loaded:', {
    recognition_id: taskData?.recognition?.recognition_id,
    mainCount,
    qualCount,
    expectedCount,
    mainPlatesCount,
    qualPlatesCount,
    isAligned,
    backendMode,
    displayMode,
    requestedMode: mode,
    modeMismatch,
  })

  const handlePlateClick = useCallback(() => {
    // В quick mode если plates 0:0 - не выделяем (бесполезно)
    if (displayMode === 'quick' && mainPlatesCount === 0 && qualPlatesCount === 0) {
      return
    }
    
    // При клике на plate подсвечиваем все plates на обеих картинках
    // Используем highlightedDishIndex = -1 как индикатор для plates
    setHighlightedPlate(true)
    setHighlightedDishIndex(-1) // -1 означает plates
    setSelectedBBoxIndexInDish(0)
    setShowAllBBoxes(false) // Показываем только plates
    setDrawingMode(false)
    setSelectedAnnotation(null) // Не выбираем конкретный bbox, просто подсвечиваем все plates
  }, [displayMode, mainPlatesCount, qualPlatesCount])

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

  const finishAnnotationCreate = async (
    objectType: string,
    objectSubtype: string | null,
    dishIndex: number | null,
    isError: boolean = false
  ) => {
    if (!pendingBBox) {
      console.error('[DishValidation] finishAnnotationCreate called but pendingBBox is null')
      return
    }

    console.log('[DishValidation] Creating annotation:', {
      objectType,
      objectSubtype,
      dishIndex,
      pendingBBox,
    })

    const result = await createAnnotation({
      image_id: pendingBBox.image_id,
      object_type: objectType,
      object_subtype: objectSubtype,
      dish_index: dishIndex,
      bbox_x1: pendingBBox.bbox_x1,
      bbox_y1: pendingBBox.bbox_y1,
      bbox_x2: pendingBBox.bbox_x2,
      bbox_y2: pendingBBox.bbox_y2,
      is_overlapped: false,
      is_bottle_up: null,
      is_error: isError,
    })

    console.log('[DishValidation] Annotation created:', result)

    setPendingBBox(null)
    setMenuSearch('')
    setActiveTab('check')
    setModalPosition({ x: 0, y: 0 })
    setDrawingMode(false)
  }

  const handleVariantSelect = async (dishIndex: number, variantIndex: number) => {
    // Обновляем все bbox для этого блюда, устанавливая selected_dish_variant_index
    const mainImage = images?.find((img: Image) => img.photo_type === 'Main')
    const qualImage = images?.find((img: Image) => img.photo_type === 'Qualifying')
    
    const bboxesToUpdate = [
      ...(mainImage?.annotations.filter(a => a.dish_index === dishIndex) || []),
      ...(qualImage?.annotations.filter(a => a.dish_index === dishIndex) || [])
    ]
    
    for (const bbox of bboxesToUpdate) {
      await updateAnnotation(bbox.id, { selected_dish_variant_index: variantIndex })
    }
    
    console.log(`[DishValidation] Selected variant ${variantIndex} for dish ${dishIndex}`)
  }

  const checkVariantsSelected = (): { valid: boolean; missingDishes: number[] } => {
    if (!taskData?.recognition?.correct_dishes) {
      return { valid: true, missingDishes: [] }
    }
    
    const missingDishes: number[] = []
    
    taskData.recognition.correct_dishes.forEach((dish, dishIndex) => {
      const allDishes = dish.Dishes || []
      
      // Если есть несколько вариантов, проверяем что хотя бы один bbox имеет выбранный вариант
      if (allDishes.length > 1) {
        const mainImage = images?.find((img: Image) => img.photo_type === 'Main')
        const qualImage = images?.find((img: Image) => img.photo_type === 'Qualifying')
        
        const dishBboxes = [
          ...(mainImage?.annotations.filter(a => a.dish_index === dishIndex) || []),
          ...(qualImage?.annotations.filter(a => a.dish_index === dishIndex) || [])
        ]
        
        // Если есть bbox для этого блюда, но ни у одного не выбран вариант
        if (dishBboxes.length > 0 && !dishBboxes.some(bbox => bbox.selected_dish_variant_index !== null && bbox.selected_dish_variant_index !== undefined)) {
          missingDishes.push(dishIndex)
        }
      }
    })
    
    return { valid: missingDishes.length === 0, missingDishes }
  }

  const handleComplete = async () => {
    // Проверяем что все варианты выбраны
    const { valid, missingDishes } = checkVariantsSelected()
    
    if (!valid) {
      const dishNames = missingDishes.map(idx => {
        const dish = taskData?.recognition?.correct_dishes[idx]
        return `#${idx + 1}: ${dish?.Dishes[0]?.Name || 'Unknown'}`
      }).join(', ')
      
      alert(`Пожалуйста, выберите конкретный вариант для блюд с неоднозначностью:\n${dishNames}`)
      return
    }
    
    await completeTask()
  }

  const handleCheckError = async () => {
    await flagTask('check_error', 'Ошибка в чеке (неверные данные заказа)')
  }

  const handleDeferToEdit = async () => {
    try {
      const response = await fetch(
        `/api/annotations/tasks/${taskData?.recognition.recognition_id}/defer-to-edit`,
        { method: 'POST' }
      )
      if (response.ok) {
        console.log('[DishValidation] Task deferred to edit mode')
        // Загружаем следующую задачу, остаемся в quick mode
        skipTask()
      } else {
        console.error('[DishValidation] Error deferring task:', await response.text())
      }
    } catch (error) {
      console.error('[DishValidation] Error deferring task:', error)
    }
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
      key: 'Tab',
      handler: (e) => {
        e.preventDefault()
        if (displayMode === 'edit') {
          setActiveImage(prev => prev === 'Main' ? 'Qualifying' : 'Main')
        }
      },
    },
    {
      key: 'ArrowLeft',
      handler: (e) => {
        e.preventDefault()
        
        // Перебираем все объекты: plates (-1) + блюда (0, 1, 2...)
        const hasPlates = mainPlatesCount > 0 || qualPlatesCount > 0
        const dishCount = taskData?.recognition?.correct_dishes?.length || 0
        
        if (!hasPlates && dishCount === 0) return
        
        // Текущий индекс: -1 для plates, 0+ для блюд, null если ничего не выбрано
        let currentIdx = highlightedDishIndex
        if (currentIdx === null) {
          // Ничего не выбрано - начинаем с первого
          currentIdx = hasPlates ? -1 : 0
        }
        
        // Переход к предыдущему
        let prevIdx: number
        if (currentIdx === -1) {
          // С plates -> на последнее блюдо
          prevIdx = dishCount - 1
        } else if (currentIdx === 0) {
          // С первого блюда -> на plates (если есть) или последнее блюдо
          prevIdx = hasPlates ? -1 : dishCount - 1
        } else {
          // Просто предыдущее блюдо
          prevIdx = currentIdx - 1
        }
        
        // Применяем
        if (prevIdx === -1) {
          handlePlateClick()
        } else {
          handleDishClick(prevIdx)
        }
      },
    },
    {
      key: 'ArrowRight',
      handler: (e) => {
        e.preventDefault()
        
        // Перебираем все объекты: plates (-1) + блюда (0, 1, 2...)
        const hasPlates = mainPlatesCount > 0 || qualPlatesCount > 0
        const dishCount = taskData?.recognition?.correct_dishes?.length || 0
        
        if (!hasPlates && dishCount === 0) return
        
        // Текущий индекс: -1 для plates, 0+ для блюд, null если ничего не выбрано
        let currentIdx = highlightedDishIndex
        if (currentIdx === null) {
          // Ничего не выбрано - начинаем с первого
          currentIdx = hasPlates ? -1 : 0
        }
        
        // Переход к следующему
        let nextIdx: number
        if (currentIdx === -1) {
          // С plates -> на первое блюдо (если есть) или обратно на plates
          nextIdx = dishCount > 0 ? 0 : -1
        } else if (currentIdx >= dishCount - 1) {
          // С последнего блюда -> на plates (если есть) или первое блюдо
          nextIdx = hasPlates ? -1 : 0
        } else {
          // Просто следующее блюдо
          nextIdx = currentIdx + 1
        }
        
        // Применяем
        if (nextIdx === -1) {
          handlePlateClick()
        } else {
          handleDishClick(nextIdx)
        }
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
          if (highlightedDishIndex === -1) {
            // Для plates не выбираем конкретный bbox
            setSelectedAnnotation(null)
          } else {
            // Для блюд выбираем первый bbox
            const dishBBoxes = newImage?.annotations.filter(ann => ann.dish_index === highlightedDishIndex) || []
            if (dishBBoxes.length > 0) {
              setSelectedBBoxIndexInDish(0)
              setSelectedAnnotation(dishBBoxes[0])
            } else {
              setSelectedAnnotation(null)
            }
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
          finishAnnotationCreate('plate', null, null, false)
        } else if (displayMode === 'edit' || mainPlatesCount > 0 || qualPlatesCount > 0) {
          // Выделять plates только если:
          // - В edit mode (можно рисовать)
          // - ИЛИ есть plates для просмотра
          handlePlateClick()
        }
        // В quick mode с 0:0 - игнорируем
      },
    },
    // Клавиши "2-9" для блюд из чека
    ...Array.from({ length: 8 }, (_, i) => ({
      key: String(i + 2),
      handler: () => {
        if (pendingBBox) {
          finishAnnotationCreate('food', null, i, false)
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
              
              {/* Счетчики раздельно: блюда и тарелки */}
              <div className="flex items-center gap-4 text-sm">
                {/* Блюда */}
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 font-medium">🍽️ Блюда:</span>
                  <span className="font-bold">{expectedCount}</span>
                  <span className="text-gray-400">=</span>
                  <span className={`font-bold ${mainCount === expectedCount ? 'text-green-600' : 'text-red-600'}`}>
                    {mainCount}
                  </span>
                  <span className="text-gray-400">&</span>
                  <span className={`font-bold ${qualCount === expectedCount ? 'text-green-600' : 'text-red-600'}`}>
                    {qualCount}
                  </span>
                </div>
                
                {/* Разделитель */}
                <div className="h-4 w-px bg-gray-300"></div>
                
                {/* Тарелки */}
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 font-medium">🍽 Тарелки:</span>
                  <span className={`font-bold ${mainPlatesCount === qualPlatesCount ? 'text-green-600' : 'text-red-600'}`}>
                    {mainPlatesCount}
                  </span>
                  <span className="text-gray-400">&</span>
                  <span className={`font-bold ${mainPlatesCount === qualPlatesCount ? 'text-green-600' : 'text-red-600'}`}>
                    {qualPlatesCount}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {displayMode === 'quick' ? (
                <>
                  <Button
                    variant="outline"
                    onClick={handleCheckError}
                    disabled={completing}
                  >
                    ⚠️ Ошибка в чеке
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDeferToEdit}
                    disabled={completing}
                  >
                    ⏭️ Отложить в Edit
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setLocalEditMode(true)}
                    disabled={completing}
                  >
                    ✏️ Править
                  </Button>
                  <Button
                    onClick={handleComplete}
                    disabled={completing}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {completing ? 'Сохранение...' : displayMode === 'edit' ? '✅ Готово' : '✅ ВСЁ ВЕРНО'}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={skipTask}>
                    ⏭️ Пропустить
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

      {/* Компактная инструкция - Apple стиль */}
      <div className="max-w-[1920px] mx-auto mx-6 mt-4">
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          <span className="text-lg">ℹ️</span>
          <span className="font-medium">
            {showInstructions ? 'Скрыть инструкцию' : 'Показать инструкцию'}
          </span>
        </button>
        
        {showInstructions && (
          <Card className="mt-2 p-3 bg-blue-50 border-blue-200 animate-in slide-in-from-top duration-200">
            <div className="text-xs text-blue-900">
              {displayMode === 'quick' ? (
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <strong>Проверьте:</strong> Блюда совпадают с чеком • Тарелки на обеих картинках • Границы bbox правильные
                  </div>
                  <div className="flex-shrink-0">
                    <strong>Кнопки:</strong> ✅ Всё верно • ⏭️ Отложить в Edit • ✏️ Править • ⚠️ Ошибка в чеке
                  </div>
                </div>
              ) : (
                <div>
                  <strong>Edit:</strong> D - рисовать • 1 - тарелки • 2-9 - блюда • Del - удалить • ✅ Готово когда всё совпадает
                </div>
              )}
              <div className="mt-2 pt-2 border-t border-blue-300 text-blue-700">
                <strong>Hotkeys:</strong> H - показать все bbox |
                {displayMode === 'edit' && 'D - рисовать | Del - удалить | '}
                1 - тарелки | 2-9 - блюда | ← → - навигация | Tab - переключить картинку | Enter - готово | Esc - отмена
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="max-w-[1920px] mx-auto p-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3">
            {/* Список объектов (plates + блюда) */}
            <DishList
              dishes={taskData.recognition.correct_dishes}
              images={images}
              onDishClick={handleDishClick}
              onPlateClick={handlePlateClick}
              onVariantSelect={handleVariantSelect}
              onAnnotationUpdate={updateAnnotation}
              onAnnotationDelete={deleteAnnotation}
              highlightedIndex={highlightedDishIndex}
              highlightedPlate={highlightedPlate}
              showControls={displayMode === 'edit'}
              className="max-h-[calc(100vh-280px)] overflow-y-auto pr-2"
            />
          </div>

          <div className="col-span-9">
            {/* Компактный toolbar для edit mode */}
            {displayMode === 'edit' && (
              <div className="flex gap-2 items-center justify-between mb-3 px-2">
                <div className="flex gap-2 items-center text-sm text-gray-600">
                  <span>Активное:</span>
                  <Badge variant={activeImage === 'Main' ? 'default' : 'secondary'} className="text-xs">
                    {activeImage}
                  </Badge>
                  <span className="text-xs text-gray-400">(Tab для переключения)</span>
                </div>
                <Button
                  size="sm"
                  variant={drawingMode ? 'default' : 'outline'}
                  onClick={() => {
                    const newDrawingMode = !drawingMode
                    setDrawingMode(newDrawingMode)
                    if (!newDrawingMode) {
                      setSelectedAnnotation(null)
                    }
                  }}
                >
                  {drawingMode ? '✓ Рисование' : 'Нарисовать bbox'}
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-center text-sm font-semibold mb-2 text-gray-700">
                  Main (45°) {activeImage === 'Main' && displayMode === 'edit' && <Badge variant="default" className="ml-2">Активно</Badge>}
                </div>
                <div 
                  className="h-[calc(100vh-320px)] rounded overflow-hidden border-2 cursor-pointer" 
                  style={{ borderColor: activeImage === 'Main' && displayMode === 'edit' ? '#3b82f6' : '#e5e7eb' }}
                  onClick={() => displayMode === 'edit' && setActiveImage('Main')}
                >
                  {mainImage && (
                    <BBoxAnnotator
                      imageUrl={`/api/bbox-images/${mainImage.storage_path}`}
                      annotations={
                        !showAllBBoxes && selectedAnnotation
                          ? selectedAnnotation.dish_index !== null
                            ? mainImage.annotations.filter(ann =>
                                ann.dish_index === selectedAnnotation.dish_index
                              )
                            : mainImage.annotations.filter(ann => ann.object_type === 'plate')
                          : !showAllBBoxes && highlightedDishIndex !== null
                          ? highlightedDishIndex === -1
                            ? mainImage.annotations.filter(ann => ann.object_type === 'plate')
                            : mainImage.annotations.filter(ann =>
                                ann.dish_index === highlightedDishIndex
                              )
                          : !showAllBBoxes && highlightedPlate
                          ? mainImage.annotations.filter(ann => ann.object_type === 'plate')
                          : mainImage.annotations
                      }
                      originalAnnotations={mainImage.original_annotations}
                      imageId={mainImage.id}
                      highlightDishIndex={highlightedDishIndex}
                      onAnnotationCreate={displayMode === 'edit' && activeImage === 'Main' ? (bbox) => handleAnnotationCreate(mainImage.id, bbox) : undefined}
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
              </div>

              <div>
                <div className="text-center text-sm font-semibold mb-2 text-gray-700">
                  Qualifying (90°) {activeImage === 'Qualifying' && displayMode === 'edit' && <Badge variant="default" className="ml-2">Активно</Badge>}
                </div>
                <div
                  className="h-[calc(100vh-320px)] rounded overflow-hidden border-2 cursor-pointer"
                  style={{ borderColor: activeImage === 'Qualifying' && displayMode === 'edit' ? '#3b82f6' : '#e5e7eb' }}
                  onClick={() => displayMode === 'edit' && setActiveImage('Qualifying')}
                >
                  {qualifyingImage && (
                    <BBoxAnnotator
                      imageUrl={`/api/bbox-images/${qualifyingImage.storage_path}`}
                      annotations={
                        !showAllBBoxes && selectedAnnotation
                          ? selectedAnnotation.dish_index !== null
                            ? qualifyingImage.annotations.filter(ann =>
                                ann.dish_index === selectedAnnotation.dish_index
                              )
                            : qualifyingImage.annotations.filter(ann => ann.object_type === 'plate')
                          : !showAllBBoxes && highlightedDishIndex !== null
                          ? highlightedDishIndex === -1
                            ? qualifyingImage.annotations.filter(ann => ann.object_type === 'plate')
                            : qualifyingImage.annotations.filter(ann =>
                                ann.dish_index === highlightedDishIndex
                              )
                          : !showAllBBoxes && highlightedPlate
                          ? qualifyingImage.annotations.filter(ann => ann.object_type === 'plate')
                          : qualifyingImage.annotations
                      }
                      originalAnnotations={qualifyingImage.original_annotations}
                      imageId={qualifyingImage.id}
                      highlightDishIndex={highlightedDishIndex}
                      onAnnotationCreate={displayMode === 'edit' && activeImage === 'Qualifying' ? (bbox) => handleAnnotationCreate(qualifyingImage.id, bbox) : undefined}
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
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Draggable popup для выбора типа объекта (табы) */}
      {pendingBBox && (() => {
        const dropdownWidth = 500
        const dropdownHeight = 600
        
        // Центрируем по экрану при первом открытии
        const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
        const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 1080
        
        // Если modalPosition не установлена, центрируем
        const left = modalPosition.x || Math.max(20, (screenWidth - dropdownWidth) / 2)
        const top = modalPosition.y || Math.max(20, (screenHeight - dropdownHeight) / 2)
        
        // Инициализируем позицию если она еще не установлена
        if (modalPosition.x === 0 && modalPosition.y === 0) {
          setTimeout(() => {
            setModalPosition({
              x: Math.max(20, (screenWidth - dropdownWidth) / 2),
              y: Math.max(20, (screenHeight - dropdownHeight) / 2)
            })
          }, 0)
        }
        
        return (
          <div 
            className="fixed bg-white rounded-lg shadow-2xl border border-gray-300 flex flex-col"
            style={{ 
              left: `${left}px`, 
              top: `${top}px`,
              width: `${dropdownWidth}px`,
              height: `${dropdownHeight}px`,
              zIndex: 100
            }}
          >
            {/* Header - Draggable */}
            <div 
              className="p-3 border-b bg-white flex-shrink-0 cursor-move select-none"
              onMouseDown={handleModalMouseDown}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">
                  Что вы добавили?
                </h3>
                <button
                  className="text-gray-400 hover:text-gray-600"
                  onClick={() => {
                    setPendingBBox(null)
                    setMenuSearch('')
                    setActiveTab('check')
                    setModalPosition({ x: 0, y: 0 })
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          
            {/* Табы */}
            <div className="flex border-b bg-gray-50 flex-shrink-0">
              <button
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'check' 
                    ? 'bg-white border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('check')}
              >
                📋 Из чека
              </button>
              <button
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'nonfood' 
                    ? 'bg-white border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('nonfood')}
              >
                📦 Предметы
              </button>
              <button
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'plate' 
                    ? 'bg-white border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('plate')}
              >
                🍽️ Тарелки
              </button>
              <button
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'buzzer' 
                    ? 'bg-white border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setActiveTab('buzzer')}
              >
                🔔 Баззер
              </button>
            </div>
          
            <div className="flex-1 overflow-y-auto p-4">
              {/* Таб: Из чека */}
              {activeTab === 'check' && (
                <div className="space-y-2">
                  {taskData.recognition.correct_dishes.map((dish, index) => {
                    const allDishes = dish.Dishes || []
                    const displayName = allDishes[0]?.Name || allDishes[0]?.product_name || 'Unknown'
                    const hasMultiple = allDishes.length > 1
                    
                    return (
                      <div key={index} className="border rounded p-3 bg-gray-50">
                        <button
                          className="w-full text-left hover:bg-blue-50 transition-colors p-2 rounded"
                          onClick={() => finishAnnotationCreate('food', null, index, false)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">#{index + 1}</span>
                            <span className="text-gray-900">{displayName}</span>
                            {hasMultiple && (
                              <span className="text-xs text-orange-600">
                                [{allDishes.length} вар.]
                              </span>
                            )}
                          </div>
                        </button>
                        
                        {/* Если несколько вариантов - показываем список */}
                        {hasMultiple && (
                          <div className="mt-2 ml-4 space-y-1">
                            {allDishes.map((variant, varIdx) => (
                              <button
                                key={varIdx}
                                className="w-full text-left px-3 py-1 hover:bg-blue-50 transition-colors text-sm rounded"
                                onClick={() => finishAnnotationCreate('food', null, index, false)}
                              >
                                • {variant.Name || variant.product_name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Таб: Предметы */}
              {activeTab === 'nonfood' && (
                <div className="space-y-2">
                  {NON_FOOD_OBJECTS.map((obj) => (
                    <button
                      key={obj.id}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3 rounded border"
                      onClick={() => finishAnnotationCreate('non_food', obj.id, null, false)}
                    >
                      <span className="text-2xl">{obj.icon}</span>
                      <span className="text-gray-900">{obj.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Таб: Тарелки */}
              {activeTab === 'plate' && (
                <div className="space-y-2">
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3 rounded border"
                    onClick={() => finishAnnotationCreate('plate', null, null, false)}
                  >
                    <span className="text-2xl">🍽️</span>
                    <span className="text-gray-900">Тарелка</span>
                  </button>
                </div>
              )}

              {/* Таб: Баззер */}
              {activeTab === 'buzzer' && (
                <div className="space-y-2">
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3 rounded border"
                    onClick={() => finishAnnotationCreate('buzzer', null, null, false)}
                  >
                    <span className="text-2xl">🔔</span>
                    <span className="text-gray-900">Баззер</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

