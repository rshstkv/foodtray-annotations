'use client'

/**
 * Переиспользуемый компонент для управления аннотациями
 * Единый набор кнопок для тулбара и боковой панели
 */

import React from 'react'
import { RotateCcw, Pencil, Layers, AlertOctagon, Trash2 } from 'lucide-react'

interface Annotation {
  id: number
  bbox_x1: number
  bbox_y1: number
  bbox_x2: number
  bbox_y2: number
  dish_index: number | null
  is_overlapped: boolean
  is_bottle_up: boolean | null
  is_error: boolean
  object_type: string
  object_subtype: string | null
  source: string
  qwen_detection_index?: number | null
  qwen_detection_type?: string | null
}

interface OriginalAnnotations {
  qwen_dishes_detections?: any[]
  qwen_plates_detections?: any[]
}

interface AnnotationControlsProps {
  annotation: Annotation
  originalAnnotations?: OriginalAnnotations | null
  imageId?: number
  compact?: boolean
  showRevert?: boolean
  showEdit?: boolean
  showOverlapped?: boolean
  showOrientation?: boolean
  showError?: boolean
  showDelete?: boolean
  onRestore?: (id: number) => void
  onUpdate?: (id: number, updates: any) => void
  onDelete?: (id: number) => void
  onChangeDish?: (id: number, rect?: any) => void
  onToggleError?: (id: number) => void
  className?: string
}

/**
 * Helper функция для определения наличия изменений относительно оригинала
 */
export function hasModifications(
  annotation: Annotation,
  originalAnnotations?: OriginalAnnotations | null
): boolean {
  if (!originalAnnotations) return false

  // Если есть qwen_detection_index - используем его для точного поиска
  if (annotation.qwen_detection_index !== null && annotation.qwen_detection_index !== undefined) {
    const detectionType = annotation.qwen_detection_type
    let detections: any[] = []

    if (detectionType === 'dish') {
      detections = originalAnnotations.qwen_dishes_detections || []
    } else if (detectionType === 'plate') {
      detections = originalAnnotations.qwen_plates_detections || []
    }

    if (annotation.qwen_detection_index < detections.length) {
      const original = detections[annotation.qwen_detection_index]
      const bbox = original.bbox_2d || original.bbox

      if (bbox && bbox.length >= 4) {
        // Извлекаем dish_index из оригинала
        let originalDishIndex = null
        if (typeof original.dish_index === 'number') {
          originalDishIndex = original.dish_index
        } else if (typeof original.dish_index === 'string') {
          const match = original.dish_index.match(/\d+/)
          if (match) originalDishIndex = parseInt(match[0])
        } else if (original.label) {
          const match = original.label.match(/dish_(\d+)/)
          if (match) originalDishIndex = parseInt(match[1])
        }

        // Сравниваем с допуском 5px для координат (чтобы не считать микро-сдвиги изменениями)
        const coordsChanged = (
          Math.abs(Math.round(annotation.bbox_x1) - Math.round(bbox[0])) > 5 ||
          Math.abs(Math.round(annotation.bbox_y1) - Math.round(bbox[1])) > 5 ||
          Math.abs(Math.round(annotation.bbox_x2) - Math.round(bbox[2])) > 5 ||
          Math.abs(Math.round(annotation.bbox_y2) - Math.round(bbox[3])) > 5
        )

        const flagsChanged = (
          annotation.dish_index !== originalDishIndex ||
          annotation.is_overlapped !== (original.is_overlapped || false) ||
          annotation.is_bottle_up !== (original.is_bottle_up !== undefined ? original.is_bottle_up : null) ||
          annotation.is_error !== false // Любая ошибка - это модификация
        )

        return coordsChanged || flagsChanged
      }
    }
  }

  // Fallback: если нет qwen_detection_index, но source='qwen_auto' - ищем по координатам
  if (annotation.source === 'qwen_auto') {
    const detections = originalAnnotations.qwen_dishes_detections || []
    const centerX = (annotation.bbox_x1 + annotation.bbox_x2) / 2
    const centerY = (annotation.bbox_y1 + annotation.bbox_y2) / 2

    let closestMatch: any = null
    let minDistance = Infinity

    for (const detection of detections) {
      const bbox = detection.bbox_2d || detection.bbox
      if (!bbox) continue

      const detectionCenterX = (bbox[0] + bbox[2]) / 2
      const detectionCenterY = (bbox[1] + bbox[3]) / 2

      const distance = Math.sqrt(
        Math.pow(centerX - detectionCenterX, 2) +
        Math.pow(centerY - detectionCenterY, 2)
      )

      // Находим самый близкий match
      if (distance < minDistance) {
        minDistance = distance
        closestMatch = detection
      }
    }

    // Если нашли близкий match (в пределах 500px для надёжности)
    if (closestMatch && minDistance < 500) {
      const bbox = closestMatch.bbox_2d || closestMatch.bbox
      
      let originalDishIndex = null
      if (typeof closestMatch.dish_index === 'number') {
        originalDishIndex = closestMatch.dish_index
      } else if (typeof closestMatch.dish_index === 'string') {
        const match = closestMatch.dish_index.match(/\d+/)
        if (match) originalDishIndex = parseInt(match[0])
      } else if (closestMatch.label) {
        const match = closestMatch.label.match(/dish_(\d+)/)
        if (match) originalDishIndex = parseInt(match[1])
      }

      // Сравниваем с допуском 5px для координат (чтобы не считать микро-сдвиги изменениями)
      const coordsChanged = (
        Math.abs(Math.round(annotation.bbox_x1) - Math.round(bbox[0])) > 5 ||
        Math.abs(Math.round(annotation.bbox_y1) - Math.round(bbox[1])) > 5 ||
        Math.abs(Math.round(annotation.bbox_x2) - Math.round(bbox[2])) > 5 ||
        Math.abs(Math.round(annotation.bbox_y2) - Math.round(bbox[3])) > 5
      )

      const flagsChanged = (
        annotation.dish_index !== originalDishIndex ||
        annotation.is_overlapped !== (closestMatch.is_overlapped || false) ||
        annotation.is_bottle_up !== (closestMatch.is_bottle_up !== undefined ? closestMatch.is_bottle_up : null) ||
        annotation.is_error !== false
      )

      return coordsChanged || flagsChanged
    }

    // Если не нашли близкого match - считаем что изменений нет (безопасное поведение для новых QWEN аннотаций)
    return false
  }

  // Если source='manual' - это вручную созданная аннотация, нет оригинала
  return false
}

export function AnnotationControls({
  annotation,
  originalAnnotations,
  imageId,
  compact = false,
  showRevert = true,
  showEdit = true,
  showOverlapped = true,
  showOrientation = true,
  showError = true,
  showDelete = true,
  onRestore,
  onUpdate,
  onDelete,
  onChangeDish,
  onToggleError,
  className = ''
}: AnnotationControlsProps) {
  const hasChanges = hasModifications(annotation, originalAnnotations)
  // Показываем кнопку Revert только для QWEN аннотаций (с оригиналом) или вручную созданных если есть изменения
  const hasOriginal = annotation.source === 'qwen_auto' || (annotation.qwen_detection_index !== null && annotation.qwen_detection_index !== undefined)

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Revert - откат к оригиналу */}
      {showRevert && onRestore && hasOriginal && (
        <button
          className={`text-xs px-1 transition-colors ${
            hasChanges
              ? 'text-gray-600 hover:text-blue-600 cursor-pointer'
              : 'text-gray-300 cursor-not-allowed'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            if (hasChanges) {
              onRestore(annotation.id)
            }
          }}
          disabled={!hasChanges}
          title={hasChanges ? 'Откатить к оригиналу' : 'Нет изменений'}
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}

      {/* Edit dish - изменить блюдо */}
      {showEdit && onChangeDish && annotation.object_type === 'food' && (
        <button
          className="text-gray-500 hover:text-blue-600 text-xs px-1 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            if (compact) {
              // В компактном режиме (тулбар) передаём координаты
              const rect = e.currentTarget.getBoundingClientRect()
              onChangeDish(annotation.id, {
                x: rect.left,
                y: rect.bottom,
                width: 100,
                bboxWidth: 100
              })
            } else {
              // В обычном режиме (панель) вызываем без rect
              const rect = e.currentTarget.getBoundingClientRect()
              onChangeDish(annotation.id, {
                x: rect.left,
                y: rect.bottom,
                width: 100,
                bboxWidth: 100
              })
            }
          }}
          title="Изменить блюдо"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}

      {/* Overlapped - флаг перекрытия */}
      {showOverlapped && onUpdate && (
        <button
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
            annotation.is_overlapped
              ? 'bg-orange-100 text-orange-600 border border-orange-300'
              : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            onUpdate(annotation.id, { is_overlapped: !annotation.is_overlapped })
          }}
          title="Перекрытие"
        >
          <Layers className="w-3 h-3" />
        </button>
      )}

      {/* Orientation - ориентация бутылки */}
      {showOrientation && onUpdate && annotation.object_type === 'food' && (
        <button
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
            annotation.is_bottle_up === null
              ? 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
              : annotation.is_bottle_up
              ? 'bg-blue-100 text-blue-600 border border-blue-300'
              : 'bg-green-100 text-green-600 border border-green-300'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            const newOrientation =
              annotation.is_bottle_up === null ? true : annotation.is_bottle_up ? false : null
            onUpdate(annotation.id, { is_bottle_up: newOrientation })
          }}
          title={
            annotation.is_bottle_up === null
              ? 'Ориентация не указана'
              : annotation.is_bottle_up
              ? 'Вертикально ↑'
              : 'Горизонтально →'
          }
        >
          {annotation.is_bottle_up === null ? '⊙' : annotation.is_bottle_up ? '↑' : '→'}
        </button>
      )}

      {/* Error - флаг ошибки */}
      {showError && (onToggleError || onUpdate) && (
        <button
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
            annotation.is_error
              ? 'bg-red-100 text-red-600 border border-red-300'
              : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            if (onToggleError) {
              onToggleError(annotation.id)
            } else if (onUpdate) {
              onUpdate(annotation.id, { is_error: !annotation.is_error })
            }
          }}
          title={annotation.is_error ? 'Ошибка (не в меню)' : 'Отметить как ошибку'}
        >
          <AlertOctagon className="w-3 h-3" />
        </button>
      )}

      {/* Delete - удалить */}
      {showDelete && onDelete && (
        <button
          className="text-gray-400 hover:text-red-500 text-xs px-1 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(annotation.id)
          }}
          title="Удалить"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

