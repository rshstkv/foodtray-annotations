/**
 * DishList - переиспользуемый компонент для отображения списка блюд из чека
 * С подсветкой и счетчиками bbox на M и Q изображениях
 */

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getDishColor } from '@/types/annotations'
import type { CorrectDish, Image } from '@/types/annotations'

interface DishListProps {
  dishes: CorrectDish[]
  images?: Image[]
  onDishClick?: (dishIndex: number) => void
  onPlateClick?: (plateType: 'plate') => void
  highlightedIndex?: number | null
  highlightedPlate?: boolean
  className?: string
}

export function DishList({
  dishes,
  images = [],
  onDishClick,
  onPlateClick,
  highlightedIndex,
  highlightedPlate,
  className = '',
}: DishListProps) {
  const getDishAnnotationCount = (dishIndex: number, photoType: string) => {
    const img = images.find((i) => i.photo_type === photoType)
    if (!img) return 0
    return img.annotations.filter((a) => a.dish_index === dishIndex).length
  }

  const getPlateAnnotationCount = (photoType: string) => {
    const img = images.find((i) => i.photo_type === photoType)
    if (!img) return 0
    return img.annotations.filter((a) => a.object_type === 'plate').length
  }

  const mainPlateCount = getPlateAnnotationCount('Main')
  const qualPlateCount = getPlateAnnotationCount('Qualifying')

  return (
    <Card className={`p-4 ${className}`}>
      <h3 className="font-semibold mb-3 text-sm text-gray-700">
        Объекты на изображении
      </h3>
      <div className="space-y-2">
        {/* Тарелки (plates) */}
        <div
          className={`
            border rounded p-3 bg-white cursor-pointer transition-all
            ${highlightedPlate
              ? 'ring-2 ring-yellow-400 shadow-md'
              : 'hover:bg-gray-50'
            }
          `}
          onClick={() => onPlateClick?.('plate')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0"
                style={{ backgroundColor: '#eab308' }}
              />
              <span className="text-xs font-mono text-gray-500">
                #P
              </span>
            </div>
            <Badge className="bg-blue-500">
              M:{mainPlateCount} Q:{qualPlateCount}
            </Badge>
          </div>
          <p className="text-sm font-medium text-gray-900">
            🍽️ Тарелки (plates)
          </p>
        </div>

        {/* Блюда из чека */}
        {dishes.map((dish, index) => {
          const count = dish.Count || 1
          const mainBboxCount = getDishAnnotationCount(index, 'Main')
          const qualBboxCount = getDishAnnotationCount(index, 'Qualifying')
          const displayName = dish.Dishes[0]?.Name || 'Unknown'
          const isHighlighted = highlightedIndex === index
          
          // Определяем статус блюда
          const mainMatches = mainBboxCount === count
          const qualMatches = qualBboxCount === count
          const bothMatch = mainMatches && qualMatches
          const bothMismatch = !mainMatches && !qualMatches
          
          // Цвет badge:
          // Зелёный - всё совпадает
          // Жёлтый - одно совпадает, другое нет
          // Красный - оба не совпадают
          const badgeColor = bothMatch 
            ? 'bg-green-500' 
            : bothMismatch 
              ? 'bg-red-500' 
              : 'bg-yellow-500'

          return (
            <div
              key={index}
              className={`
                border rounded p-3 bg-white cursor-pointer transition-all
                ${isHighlighted
                  ? 'ring-2 ring-yellow-400 shadow-md'
                  : 'hover:bg-gray-50'
                }
              `}
              onClick={() => onDishClick?.(index)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0"
                    style={{ backgroundColor: getDishColor(index) }}
                  />
                  <span className="text-xs font-mono text-gray-500">
                    #{index + 1}
                  </span>
                </div>
                <Badge className={badgeColor}>
                  M:{mainBboxCount}/{count} Q:{qualBboxCount}/{count}
                </Badge>
              </div>
              <p className="text-sm font-medium text-gray-900">
                {displayName}
              </p>
              {dish.Dishes.length > 1 && (
                <p className="text-xs text-gray-500 mt-1">
                  {dish.Dishes.length} вариантов
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

