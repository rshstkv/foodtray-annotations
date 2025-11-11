/**
 * Modal для выбора блюда при создании новой аннотации
 * Используется в Dish Validation workflow
 */

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { CorrectDish } from '@/types/annotations'

interface DishValidationModalProps {
  dishes: CorrectDish[]
  onSelect: (dishIndex: number) => void
  onCancel: () => void
}

export function DishValidationModal({
  dishes,
  onSelect,
  onCancel,
}: DishValidationModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="p-6 max-w-md">
        <h3 className="text-lg font-semibold mb-4">Выберите блюдо:</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {dishes.map((dish, index) => (
            <button
              key={index}
              className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3 text-sm rounded border"
              onClick={() => onSelect(index)}
            >
              <div className="flex-1">
                <span className="font-medium text-gray-700">
                  [{index + 1}]
                </span>
                <span className="text-gray-900 ml-2">
                  {dish.Dishes[0]?.Name}
                </span>
              </div>
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          className="w-full mt-4"
          onClick={onCancel}
        >
          Отмена (Esc)
        </Button>
      </Card>
    </div>
  )
}


