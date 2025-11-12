'use client'

import { useEffect, useCallback } from 'react'
import { UseTaskManagerReturn } from './useTaskManager'
import { UseAnnotationManagerReturn } from './useAnnotationManager'

interface UseHotkeysOptions {
  taskManager: UseTaskManagerReturn
  annotationManager: UseAnnotationManagerReturn
  onToggleVisibility?: () => void
  onSelectDish?: (dishIndex: number) => void
  onSwitchImage?: () => void
  activeImageId?: string | null
  modifiedDishes?: any[] | null
  enabled?: boolean
}

/**
 * Централизованная обработка всех горячих клавиш
 * 
 * Hotkeys:
 * - 1-9: Выбор блюда по индексу (только на активной картинке)
 * - ↑/↓: Навигация по аннотациям (только активной картинки)
 * - ←/→: Переключение между картинками
 * - H: Toggle видимость всех bbox
 * - O: Toggle перекрытие (overlapped) для выбранного объекта
 * - S: Сохранить прогресс
 * - Tab: Пропустить этап (или переключить картинку в режиме check_overlaps)
 * - Shift+Tab: Пропустить задачу
 * - Enter: Завершить этап
 * - Esc: Снять выделение / остановить рисование
 * - Delete/Backspace: Удалить выбранную аннотацию
 */
export function useHotkeys({
  taskManager,
  annotationManager,
  onToggleVisibility,
  onSelectDish,
  onSwitchImage,
  activeImageId = null,
  modifiedDishes = null,
  enabled = true,
}: UseHotkeysOptions) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return

    // Игнорируем hotkeys если фокус в input/textarea
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return
    }

    // 1-9: Выбор блюда (только на активной картинке)
    if (e.key >= '1' && e.key <= '9') {
      const dishIndex = parseInt(e.key) - 1
      
      // Синхронизируем с sidebar
      if (onSelectDish) {
        onSelectDish(dishIndex)
      }
      
      annotationManager.setHighlightedDishIndex(dishIndex)
      
      // Выделить первый bbox этого блюда на активной картинке
      const dishAnnotations = annotationManager.annotations.filter(
        a => a.object_type === 'dish' && 
             a.dish_index === dishIndex && 
             !a.is_deleted &&
             (activeImageId ? a.image_id === activeImageId : true)
      )
      
      if (dishAnnotations.length > 0) {
        annotationManager.setSelectedAnnotationId(dishAnnotations[0].id)
      }
      
      e.preventDefault()
      return
    }

    // ↑/↓: Previous/Next annotation (только на активной картинке)
    // Если выбрано блюдо (через 1-9), переключаем только bbox этого блюда
    // Иначе переключаем все аннотации активной картинки
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const currentlyHighlightedDish = annotationManager.highlightedDishIndex
      
      // Фильтруем по активной картинке
      const activeAnnotations = activeImageId
        ? annotationManager.annotations.filter(a => a.image_id === activeImageId && !a.is_deleted)
        : annotationManager.annotations.filter(a => !a.is_deleted)
      
      if (currentlyHighlightedDish !== null) {
        // Переключаем только между bbox этого блюда на активной картинке
        const dishAnnotations = activeAnnotations.filter(
          a => a.object_type === 'dish' && a.dish_index === currentlyHighlightedDish
        )
        
        if (dishAnnotations.length > 0) {
          const currentIndex = annotationManager.selectedAnnotationId
            ? dishAnnotations.findIndex(a => a.id === annotationManager.selectedAnnotationId)
            : -1
          
          let nextIndex
          if (e.key === 'ArrowDown') {
            nextIndex = (currentIndex + 1) % dishAnnotations.length
          } else {
            nextIndex = currentIndex <= 0 ? dishAnnotations.length - 1 : currentIndex - 1
          }
          
          annotationManager.setSelectedAnnotationId(dishAnnotations[nextIndex].id)
        }
      } else {
        // Переключаем все аннотации активной картинки
        if (activeAnnotations.length > 0) {
          const currentIndex = annotationManager.selectedAnnotationId
            ? activeAnnotations.findIndex(a => a.id === annotationManager.selectedAnnotationId)
            : -1
          
          let nextIndex
          if (e.key === 'ArrowDown') {
            nextIndex = (currentIndex + 1) % activeAnnotations.length
          } else {
            nextIndex = currentIndex <= 0 ? activeAnnotations.length - 1 : currentIndex - 1
          }
          
          annotationManager.setSelectedAnnotationId(activeAnnotations[nextIndex].id)
        }
      }
      
      e.preventDefault()
      return
    }

    // ←/→: Переключение между картинками
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && onSwitchImage) {
      onSwitchImage()
      e.preventDefault()
      return
    }

    // H: Toggle visibility
    if (e.key === 'h' || e.key === 'H') {
      onToggleVisibility?.()
      e.preventDefault()
      return
    }

    // O: Toggle overlapped для выбранного объекта
    if ((e.key === 'o' || e.key === 'O') && annotationManager.selectedAnnotationId) {
      const selectedAnnotation = annotationManager.annotations.find(
        a => a.id === annotationManager.selectedAnnotationId
      )
      
      if (selectedAnnotation) {
        annotationManager.updateAnnotation(annotationManager.selectedAnnotationId, {
          is_overlapped: !selectedAnnotation.is_overlapped
        })
      }
      
      e.preventDefault()
      return
    }

    // S: Save progress
    if (e.key === 's' || e.key === 'S') {
      if (!taskManager.isSaving) {
        taskManager.saveProgress(annotationManager.annotations, modifiedDishes)
      }
      e.preventDefault()
      return
    }

    // Enter: Complete step
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      if (!taskManager.isSaving) {
        taskManager.completeStep()
      }
      e.preventDefault()
      return
    }

    // Tab: Skip step (without Shift) or Skip task (with Shift)
    if (e.key === 'Tab') {
      if (!taskManager.isSaving) {
        if (e.shiftKey) {
          // Shift+Tab: Skip entire task
          taskManager.skipTask()
        } else {
          // Tab: Skip current step
          taskManager.skipStep()
        }
      }
      e.preventDefault()
      return
    }

    // Esc: Deselect / Stop drawing
    if (e.key === 'Escape') {
      if (annotationManager.isDrawing) {
        annotationManager.stopDrawing()
      } else {
        annotationManager.setSelectedAnnotationId(null)
        annotationManager.setHighlightedDishIndex(null)
      }
      e.preventDefault()
      return
    }

    // Delete/Backspace: Delete selected annotation
    if ((e.key === 'Delete' || e.key === 'Backspace') && annotationManager.selectedAnnotationId) {
      annotationManager.deleteAnnotation(annotationManager.selectedAnnotationId)
      e.preventDefault()
      return
    }
  }, [
    enabled,
    taskManager,
    annotationManager,
    onToggleVisibility,
    onSwitchImage,
    activeImageId,
    modifiedDishes,
    onSelectDish,
  ])

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, enabled])
}
