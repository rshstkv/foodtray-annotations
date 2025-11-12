'use client'

import { Annotation, DishFromReceipt } from '@/types/annotations'
import { Button } from '@/components/ui/button'
import { Check, AlertCircle, X } from 'lucide-react'

interface DishSelectionPanelProps {
  dishesFromReceipt: DishFromReceipt[]
  annotations: Annotation[]
  selectedDishIndex: number | null
  onSelectDish: (index: number) => void
  onAddFromMenu: () => void
}

// Flatten dishes for display
function flattenDishes(dishesFromReceipt: DishFromReceipt[]) {
  return dishesFromReceipt.flatMap((item, groupIndex) => 
    item.Dishes.map((dish, dishIndex) => ({
      name: dish.Name,
      expectedCount: item.Count,
      externalId: dish.ExternalId,
      flatIndex: groupIndex * 100 + dishIndex, // Unique index
    }))
  )
}

export function DishSelectionPanel({
  dishesFromReceipt,
  annotations,
  selectedDishIndex,
  onSelectDish,
  onAddFromMenu,
}: DishSelectionPanelProps) {
  const dishes = dishesFromReceipt ? flattenDishes(dishesFromReceipt) : []

  // Count actual annotations for each dish (unique by image_id to avoid double counting)
  const getActualCount = (dishIndex: number) => {
    const uniqueImages = new Set(
      annotations
        .filter(a => a.object_type === 'dish' && a.dish_index === dishIndex && !a.is_deleted)
        .map(a => a.image_id)
    )
    // Если есть на обеих картинках (main + quality) - считаем как 1
    return uniqueImages.size > 0 ? 1 : 0
  }

  // Get status icon and color
  const getStatus = (expected: number, actual: number) => {
    if (actual === expected) {
      return {
        icon: <Check className="w-4 h-4 text-green-600" />,
        color: 'text-green-600',
      }
    }
    if (actual === 0) {
      return {
        icon: <X className="w-4 h-4 text-red-600" />,
        color: 'text-red-600',
      }
    }
    if (actual > expected) {
      return {
        icon: <AlertCircle className="w-4 h-4 text-red-600" />,
        color: 'text-red-600', // Больше чем нужно - красный
      }
    }
    return {
      icon: <AlertCircle className="w-4 h-4 text-amber-600" />,
      color: 'text-amber-600', // Меньше чем нужно - желтый
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Блюда из чека</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={onAddFromMenu}
          className="text-xs"
        >
          + Добавить из меню
        </Button>
      </div>

      {/* Dishes list */}
      <div className="space-y-2">
        {dishes.map((dish, index) => {
          const actual = getActualCount(index)
          const isSelected = selectedDishIndex === index
          const status = getStatus(dish.expectedCount, actual)

          return (
            <div
              key={dish.flatIndex}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
              onClick={() => onSelectDish(index)}
            >
              {/* Dish info */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium text-sm text-gray-900">
                    {index + 1}. {dish.name}
                  </div>
                  <div className={`text-xs mt-1 font-medium ${status.color}`}>
                    {actual}/{dish.expectedCount}
                    {actual !== dish.expectedCount && (
                      <span className="ml-1">
                        {actual > dish.expectedCount ? '(избыток)' : '(недостаток)'}
                      </span>
                    )}
                  </div>
                </div>

                {status.icon}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

