'use client'

import { Annotation, DishFromReceipt, Image } from '@/types/annotations'
import { Button } from '@/components/ui/button'
import { Check, AlertCircle, X, Trash2 } from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

interface ImageAnnotationInfoProps {
  image: Image
  dishesFromReceipt: DishFromReceipt[]
  annotations: Annotation[]
  selectedDishIndex: number | null
  onDeleteAnnotation?: (annotationId: string) => void
}

export function ImageAnnotationInfo({
  image,
  dishesFromReceipt,
  annotations,
  selectedDishIndex,
  onDeleteAnnotation,
}: ImageAnnotationInfoProps) {
  // Get annotations for this image
  // NOTE: annotations are already filtered by image_id in TaskPage
  const getAnnotationsByDish = (dishIndex: number | null) => {
    // Фильтруем аннотации:
    // 1. Не удалённые
    // 2. С корректными координатами bbox
    // 3. Только 'dish' объекты
    // 4. Если выбрано блюдо - только аннотации этого блюда
    return annotations.filter(a => {
      if (a.is_deleted) return false
      if (a.object_type !== 'dish') return false
      if (a.bbox_x1 === undefined || a.bbox_y1 === undefined) return false
      
      // Если блюдо выбрано, показываем только его аннотации
      if (dishIndex !== null && a.dish_index !== dishIndex) return false
      
      return true
    })
  }

  // Check if annotations have duplicate coordinates
  const hasDuplicateCoordinates = (anns: Annotation[]) => {
    const coords = anns
      .filter(a => a.bbox_x1 !== undefined && a.bbox_y1 !== undefined)
      .map(a => `${a.bbox_x1},${a.bbox_y1},${a.bbox_x2},${a.bbox_y2}`)
    return coords.length !== new Set(coords).size
  }

  const getStatusIcon = (count: number, expected: number) => {
    if (count === expected) return <Check className="w-3 h-3 text-green-600" />
    if (count === 0) return <X className="w-3 h-3 text-red-600" />
    return <AlertCircle className="w-3 h-3 text-amber-600" />
  }

  const getStatusColor = (count: number, expected: number) => {
    if (count === expected) return 'text-green-600'
    if (count === 0) return 'text-red-600'
    return 'text-amber-600'
  }

  const imageName = image.image_type === 'main' ? 'Main' : 'Quality'

  // Если блюдо не выбрано, показываем все аннотации для изображения
  const dishAnnotations = getAnnotationsByDish(selectedDishIndex)
  const count = dishAnnotations.length
  
  // Если блюдо не выбрано и нет аннотаций, не показываем панель
  if (selectedDishIndex === null && count === 0) return null
  
  const dish = selectedDishIndex !== null ? dishesFromReceipt[selectedDishIndex] : null
  const expected = dish?.Count || 0
  const hasDuplicates = hasDuplicateCoordinates(dishAnnotations)


  return (
    <div className="absolute top-2 left-2 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-sm p-2 min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-gray-700">{imageName}</div>
        <div className="flex items-center gap-1 text-xs">
          <span className={getStatusColor(count, expected)}>{count}/{expected}</span>
          {getStatusIcon(count, expected)}
          {hasDuplicates && <span className="text-xs text-orange-600 ml-1">дубли</span>}
        </div>
      </div>
      
      {selectedDishIndex !== null && (
        <div className="text-xs text-gray-600 mb-1">
          Блюдо #{selectedDishIndex + 1}
        </div>
      )}
      
      {dishAnnotations.length === 0 ? (
        <div className="text-xs text-gray-500 italic">Нет аннотаций</div>
      ) : (
        <div className="space-y-1">
          {dishAnnotations.map(ann => {
            if (ann.bbox_x1 === undefined || ann.bbox_y1 === undefined) return null
            // Показываем координаты левого верхнего угла (в пикселях)
            const coord = `(${Math.round(ann.bbox_x1 * 1810)}, ${Math.round(ann.bbox_y1 * 1080)})`
            return (
              <div
                key={ann.id}
                className="flex items-center justify-between gap-2 text-xs py-0.5"
              >
                <span className="text-gray-600 font-mono">{coord}</span>
                {onDeleteAnnotation && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 hover:bg-red-50"
                    onClick={e => {
                      e.stopPropagation()
                      onDeleteAnnotation(ann.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-red-600" />
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

