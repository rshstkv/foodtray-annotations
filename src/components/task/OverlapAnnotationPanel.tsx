'use client'

import { Annotation, Image } from '@/types/annotations'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Check, X } from 'lucide-react'
import { objectColors } from '@/styles/design-tokens'

interface OverlapAnnotationPanelProps {
  images: Image[]
  annotations: Annotation[]
  selectedAnnotationId: string | null
  dishNames?: Record<number, string>
  onAnnotationSelect: (annotationId: string) => void
  onToggleOverlap: (annotationId: string) => void
}

export function OverlapAnnotationPanel({
  images,
  annotations,
  selectedAnnotationId,
  dishNames = {},
  onAnnotationSelect,
  onToggleOverlap,
}: OverlapAnnotationPanelProps) {
  
  // Объединяем все аннотации без группировки по изображениям
  const allAnnotations = annotations.filter(a => 
    !a.is_deleted && (a.object_type === 'dish' || a.object_type === 'plate')
  )

  // Подсчет перекрытых объектов
  const overlappedCount = allAnnotations.filter(a => a.is_overlapped).length

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

  return (
    <div className="space-y-3">
      {/* Компактный список объектов */}
      <div className="space-y-1">
        {allAnnotations.map((annotation) => {
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
                
                <Button
                  size="sm"
                  variant={annotation.is_overlapped ? 'default' : 'ghost'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleOverlap(annotation.id)
                  }}
                  className={`
                    h-6 w-6 p-0 flex-shrink-0
                    ${annotation.is_overlapped 
                      ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                      : 'hover:bg-orange-50 hover:text-orange-600'
                    }
                  `}
                >
                  {annotation.is_overlapped ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Компактный счетчик */}
      <div className="flex items-center justify-between pt-2 border-t">
        <span className="text-xs text-gray-500">Отмечено</span>
        <Badge variant={overlappedCount > 0 ? 'default' : 'secondary'} className="text-xs">
          {overlappedCount} / {allAnnotations.length}
        </Badge>
      </div>
    </div>
  )
}

