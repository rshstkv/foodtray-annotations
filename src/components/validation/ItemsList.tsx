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
}

export function ItemsList({
  items,
  validationType,
  selectedItemId,
  recipeLineOptions,
  onItemSelect,
  onItemCreate,
  onItemDelete,
}: ItemsListProps) {
  // Filter items by validation type
  const itemType = getItemTypeFromValidationType(validationType)
  const filteredItems = itemType
    ? items.filter((item) => item.item_type === itemType)
    : items

  // Get item label - showing names from recipe_line_options (from check)
  const getItemLabel = (item: TrayItem): string => {
    // First priority: if item has recipe_line_option_id, get name from recipe
    if (item.recipe_line_option_id) {
      const option = recipeLineOptions.find((opt) => opt.id === item.recipe_line_option_id)
      if (option?.name) {
        return option.name
      }
    }
    
    // Second priority: name from metadata
    if (item.metadata?.name) {
      return String(item.metadata.name)
    }
    
    // Third priority: external_id (для новых элементов, добавленных вручную)
    if (item.menu_item_external_id) {
      return item.menu_item_external_id
    }
    
    // For non-FOOD items, show color if available
    if (item.metadata?.color) {
      return `${ITEM_TYPE_LABELS[item.item_type]} (${item.metadata.color})`
    }
    
    return ITEM_TYPE_LABELS[item.item_type]
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-none p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">
            {itemType ? ITEM_TYPE_LABELS[itemType] : 'Объекты'}
          </h2>
          <Button size="sm" onClick={onItemCreate}>
            <Plus className="w-4 h-4 mr-1" />
            Добавить
          </Button>
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
            const color = ITEM_TYPE_COLORS[item.item_type]

            return (
              <Card
                key={item.id}
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
                      <span>{ITEM_TYPE_LABELS[item.item_type]}</span>
                      {item.is_modified && (
                        <span className="text-blue-600 font-medium">изменено</span>
                      )}
                    </div>
                  </div>
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
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

