'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus, Trash2, Pencil, AlertCircle, ArrowUp, Eye, EyeOff, Flag, MessageSquare } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { TrayItem, ItemType, ValidationType, RecipeLineOption, RecipeLine, BuzzerColor, UpdateItemRequest, AnnotationView, ProductCatalogItem, ActiveMenuItem } from '@/types/domain'
import { ITEM_TYPE_LABELS, ITEM_TYPE_COLORS, BUZZER_COLOR_LABELS, getItemTypeFromValidationType, getItemColor } from '@/types/domain'
import { getValidationCapabilities } from '@/lib/validation-capabilities'
import { hasUnresolvedAmbiguity, hasMultipleOptions } from '@/lib/validation-rules'
import { getTestSplitWarnings, type TestSplitWarning } from '@/lib/test-split-validation-rules'
import { cn } from '@/lib/utils'
import { EditItemDialog } from './EditItemDialog'
import { ProductSelector } from './ProductSelector'
import { useValidationSession } from '@/contexts/ValidationSessionContext'

interface ItemsListProps {
  items: TrayItem[]
  annotations?: AnnotationView[]
  validationType: ValidationType
  selectedItemId: number | null
  recipeLines?: RecipeLine[]
  recipeLineOptions: RecipeLineOption[]
  activeMenu?: ActiveMenuItem[]
  onItemSelect: (id: number) => void
  onItemCreate: () => void
  onItemDelete: (id: number) => void
  onItemUpdate?: (id: number, data: UpdateItemRequest) => void
  readOnly?: boolean
  mode?: 'edit' | 'view'
  isTestSplit?: boolean
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
  mode = 'view',
  isTestSplit = false,
}: ItemsListProps) {
  const [editingItem, setEditingItem] = useState<TrayItem | null>(null)
  const [classChangeItem, setClassChangeItem] = useState<TrayItem | null>(null)
  const [flagCommentItemId, setFlagCommentItemId] = useState<number | null>(null)
  const [flagCommentDraft, setFlagCommentDraft] = useState('')

  // Получаем validationStatus из контекста (может быть undefined в read-only режиме)
  const context = useValidationSession()
  const validationStatus = context?.validationStatus || { itemErrors: new Map(), globalErrors: [] as string[], canComplete: false }

  // Получаем capabilities для текущего типа валидации
  const capabilities = getValidationCapabilities(validationType)
  
  // Filter items by validation type
  const itemType = getItemTypeFromValidationType(validationType)
  
  let filteredItems: TrayItem[]
  
  // Для OCCLUSION_VALIDATION фильтрация зависит от режима
  if (validationType === 'OCCLUSION_VALIDATION') {
    if (mode === 'edit') {
      // В режиме edit показываем ВСЕ items (любые объекты доступны для окклюзий)
      filteredItems = items
    } else {
      // В режиме view показываем только items с окклюзированными аннотациями
      const itemsWithOcclusions = new Set(
        annotations
          .filter(ann => ann.is_occluded === true)
          .map(ann => ann.work_item_id)
      )
      filteredItems = items.filter(item => itemsWithOcclusions.has(item.id))
    }
  } 
  // Для остальных типов - стандартная фильтрация
  else if (itemType && !capabilities.showAllItemTypes) {
    filteredItems = items.filter((item) => item.type === itemType)
  } 
  else {
    filteredItems = items
  }

  const handleProductSelect = useCallback((item: TrayItem, product: ProductCatalogItem) => {
    if (!onItemUpdate) return
    onItemUpdate(item.id, {
      name: product.name,
      ean: product.ean,
      product_type: product.product_type,
    })
  }, [onItemUpdate])

  const handleFlagSave = useCallback((itemId: number, flagged: boolean, comment: string) => {
    if (!onItemUpdate) return
    onItemUpdate(itemId, { flagged, flag_comment: comment })
    setFlagCommentItemId(null)
  }, [onItemUpdate])

  const getItemLabel = (item: TrayItem): string => {
    let label = ''

    if (item.type === 'FOOD') {
      if (item.name) {
        label = item.name
      } else if (item.metadata?.name) {
        label = item.metadata.name
      } else if (item.recipe_line_id) {
        const recipeLine = recipeLines.find(rl => rl.id === item.recipe_line_id)
        const allOptions = recipeLineOptions.filter((opt) => opt.recipe_line_id === item.recipe_line_id)
        const selectedOption = allOptions.find(opt => opt.is_selected)

        if (allOptions.length > 1 && !selectedOption) {
          label = 'Выберите вариант блюда'
        } else if (selectedOption?.name) {
          label = selectedOption.name
        } else if (allOptions.length === 1 && allOptions[0]?.name) {
          label = allOptions[0].name
        } else if (recipeLine?.raw_name) {
          label = recipeLine.raw_name
        } else {
          label = ITEM_TYPE_LABELS[item.type]
        }
      } else {
        label = ITEM_TYPE_LABELS[item.type]
      }
    } else if (item.type === 'BUZZER' && item.metadata?.color) {
      const colorLabel = BUZZER_COLOR_LABELS[item.metadata.color as BuzzerColor] || item.metadata.color
      label = `${ITEM_TYPE_LABELS[item.type]} (${colorLabel})`
    } else {
      label = ITEM_TYPE_LABELS[item.type]
    }

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
                  isNewItem && !hasErrors && 'border-2 border-green-400 bg-green-50/50',
                  isTestSplit && item.flagged && !isSelected && 'border-2 border-orange-300 bg-orange-50/50'
                )}
                onClick={() => onItemSelect(item.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                      {hotkey && (
                        <span className="text-[10px] font-mono text-gray-400 flex-none">
                          {hotkey}
                        </span>
                      )}
                      <div
                        className="w-3 h-3 rounded-full flex-none"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm font-medium text-gray-900">
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
                    <div className="flex flex-wrap gap-1.5 text-xs text-gray-500">
                      <span>{ITEM_TYPE_LABELS[item.type]}</span>
                      {/* Test split badges */}
                      {isTestSplit && item.up === true && (
                        <span className="px-1 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold text-[10px]">UP</span>
                      )}
                      {isTestSplit && item.label_visible === true && (
                        <span className="px-1 py-0.5 rounded bg-green-100 text-green-700 font-semibold text-[10px]">VISIBLE</span>
                      )}
                      {isTestSplit && item.label_visible === false && item.up !== true && (
                        <span className="px-1 py-0.5 rounded bg-gray-100 text-gray-600 font-semibold text-[10px]">NOT VISIBLE</span>
                      )}
                      {isTestSplit && item.flagged && (
                        <span className="px-1 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold text-[10px]">?</span>
                      )}
                    </div>

                    {hasErrors && (
                      <div className="mt-2 space-y-1">
                        {itemErrors.map((error: string, idx: number) => (
                          <div key={idx} className="text-xs text-red-700 bg-red-100 px-2 py-1 rounded">
                            {error}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Test split: two independent toggle rows for Bebida (always visible, no need to select) */}
                    {isTestSplit && !readOnly && onItemUpdate && (item.product_type || '').toLowerCase() === 'bebida' && (
                      <div className="mt-2 border-t border-gray-200 pt-2 space-y-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500 w-[4.5rem] flex-shrink-0">Полож.:</span>
                          <Button
                            size="sm"
                            variant={item.up === true ? 'default' : 'outline'}
                            className={cn('h-6 text-[11px] px-2', item.up === true && 'bg-blue-600 hover:bg-blue-700')}
                            onClick={(e) => { e.stopPropagation(); onItemUpdate(item.id, { up: item.up === true ? null : true }) }}
                          >
                            <ArrowUp className="w-3 h-3 mr-0.5" /> Верт.
                          </Button>
                          <Button
                            size="sm"
                            variant={item.up === false ? 'default' : 'outline'}
                            className={cn('h-6 text-[11px] px-2', item.up === false && 'bg-blue-600 hover:bg-blue-700')}
                            onClick={(e) => { e.stopPropagation(); onItemUpdate(item.id, { up: item.up === false ? null : false }) }}
                          >
                            — Гориз.
                          </Button>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500 w-[4.5rem] flex-shrink-0">Этикетка:</span>
                          <Button
                            size="sm"
                            variant={item.label_visible === true ? 'default' : 'outline'}
                            className={cn('h-6 text-[11px] px-2', item.label_visible === true && 'bg-green-600 hover:bg-green-700')}
                            onClick={(e) => { e.stopPropagation(); onItemUpdate(item.id, { label_visible: item.label_visible === true ? null : true }) }}
                          >
                            <Eye className="w-3 h-3 mr-0.5" /> Видна
                          </Button>
                          <Button
                            size="sm"
                            variant={item.label_visible === false ? 'default' : 'outline'}
                            className={cn('h-6 text-[11px] px-2', item.label_visible === false && 'bg-gray-600 hover:bg-gray-700')}
                            onClick={(e) => { e.stopPropagation(); onItemUpdate(item.id, { label_visible: item.label_visible === false ? null : false }) }}
                          >
                            <EyeOff className="w-3 h-3 mr-0.5" /> Не видна
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Test split: Validation warnings */}
                    {isTestSplit && (() => {
                      const warnings = getTestSplitWarnings(item)
                      if (warnings.length === 0) return null
                      return (
                        <div className="mt-1.5 space-y-0.5">
                          {warnings.map((w: TestSplitWarning, idx: number) => (
                            <div key={idx} className={cn(
                              'text-[11px] px-1.5 py-0.5 rounded',
                              w.type === 'error' && 'bg-red-100 text-red-700',
                              w.type === 'warning' && 'bg-yellow-100 text-yellow-700',
                              w.type === 'info' && 'bg-blue-50 text-blue-600',
                            )}>
                              {w.message}
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    {/* Non-test-split: bottle orientation UI */}
                    {!isTestSplit && capabilities.canSetBottleOrientation && item.type === 'FOOD' && (
                      <div>
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
                  
                  {!readOnly && (
                    <div className="flex-none flex flex-col gap-0.5">
                      {/* Test split: class change button */}
                      {isTestSplit && onItemUpdate && item.type === 'FOOD' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            setClassChangeItem(item)
                          }}
                          title="Сменить класс"
                        >
                          <Pencil className="w-3.5 h-3.5 text-gray-400 hover:text-blue-600" />
                        </Button>
                      )}
                      {/* Test split: flag button */}
                      {isTestSplit && onItemUpdate && (
                        <Popover
                          open={flagCommentItemId === item.id}
                          onOpenChange={(open) => {
                            if (open) {
                              setFlagCommentItemId(item.id)
                              setFlagCommentDraft(item.flag_comment || '')
                            } else {
                              setFlagCommentItemId(null)
                            }
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className={cn(
                                'h-7 w-7 p-0',
                                item.flagged && 'text-orange-500'
                              )}
                              onClick={(e) => e.stopPropagation()}
                              title="Под вопросом"
                            >
                              <Flag className="w-3.5 h-3.5" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-64 p-3"
                            side="left"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="space-y-2">
                              <p className="text-xs font-medium">Пометить под вопросом</p>
                              <Input
                                placeholder="Комментарий (необязательно)..."
                                value={flagCommentDraft}
                                onChange={(e) => setFlagCommentDraft(e.target.value)}
                                className="h-8 text-xs"
                              />
                              <div className="flex gap-1.5">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs flex-1"
                                  onClick={() => {
                                    onItemUpdate(item.id, { flagged: true, flag_comment: flagCommentDraft || null })
                                    setFlagCommentItemId(null)
                                  }}
                                >
                                  <Flag className="w-3 h-3 mr-1" />
                                  Пометить
                                </Button>
                                {item.flagged && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      onItemUpdate(item.id, { flagged: false, flag_comment: null })
                                      setFlagCommentItemId(null)
                                    }}
                                  >
                                    Снять
                                  </Button>
                                )}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                      {/* Standard edit button (non-test-split) */}
                      {!isTestSplit && capabilities.canUpdateItems && onItemUpdate && (
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
                      {capabilities.canDeleteItems && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            onItemDelete(item.id)
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-600" />
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

      {/* Test split: Product selector dialog */}
      {classChangeItem && onItemUpdate && (
        <ProductSelector
          open={Boolean(classChangeItem)}
          onClose={() => setClassChangeItem(null)}
          onSelect={(product) => {
            handleProductSelect(classChangeItem, product)
            setClassChangeItem(null)
          }}
          currentName={classChangeItem.name || classChangeItem.metadata?.name}
          currentProductType={classChangeItem.product_type}
          activeMenu={activeMenu}
        />
      )}

      {editingItem && onItemUpdate && (
        <EditItemDialog
          open={Boolean(editingItem)}
          onClose={() => setEditingItem(null)}
          onSave={(id, data) => {
            // Если id === -1, это новый item - создаем его
            if (id === -1 && editingItem.recipe_line_id) {
              // Создаем новый item через onItemCreate с использованием recipe_line_id
              // и выбранного option_id если есть
              const createData: any = {
                type: 'FOOD',
                recipe_line_id: data.recipe_line_id || editingItem.recipe_line_id,
                quantity: data.quantity || editingItem.quantity,
              }
              
              if (data.selected_option_id) {
                createData.selected_option_id = data.selected_option_id
              }
              
              onItemCreate()
              // После вызова onItemCreate нужно передать данные
              // Но onItemCreate не принимает данные, поэтому используем другой подход
              // Используем контекст напрямую
              const newItemId = context?.createItem(createData)
              if (newItemId) {
                onItemSelect(newItemId)
              }
              setEditingItem(null)
            } else {
              // Обычное обновление существующего item
              onItemUpdate(id, data)
              setEditingItem(null)
            }
          }}
          item={editingItem}
          recipeLines={recipeLines}
          recipeLineOptions={recipeLineOptions}
          activeMenu={activeMenu}
        />
      )}
    </div>
  )
}

