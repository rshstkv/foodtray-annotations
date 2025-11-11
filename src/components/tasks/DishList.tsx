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
  onVariantSelect?: (dishIndex: number, variantIndex: number) => void
  highlightedIndex?: number | null
  highlightedPlate?: boolean
  className?: string
}

export function DishList({
  dishes,
  images = [],
  onDishClick,
  onPlateClick,
  onVariantSelect,
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
  
  // Есть ли тарелки хотя бы на одной картинке
  const hasPlates = mainPlateCount > 0 || qualPlateCount > 0

  // Цвет badge для plates - зеленый если совпадают (в т.ч. 0:0)
  const platesMatch = mainPlateCount === qualPlateCount
  const platesBadgeColor = platesMatch ? 'bg-green-500' : 'bg-red-500'

  // Получить все bbox для конкретного блюда
  const getDishBBoxes = (dishIndex: number) => {
    const mainBboxes = images.find(i => i.photo_type === 'Main')?.annotations.filter(a => a.dish_index === dishIndex) || []
    const qualBboxes = images.find(i => i.photo_type === 'Qualifying')?.annotations.filter(a => a.dish_index === dishIndex) || []
    return { mainBboxes, qualBboxes, allBboxes: [...mainBboxes, ...qualBboxes] }
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-4 text-sm text-gray-700">
        Объекты на изображении
      </h3>
      
      <div className={`space-y-4 ${className}`}>
        {/* Раздел 1: Тарелки - показываем только если есть хотя бы на одной картинке */}
        {hasPlates && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Тарелки</h4>
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
                    #1
                  </span>
                </div>
                <Badge className={platesBadgeColor}>
                  M:{mainPlateCount} Q:{qualPlateCount}
                </Badge>
              </div>
              <p className="text-sm font-medium text-gray-900">
                🍽️ Тарелки
              </p>
            </div>
          </div>
        )}

        {/* Раздел 2: Блюда из чека */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Блюда из чека</h4>

          <div className="space-y-2">
            {dishes.map((dish, index) => {
              const count = dish.Count || 1
              const mainBboxCount = getDishAnnotationCount(index, 'Main')
              const qualBboxCount = getDishAnnotationCount(index, 'Qualifying')
              const allDishes = dish.Dishes || []
              const displayName = allDishes[0]?.Name || allDishes[0]?.product_name || 'Unknown'
              const isHighlighted = highlightedIndex === index
              
              const { mainBboxes, qualBboxes } = getDishBBoxes(index)
              
              // Показываем варианты если в чеке несколько возможных блюд (Dishes.length > 1)
              // Это означает неоднозначность - пользователь должен выбрать конкретный вариант
              const hasMultipleVariants = allDishes.length > 1
              
              // Показываем badge с количеством bbox если их больше чем ожидается
              const hasMultipleBboxes = mainBboxes.length > count || qualBboxes.length > count
              
              // Определяем статус блюда
              const mainMatches = mainBboxCount === count
              const qualMatches = qualBboxCount === count
              const bothMatch = mainMatches && qualMatches
              const bothMismatch = !mainMatches && !qualMatches
              
              // Цвет badge
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
                        #{hasPlates ? index + 2 : index + 1}
                      </span>
                      {hasMultipleVariants && (
                        <span className="text-xs text-orange-600 font-medium">
                          [{allDishes.length} вар.]
                        </span>
                      )}
                      {hasMultipleBboxes && (
                        <span className="text-xs text-red-600 font-medium">
                          [bbox: {Math.max(mainBboxes.length, qualBboxes.length)}]
                        </span>
                      )}
                    </div>
                    <Badge className={badgeColor}>
                      M:{mainBboxCount}/{count} Q:{qualBboxCount}/{count}
                    </Badge>
                  </div>
                  
                  {/* Всегда показываем название блюда */}
                  <p className="text-sm font-medium text-gray-900">
                    {displayName}
                  </p>
                  
                  {/* Если есть несколько вариантов - показываем список для выбора */}
                  {hasMultipleVariants && (
                    <div className="space-y-1 mt-2 border-t pt-2">
                      <p className="text-xs text-gray-500 font-medium mb-1">Выберите вариант:</p>
                      {allDishes.map((variant, varIdx) => (
                        <button
                          key={varIdx}
                          onClick={(e) => {
                            e.stopPropagation()
                            onVariantSelect?.(index, varIdx)
                          }}
                          className="w-full text-left text-xs text-gray-700 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                        >
                          • {variant.Name || variant.product_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}

