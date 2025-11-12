'use client'

import { Check, AlertCircle } from 'lucide-react'
import { Dish } from '@/types/annotations'
import { cn } from '@/lib/utils'

interface DishCheckListProps {
  dishes: Dish[]
  annotationCounts: Record<number, { main: number; quality: number }>
  highlightedDishIndex: number | null
  onDishClick: (index: number) => void
}

export function DishCheckList({
  dishes,
  annotationCounts,
  highlightedDishIndex,
  onDishClick,
}: DishCheckListProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Блюда из чека</h3>
      
      {dishes.map((dish, index) => {
        const counts = annotationCounts[index] || { main: 0, quality: 0 }
        const isComplete = counts.main === dish.count && counts.quality === dish.count
        const hasError = counts.main !== counts.quality || counts.main !== dish.count
        const isHighlighted = highlightedDishIndex === index
        
        return (
          <button
            key={index}
            onClick={() => onDishClick(index)}
            className={cn(
              'w-full text-left p-3 rounded-lg border-2 transition-all',
              isHighlighted && 'border-blue-500 bg-blue-50',
              !isHighlighted && isComplete && 'border-green-300 bg-green-50',
              !isHighlighted && hasError && 'border-red-300 bg-red-50',
              !isHighlighted && !isComplete && !hasError && 'border-gray-200 bg-white',
              'hover:shadow-md'
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {isComplete ? (
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  ) : hasError ? (
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium text-gray-900">{dish.name}</span>
                </div>
                
                <div className="mt-1 ml-6 text-xs text-gray-600">
                  Ожидается: {dish.count} шт.
                </div>
                
                <div className="mt-1 ml-6 flex gap-3 text-xs">
                  <span className={cn(
                    counts.main === dish.count ? 'text-green-600' : 'text-red-600'
                  )}>
                    Main: {counts.main}
                  </span>
                  <span className={cn(
                    counts.quality === dish.count ? 'text-green-600' : 'text-red-600'
                  )}>
                    Quality: {counts.quality}
                  </span>
                </div>
              </div>
              
              {dish.price && (
                <div className="text-xs text-gray-500 ml-2">
                  {dish.price}₽
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}




