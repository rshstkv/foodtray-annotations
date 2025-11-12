'use client'

import { Annotation, Image } from '@/types/annotations'
import { Badge } from '@/components/ui/badge'
import { objectColors } from '@/styles/design-tokens'

interface OverlapAnnotationPanelProps {
  images: Image[]
  annotations: Annotation[]
  selectedAnnotationId: string | null
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
  dishNames = {},
  onAnnotationSelect,
  onToggleOverlap,
}: OverlapAnnotationPanelProps) {
  
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

  // Группируем по типу + индексу блюда
  const groupedItems: GroupedItem[] = []
  const processedKeys = new Set<string>()

  annotations
    .filter(a => !a.is_deleted && (a.object_type === 'dish' || a.object_type === 'plate'))
    .forEach(annotation => {
      const key = `${annotation.object_type}_${annotation.dish_index ?? 'custom'}_${annotation.custom_dish_name ?? ''}`
      
      if (!processedKeys.has(key)) {
        processedKeys.add(key)
        
        const sameObjects = annotations.filter(a => 
          !a.is_deleted &&
          a.object_type === annotation.object_type &&
          a.dish_index === annotation.dish_index &&
          a.custom_dish_name === annotation.custom_dish_name
        )
        
        groupedItems.push({
          key,
          name: getDishName(annotation),
          color: objectColors[annotation.object_type as keyof typeof objectColors] || objectColors.nonfood,
          annotations: sameObjects,
        })
      }
    })

  // Подсчет перекрытых объектов
  const totalAnnotations = annotations.filter(a => 
    !a.is_deleted && (a.object_type === 'dish' || a.object_type === 'plate')
  ).length
  const overlappedCount = annotations.filter(a => 
    !a.is_deleted && a.is_overlapped && (a.object_type === 'dish' || a.object_type === 'plate')
  ).length

  // Определяем тип изображения по annotation.image_id
  const getImageType = (imageId: string): 'main' | 'quality' => {
    const image = images.find(img => img.id === imageId)
    return image?.image_type === 'main' ? 'main' : 'quality'
  }

  return (
    <div className="space-y-3">
      {/* Компактный список объектов */}
      <div className="space-y-1">
        {groupedItems.map((item) => {
          const hasAnySelected = item.annotations.some(a => a.id === selectedAnnotationId)
          
          return (
            <div
              key={item.key}
              className={`
                p-2 rounded border transition-all
                ${hasAnySelected 
                  ? 'border-red-500 bg-red-50' 
                  : 'border-gray-200'
                }
              `}
            >
              <div className="flex items-center justify-between gap-2">
                {/* Название объекта */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div 
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm truncate">
                    {item.name}
                  </span>
                </div>
                
                {/* Иконки для каждого изображения */}
                <div className="flex gap-1 flex-shrink-0">
                  {item.annotations.map((annotation) => {
                    const imageType = getImageType(annotation.image_id)
                    const icon = imageType === 'main' ? '📸' : '✅'
                    const isOverlapped = annotation.is_overlapped
                    
                    return (
                      <button
                        key={annotation.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleOverlap(annotation.id)
                        }}
                        className={`
                          w-7 h-7 flex items-center justify-center rounded text-sm
                          transition-all
                          ${isOverlapped 
                            ? 'bg-orange-500 text-white ring-2 ring-orange-300' 
                            : 'bg-gray-100 hover:bg-orange-50'
                          }
                        `}
                        title={`${imageType === 'main' ? 'Основное фото' : 'Контроль качества'}: ${isOverlapped ? 'Перекрыто' : 'Не перекрыто'}`}
                      >
                        {isOverlapped ? '🔀' : icon}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Компактный счетчик */}
      <div className="flex items-center justify-between pt-2 border-t">
        <span className="text-xs text-gray-500">Отмечено</span>
        <Badge variant={overlappedCount > 0 ? 'default' : 'secondary'} className="text-xs">
          {overlappedCount} / {totalAnnotations}
        </Badge>
      </div>
    </div>
  )
}

