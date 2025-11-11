/**
 * Custom hook для логики Dish Validation
 * Инкапсулирует вычисления counts, определение mode, handlers
 */

import { useCallback, useMemo } from 'react'
import type { Image, Annotation, CorrectDish } from '@/types/annotations'

interface UseDishValidationProps {
  images: Image[]
  taskData: {
    recognition: {
      correct_dishes: CorrectDish[]
    }
  } | null
}

export function useDishValidation({ images, taskData }: UseDishValidationProps) {
  // Мемоизация изображений
  const mainImage = useMemo(
    () => images?.find((img: Image) => img.photo_type === 'Main'),
    [images]
  )
  
  const qualifyingImage = useMemo(
    () => images?.find((img: Image) => img.photo_type === 'Qualifying'),
    [images]
  )

  // Мемоизация подсчетов
  const mainCount = useMemo(
    () => mainImage?.annotations.filter((a) => a.dish_index !== null).length || 0,
    [mainImage]
  )
  
  const qualCount = useMemo(
    () => qualifyingImage?.annotations.filter((a) => a.dish_index !== null).length || 0,
    [qualifyingImage]
  )
  
  const expectedCount = useMemo(
    () => taskData?.recognition?.correct_dishes?.reduce(
      (sum, dish) => sum + dish.Count,
      0
    ) || 0,
    [taskData?.recognition?.correct_dishes]
  )

  // Проверка посблюдового совпадения
  // Для каждого блюда из чека проверяем что количество bbox на обеих картинках = Count
  const checkPerDishAlignment = useMemo(() => {
    if (!taskData?.recognition?.correct_dishes || !mainImage || !qualifyingImage) {
      return false
    }

    return taskData.recognition.correct_dishes.every((dish, dishIndex) => {
      const mainDishCount = mainImage.annotations.filter(
        (a) => a.dish_index === dishIndex
      ).length
      const qualDishCount = qualifyingImage.annotations.filter(
        (a) => a.dish_index === dishIndex
      ).length
      
      return mainDishCount === dish.Count && qualDishCount === dish.Count
    })
  }, [taskData?.recognition?.correct_dishes, mainImage, qualifyingImage])

  // Определение выравнивания и режима
  // Критерии для Quick Validation:
  // 1. Суммарное совпадение: Expected = Main = Qualifying
  // 2. Посблюдовое совпадение: для каждого блюда количество bbox совпадает с Count
  const isAligned = useMemo(
    () => mainCount === qualCount && mainCount === expectedCount && checkPerDishAlignment,
    [mainCount, qualCount, expectedCount, checkPerDishAlignment]
  )
  
  const mode = useMemo(
    () => isAligned ? 'quick_validation' as const : 'edit_mode' as const,
    [isAligned]
  )

  // Handler для клика по блюду
  const createDishClickHandler = useCallback(
    (
      highlightedDishIndex: number | null,
      selectedBBoxIndexInDish: number,
      activeImage: 'Main' | 'Qualifying',
      setHighlightedDishIndex: (index: number | null) => void,
      setSelectedBBoxIndexInDish: (index: number) => void,
      setSelectedAnnotation: (annotation: Annotation | null) => void,
      setShowAllBBoxes: (show: boolean) => void,
      setDrawingMode: (mode: boolean) => void
    ) => {
      return (dishIndex: number) => {
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
      }
    },
    [images, taskData]
  )

  return {
    mainImage,
    qualifyingImage,
    mainCount,
    qualCount,
    expectedCount,
    isAligned,
    mode,
    createDishClickHandler,
  }
}

