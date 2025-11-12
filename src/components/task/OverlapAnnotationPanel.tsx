'use client'

import { Annotation, Image } from '@/types/annotations'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Layers, Check, X } from 'lucide-react'
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
  
  // Группируем аннотации по изображениям
  const annotationsByImage = images.map(image => ({
    image,
    annotations: annotations.filter(a => 
      a.image_id === image.id && 
      !a.is_deleted && 
      (a.object_type === 'dish' || a.object_type === 'plate')
    )
  }))

  // Подсчет перекрытых объектов
  const totalAnnotations = annotations.filter(a => 
    !a.is_deleted && (a.object_type === 'dish' || a.object_type === 'plate')
  ).length
  const overlappedCount = annotations.filter(a => 
    !a.is_deleted && a.is_overlapped && (a.object_type === 'dish' || a.object_type === 'plate')
  ).length

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
    <Card className="p-4 space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Layers className="w-5 h-5 text-orange-500" />
            Отметка перекрытий
          </h3>
          <Badge variant={overlappedCount > 0 ? 'default' : 'secondary'}>
            {overlappedCount} / {totalAnnotations}
          </Badge>
        </div>
        
        <div className="text-sm text-gray-600 space-y-1">
          <p>🔀 Отметьте объекты, которые перекрыты другими предметами</p>
          <p className="text-xs">
            <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">O</kbd>
            {' '}– переключить перекрытие для выбранного объекта
          </p>
          <p className="text-xs">
            <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">↑↓</kbd>
            {' '}– навигация между объектами
          </p>
        </div>
      </div>

      {/* Список объектов по изображениям */}
      <div className="space-y-4 max-h-[600px] overflow-y-auto">
        {annotationsByImage.map(({ image, annotations: imageAnnotations }, imageIndex) => (
          <div key={image.id} className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700">
              {image.type === 'main' ? '📸 Основное фото' : '✅ Контроль качества'}
            </h4>
            
            {imageAnnotations.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Нет объектов для проверки</p>
            ) : (
              <div className="space-y-1">
                {imageAnnotations.map((annotation) => {
                  const isSelected = selectedAnnotationId === annotation.id
                  const color = objectColors[annotation.object_type as keyof typeof objectColors] || objectColors.nonfood
                  
                  return (
                    <div
                      key={annotation.id}
                      onClick={() => onAnnotationSelect(annotation.id)}
                      className={`
                        p-2 rounded-lg border-2 cursor-pointer transition-all
                        ${isSelected 
                          ? 'border-red-500 bg-red-50' 
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }
                        ${annotation.is_overlapped ? 'bg-orange-50' : ''}
                      `}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-sm font-medium truncate">
                            {getDishName(annotation)}
                          </span>
                          {annotation.is_overlapped && (
                            <span className="text-xs">🔀</span>
                          )}
                        </div>
                        
                        <Button
                          size="sm"
                          variant={annotation.is_overlapped ? 'default' : 'outline'}
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleOverlap(annotation.id)
                          }}
                          className={`
                            h-7 text-xs px-2 flex-shrink-0
                            ${annotation.is_overlapped 
                              ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                              : 'hover:bg-orange-50 hover:text-orange-600'
                            }
                          `}
                        >
                          {annotation.is_overlapped ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <X className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer - подсказка */}
      {overlappedCount === 0 && totalAnnotations > 0 && (
        <div className="pt-2 border-t text-xs text-gray-500 italic">
          💡 Если объектов с перекрытием нет, нажмите "Завершить этап"
        </div>
      )}
    </Card>
  )
}

