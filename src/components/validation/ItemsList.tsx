'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus, Trash2, Pencil, AlertCircle } from 'lucide-react'
import type { TrayItem, ItemType, ValidationType, RecipeLineOption, RecipeLine, BuzzerColor, UpdateItemRequest, AnnotationView } from '@/types/domain'
import { ITEM_TYPE_LABELS, ITEM_TYPE_COLORS, BUZZER_COLOR_LABELS, getItemTypeFromValidationType, getItemColor } from '@/types/domain'
import { getValidationCapabilities } from '@/lib/validation-capabilities'
import { hasUnresolvedAmbiguity, hasMultipleOptions } from '@/lib/validation-rules'
import { cn } from '@/lib/utils'
import { EditItemDialog } from './EditItemDialog'
import { useValidationSession } from '@/contexts/ValidationSessionContext'

interface ItemsListProps {
  items: TrayItem[]
  annotations?: AnnotationView[]
  validationType: ValidationType
  selectedItemId: number | null
  recipeLines?: RecipeLine[]
  recipeLineOptions: RecipeLineOption[]
  activeMenu?: any[]
  onItemSelect: (id: number) => void
  onItemCreate: () => void
  onItemDelete: (id: number) => void
  onItemUpdate?: (id: number, data: UpdateItemRequest) => void
  readOnly?: boolean
}

export function ItemsList({
  items,
  annotations = [],
  validationType,
  selectedItemId,
  recipeLines = [],
  recipeLineOptions,
  activeMenu = [],
  onItemSelect,
  onItemCreate,
  onItemDelete,
  onItemUpdate,
  readOnly = false,
}: ItemsListProps) {
  // State для редактирования
  const [editingItem, setEditingItem] = useState<TrayItem | null>(null)

  // Получаем validationStatus из контекста (может быть undefined в read-only режиме)
  const context = useValidationSession()
  const validationStatus = context?.validationStatus || { itemErrors: new Map(), globalErrors: [] as string[], canComplete: false }

  // Получаем capabilities для текущего типа валидации
  const capabilities = getValidationCapabilities(validationType)
  
  // Filter items by validation type
  const itemType = getItemTypeFromValidationType(validationType)
  
  let filteredItems: TrayItem[]
  
  // Для OCCLUSION_VALIDATION показываем только items с окклюзированными аннотациями
  if (validationType === 'OCCLUSION_VALIDATION') {
    const itemsWithOcclusions = new Set(
      annotations
        .filter(ann => ann.is_occluded === true)
        .map(ann => ann.work_item_id)
    )
    filteredItems = items.filter(item => itemsWithOcclusions.has(item.id))
  } 
  // Для остальных типов - стандартная фильтрация
  else if (itemType && !capabilities.showAllItemTypes) {
    filteredItems = items.filter((item) => item.type === itemType)
  } 
  else {
    filteredItems = items
  }

  // Get item label - showing names from recipe_line (from check)
  const getItemLabel = (item: TrayItem): string => {
    let label = ''
    
    // Для FOOD: название блюда
    if (item.type === 'FOOD') {
      // Сначала проверяем metadata.name (для блюд из активного меню)
      if (item.metadata?.name) {
        label = item.metadata.name
      }
      // Потом проверяем recipe_line_id (для блюд из чека)
      else if (item.recipe_line_id) {
        const recipeLine = recipeLines.find(rl => rl.id === item.recipe_line_id)
        const selectedOption = recipeLineOptions.find(
          (opt) => opt.recipe_line_id === item.recipe_line_id && opt.is_selected
        )
        
        if (selectedOption?.name) {
          label = selectedOption.name
        } else {
          // Если нет selected, показываем первый доступный
          const anyOption = recipeLineOptions.find((opt) => opt.recipe_line_id === item.recipe_line_id)
          if (anyOption?.name) {
            label = anyOption.name
          } 
          // Fallback на raw_name из recipe_line
          else if (recipeLine?.raw_name) {
            label = recipeLine.raw_name
          } 
          else {
            // DEBUG: Логируем почему не нашли название
            console.warn(`[ItemsList] No name found for item ${item.id}, recipe_line_id=${item.recipe_line_id}. RecipeLine:`, recipeLine, 'Options:', recipeLineOptions.length)
            label = ITEM_TYPE_LABELS[item.type]
          }
        }
      }
      else {
        console.warn(`[ItemsList] FOOD item ${item.id} has no recipe_line_id and no metadata.name`)
        label = ITEM_TYPE_LABELS[item.type]
      }
    }
    // Для BUZZER: цвет
    else if (item.type === 'BUZZER' && item.metadata?.color) {
      const colorLabel = BUZZER_COLOR_LABELS[item.metadata.color as BuzzerColor] || item.metadata.color
      label = `${ITEM_TYPE_LABELS[item.type]} (${colorLabel})`
    }
    // Остальные типы
    else {
      label = ITEM_TYPE_LABELS[item.type]
    }
    
    // Добавить quantity если > 1
    if (item.quantity > 1) {
      label = `${item.quantity}x ${label}`
    }
    
    return label
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-none p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">
            {itemType ? ITEM_TYPE_LABELS[itemType] : 'Объекты'}
          </h2>
          {/* Кнопка "Добавить" видна только если есть права и не read-only */}
          {!readOnly && capabilities.canCreateItems && (
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
          filteredItems.map((item, index) => {
            const isSelected = item.id === selectedItemId
            const color = getItemColor(item)
            // Все work_items имеют уникальные ID
            const uniqueKey = item.id

            const itemErrors = validationStatus.itemErrors.get(item.id)
            const hasErrors = itemErrors && itemErrors.length > 0
            
            // Проверяем неопределенность (для FOOD_VALIDATION)
            const unresolvedAmbiguity = validationType === 'FOOD_VALIDATION' && hasUnresolvedAmbiguity(item, recipeLineOptions)
            const multipleOptions = validationType === 'FOOD_VALIDATION' && hasMultipleOptions(item, recipeLineOptions)
            const selectedAmbiguity = multipleOptions && !unresolvedAmbiguity // Есть варианты И один выбран
            
            // Проверяем был ли item добавлен пользователем (новый)
            const isNewItem = (item as any).isNewItem === true
            
            // Подпись горячей клавиши (1-9)
            const hotkey = index < 9 ? (index + 1).toString() : null

            return (
              <Card
                key={uniqueKey}
                className={cn(
                  'p-3 cursor-pointer transition-all hover:shadow-md relative',
                  isSelected && 'ring-2 ring-blue-500 bg-blue-50',
                  hasErrors && 'border-2 border-red-400 bg-red-50 shadow-sm',
                  isNewItem && !hasErrors && 'border-2 border-green-400 bg-green-50/50'
                )}
                onClick={() => onItemSelect(item.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {hotkey && (
                        <span className="text-[10px] font-mono text-gray-400 flex-none">
                          {hotkey}
                        </span>
                      )}
                      <div
                        className="w-3 h-3 rounded-full flex-none"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {getItemLabel(item)}
                      </span>
                      {/* Неразрешенная неопределенность - КРИТИЧНО */}
                      {unresolvedAmbiguity && !readOnly && (
                        <span className="text-[10px] font-semibold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded flex-none border border-orange-300 animate-pulse">
                          🆘 выбрать вариант
                        </span>
                      )}
                      {/* Выбран один из вариантов - нужна проверка */}
                      {selectedAmbiguity && !readOnly && (
                        <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded flex-none border border-yellow-300">
                          ⚠️ проверить выбор
                        </span>
                      )}
                      {isNewItem && !hasErrors && !unresolvedAmbiguity && !selectedAmbiguity && (
                        <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded flex-none">
                          Добавлено
                        </span>
                      )}
                      {hasErrors && (
                        <div title={itemErrors.join('\n')}>
                          <AlertCircle 
                            className="w-5 h-5 text-red-600 flex-none animate-pulse"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                      <span>{ITEM_TYPE_LABELS[item.type]}</span>
                    </div>
                    
                    {/* Показываем ошибки валидации */}
                    {hasErrors && (
                      <div className="mt-2 space-y-1">
                        {itemErrors.map((error: string, idx: number) => (
                          <div key={idx} className="text-xs text-red-700 bg-red-100 px-2 py-1 rounded">
                            {error}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* UI для ориентации бутылки */}
                    {capabilities.canSetBottleOrientation && item.type === 'FOOD' && (
                      <div>
                        {/* Режим редактирования: кнопки для изменения */}
                        {!readOnly && isSelected && onItemUpdate && (
                          <div className="mt-2 flex gap-1 border-t border-gray-200 pt-2">
                            <span className="text-xs text-gray-600 self-center mr-1">Ориентация:</span>
                            <Button
                              size="sm"
                              variant={item.bottle_orientation === 'horizontal' ? 'default' : 'outline'}
                              className="h-7 text-xs px-2"
                              onClick={(e) => {
                                e.stopPropagation()
                                onItemUpdate(item.id, { bottle_orientation: 'horizontal' })
                              }}
                              title="Горизонтально"
                            >
                              —
                            </Button>
                            <Button
                              size="sm"
                              variant={item.bottle_orientation === 'vertical' ? 'default' : 'outline'}
                              className="h-7 text-xs px-2"
                              onClick={(e) => {
                                e.stopPropagation()
                                onItemUpdate(item.id, { bottle_orientation: 'vertical' })
                              }}
                              title="Вертикально"
                            >
                              |
                            </Button>
                            <Button
                              size="sm"
                              variant={!item.bottle_orientation ? 'default' : 'outline'}
                              className="h-7 text-xs px-2"
                              onClick={(e) => {
                                e.stopPropagation()
                                onItemUpdate(item.id, { bottle_orientation: null })
                              }}
                              title="Не указано"
                            >
                              ✕
                            </Button>
                          </div>
                        )}
                        
                        {/* Режим просмотра: показываем текстом */}
                        {readOnly && validationType === 'BOTTLE_ORIENTATION_VALIDATION' && (
                          <div className="mt-2 border-t border-gray-200 pt-2">
                            <span className="text-xs text-gray-600">Ориентация: </span>
                            <span className={`text-xs font-medium ${item.bottle_orientation ? 'text-gray-900' : 'text-orange-600'}`}>
                              {item.bottle_orientation === 'horizontal' 
                                ? 'Горизонтально' 
                                : item.bottle_orientation === 'vertical'
                                ? 'Вертикально'
                                : 'Не выбрана'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Кнопки действий - только если не read-only */}
                  {!readOnly && (
                    <div className="flex-none flex gap-1">
                      {/* Кнопка редактирования */}
                      {capabilities.canUpdateItems && onItemUpdate && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingItem(item)
                          }}
                        >
                          <Pencil className="w-4 h-4 text-gray-400 hover:text-blue-600" />
                        </Button>
                      )}
                      
                      {/* Кнопка удаления */}
                      {capabilities.canDeleteItems && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            onItemDelete(item.id)
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-600" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )
          })
        )}
      </div>

      {/* Диалог редактирования */}
      {editingItem && onItemUpdate && (
        <EditItemDialog
          open={Boolean(editingItem)}
          onClose={() => setEditingItem(null)}
          onSave={onItemUpdate}
          item={editingItem}
          recipeLines={recipeLines}
          recipeLineOptions={recipeLineOptions}
          activeMenu={activeMenu}
        />
      )}
    </div>
  )
}

