'use client'

/**
 * Переиспользуемый компонент для управления аннотациями
 * Единый набор кнопок для тулбара и боковой панели
 */

import React from 'react'
import { Pencil, Layers, AlertOctagon, Trash2 } from 'lucide-react'

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
  showEdit?: boolean
  showOverlapped?: boolean
  showOrientation?: boolean
  showError?: boolean
  showDelete?: boolean
  onUpdate?: (id: number, updates: any) => void
  onDelete?: (id: number) => void
  onChangeDish?: (id: number, rect?: any) => void
  onToggleError?: (id: number) => void
  className?: string
}

export function AnnotationControls({
  annotation,
  originalAnnotations,
  imageId,
  compact = false,
  showEdit = true,
  showOverlapped = true,
  showOrientation = true,
  showError = true,
  showDelete = true,
  onUpdate,
  onDelete,
  onChangeDish,
  onToggleError,
  className = ''
}: AnnotationControlsProps) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
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

