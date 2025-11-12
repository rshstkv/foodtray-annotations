'use client'

import { Annotation, Image } from '@/types/annotations'
import { Badge } from '@/components/ui/badge'
import { objectColors } from '@/styles/design-tokens'

interface OverlapAnnotationPanelProps {
  images: Image[]
  annotations: Annotation[]
  selectedAnnotationId: string | null
  activeImageId: string | null
  dishNames?: Record<number, string>
  onAnnotationSelect: (annotationId: string) => void
  onToggleOverlap: (annotationId: string) => void
}

// Группируем аннотации по объекту (блюдо/тарелка)
interface GroupedItem {
  key: string
  name: string
  color: string
  annotations: Annotation[] // все bbox этого объекта на разных изображениях
}

export function OverlapAnnotationPanel({
  images,
  annotations,
  selectedAnnotationId,
  activeImageId,
  dishNames = {},
  onAnnotationSelect,
  onToggleOverlap,
}: OverlapAnnotationPanelProps) {
  
  // Фильтруем аннотации только для активной картинки
  const activeAnnotations = annotations.filter(a => 
    !a.is_deleted && 
    (a.object_type === 'dish' || a.object_type === 'plate') &&
    a.image_id === activeImageId
  )

  const getDishName = (annotation: Annotation): string => {
    if (annotation.object_type === 'plate') {
      return 'Тарелка'
    }
    if (annotation.dish_index !== null && dishNames[annotation.dish_index]) {
      return dishNames[annotation.dish_index]
    }
    if (annotation.custom_dish_name) {
      return annotation.custom_dish_name
    }
    return `Блюдо #${annotation.dish_index ?? '?'}`
  }

  // Подсчет для текущей картинки
  const overlappedCount = activeAnnotations.filter(a => a.is_overlapped).length

  return (
    <div className="space-y-3">
      {/* Компактный список объектов текущей картинки */}
      <div className="space-y-1">
        {activeAnnotations.map((annotation) => {
          const isSelected = selectedAnnotationId === annotation.id
          const color = objectColors[annotation.object_type as keyof typeof objectColors] || objectColors.nonfood
          
          return (
            <div
              key={annotation.id}
              onClick={() => onAnnotationSelect(annotation.id)}
              className={`
                p-2 rounded border cursor-pointer transition-all
                ${isSelected 
                  ? 'border-red-500 bg-red-50' 
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }
                ${annotation.is_overlapped && !isSelected ? 'bg-orange-50 border-orange-200' : ''}
              `}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div 
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm truncate">
                    {getDishName(annotation)}
                  </span>
                  {annotation.is_overlapped && (
                    <span className="text-xs">🔀</span>
                  )}
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleOverlap(annotation.id)
                  }}
                  className={`
                    w-6 h-6 flex items-center justify-center rounded transition-all flex-shrink-0
                    ${annotation.is_overlapped 
                      ? 'bg-orange-500 text-white' 
                      : 'bg-gray-100 hover:bg-orange-50'
                    }
                  `}
                >
                  {annotation.is_overlapped ? '✓' : '○'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Компактный счетчик */}
      <div className="flex items-center justify-between pt-2 border-t">
        <span className="text-xs text-gray-500">Отмечено</span>
        <Badge variant={overlappedCount > 0 ? 'default' : 'secondary'} className="text-xs">
          {overlappedCount} / {activeAnnotations.length}
        </Badge>
      </div>
    </div>
  )
}

