'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus, Trash2 } from 'lucide-react'
import type { TrayItem, ItemType, ValidationType, RecipeLineOption } from '@/types/domain'
import { ITEM_TYPE_LABELS, ITEM_TYPE_COLORS, getItemTypeFromValidationType } from '@/types/domain'
import { cn } from '@/lib/utils'

interface ItemsListProps {
  items: TrayItem[]
  validationType: ValidationType
  selectedItemId: number | null
  recipeLineOptions: RecipeLineOption[]
  onItemSelect: (id: number) => void
  onItemCreate: () => void
  onItemDelete: (id: number) => void
  onItemUpdate?: (id: number, data: { bottle_orientation?: 'horizontal' | 'vertical' }) => void
}

export function ItemsList({
  items,
  validationType,
  selectedItemId,
  recipeLineOptions,
  onItemSelect,
  onItemCreate,
  onItemDelete,
  onItemUpdate,
}: ItemsListProps) {
  // Filter items by validation type
  const itemType = getItemTypeFromValidationType(validationType)
  const filteredItems = itemType
    ? items.filter((item) => item.type === itemType)
    : items

  // Get item label - showing names from recipe_line (from check)
  const getItemLabel = (item: TrayItem): string => {
    // For FOOD items with recipe_line_id, find the recipe line and show selected option
    if (item.recipe_line_id && item.type === 'FOOD') {
      // Найти selected option для этого recipe_line
      const selectedOption = recipeLineOptions.find(
        (opt) => opt.recipe_line_id === item.recipe_line_id && opt.is_selected
      )
      if (selectedOption?.name) {
        return selectedOption.name
      }
      // Если нет selected, показываем первый доступный
      const anyOption = recipeLineOptions.find((opt) => opt.recipe_line_id === item.recipe_line_id)
      if (anyOption?.name) {
        return anyOption.name
      }
    }
    
    // Fallback: показываем тип
    return ITEM_TYPE_LABELS[item.type]
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-none p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">
            {itemType ? ITEM_TYPE_LABELS[itemType] : 'Объекты'}
          </h2>
          {/* Кнопка "Добавить" скрыта для BOTTLE_ORIENTATION_VALIDATION */}
          {validationType !== 'BOTTLE_ORIENTATION_VALIDATION' && (
            <Button size="sm" onClick={onItemCreate}>
              <Plus className="w-4 h-4 mr-1" />
              Добавить
            </Button>
          )}
        </div>
        <p className="text-sm text-gray-500">{filteredItems.length} объектов</p>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredItems.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">Нет объектов</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isSelected = item.id === selectedItemId
            const color = ITEM_TYPE_COLORS[item.type]
            // Все work_items имеют уникальные ID
            const uniqueKey = item.id

            return (
              <Card
                key={uniqueKey}
                className={cn(
                  'p-3 cursor-pointer transition-all hover:shadow-md',
                  isSelected && 'ring-2 ring-blue-500 bg-blue-50'
                )}
                onClick={() => onItemSelect(item.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-3 h-3 rounded-full flex-none"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {getItemLabel(item)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                      <span>{ITEM_TYPE_LABELS[item.type]}</span>
                      {item.initial_item_id !== null && (
                        <span className="text-gray-400 text-[10px]">ID: {item.initial_item_id}</span>
                      )}
                    </div>
                    
                    {/* UI для ориентации бутылки (только для BOTTLE_ORIENTATION_VALIDATION) */}
                    {validationType === 'BOTTLE_ORIENTATION_VALIDATION' && item.type === 'BOTTLE' && onItemUpdate && (
                      <div className="mt-2 flex gap-1">
                        <Button
                          size="sm"
                          variant={item.bottle_orientation === 'horizontal' ? 'default' : 'outline'}
                          className="flex-1 h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            onItemUpdate(item.id, { bottle_orientation: 'horizontal' })
                          }}
                        >
                          Горизонтально
                        </Button>
                        <Button
                          size="sm"
                          variant={item.bottle_orientation === 'vertical' ? 'default' : 'outline'}
                          className="flex-1 h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            onItemUpdate(item.id, { bottle_orientation: 'vertical' })
                          }}
                        >
                          Вертикально
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  {/* Кнопка удаления (скрыта для BOTTLE_ORIENTATION_VALIDATION) */}
                  {validationType !== 'BOTTLE_ORIENTATION_VALIDATION' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-none h-8 w-8 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        onItemDelete(item.id)
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-600" />
                    </Button>
                  )}
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

