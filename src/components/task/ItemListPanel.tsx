/**
 * ItemListPanel - универсальный компонент для отображения списка Items
 * 
 * Используется для:
 * - Dishes (блюда из чека)
 * - Plates (тарелки)
 * - Buzzers (баззеры)
 * - Bottles (бутылки)
 * - Nonfood (другие предметы)
 * 
 * Features:
 * - Бидирекционная подсветка (item ↔ annotations)
 * - Показ количества аннотаций на Main/Quality
 * - Индикация manual изменений
 * - Add/Edit/Delete операции
 */

'use client'

import { Item, Annotation, Image } from '@/types/annotations'
import { Button } from '@/components/ui/button'
import { Plus, Edit2, Trash2, AlertCircle, CheckCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ItemListPanelProps {
  items: Item[]
  annotations: Annotation[]
  images: Image[]
  selectedItemId: string | null
  hoveredAnnotationId: string | null
  
  // Callbacks
  onSelectItem: (itemId: string) => void
  onAddItem?: () => void
  onEditItem?: (itemId: string) => void
  onDeleteItem?: (itemId: string) => void
  onAnnotationHover?: (annotationId: string | null) => void
  
  // Customization
  title?: string
  showAddButton?: boolean
  showEditButtons?: boolean
  renderItemDetails?: (item: Item, stats: ItemStats) => React.ReactNode
}

interface ItemStats {
  mainCount: number
  qualityCount: number
  expectedCount?: number
  isValid: boolean
}

export function ItemListPanel({
  items,
  annotations,
  images,
  selectedItemId,
  hoveredAnnotationId,
  onSelectItem,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onAnnotationHover,
  title = 'Элементы',
  showAddButton = true,
  showEditButtons = true,
  renderItemDetails,
}: ItemListPanelProps) {
  const mainImage = images.find(img => img.image_type === 'main')
  const qualityImage = images.find(img => img.image_type === 'quality')

  const getItemStats = (item: Item): ItemStats => {
    const mainCount = mainImage
      ? annotations.filter(a => a.item_id === item.id && a.image_id === mainImage.id && !a.is_deleted).length
      : 0

    const qualityCount = qualityImage
      ? annotations.filter(a => a.item_id === item.id && a.image_id === qualityImage.id && !a.is_deleted).length
      : 0

    const expectedCount = item.expected_count

    const isValid = expectedCount !== undefined
      ? mainCount === expectedCount && qualityCount === expectedCount
      : mainCount === qualityCount && mainCount > 0

    return { mainCount, qualityCount, expectedCount, isValid }
  }

  const getItemAnnotations = (itemId: string) => {
    return annotations.filter(a => a.item_id === itemId && !a.is_deleted)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          {title} {items.length > 0 && `(${items.length})`}
        </h3>
        {showAddButton && onAddItem && (
          <Button
            onClick={onAddItem}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Добавить
          </Button>
        )}
      </div>

      {items.length === 0 && (
        <div className="text-sm text-gray-500 text-center py-8 border border-dashed rounded-lg">
          Нет элементов
          {showAddButton && onAddItem && (
            <div className="mt-2">
              <Button onClick={onAddItem} size="sm" variant="ghost">
                <Plus className="w-4 h-4 mr-2" />
                Добавить первый
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, index) => {
          const stats = getItemStats(item)
          const isSelected = selectedItemId === item.id
          const itemAnnotations = getItemAnnotations(item.id)
          const hasAnnotations = itemAnnotations.length > 0

          return (
            <div
              key={item.id}
              className={cn(
                'border rounded-lg p-3 cursor-pointer transition-all',
                isSelected 
                  ? 'border-yellow-400 bg-yellow-50 shadow-sm' 
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              )}
              onClick={() => onSelectItem(item.id)}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {index + 1}. {item.name}
                    </span>
                    {item.is_manual && (
                      <span className="inline-flex items-center text-xs text-blue-600 font-medium">
                        <Edit2 className="w-3 h-3 mr-1" />
                        Manual
                      </span>
                    )}
                  </div>
                  {item.source !== 'receipt' && (
                    <span className="text-xs text-gray-500">
                      Источник: {item.source === 'menu' ? 'Меню' : 'Qwen'}
                    </span>
                  )}
                </div>

                {/* Validation Status */}
                <div className="flex items-center gap-1">
                  {stats.isValid ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs text-gray-600 mb-2">
                <div className={cn(
                  'flex items-center gap-1',
                  stats.expectedCount && stats.mainCount !== stats.expectedCount && 'text-red-600 font-medium'
                )}>
                  <span>Main:</span>
                  <span>{stats.mainCount}</span>
                  {stats.expectedCount && <span>/ {stats.expectedCount}</span>}
                </div>
                <div className={cn(
                  'flex items-center gap-1',
                  stats.expectedCount && stats.qualityCount !== stats.expectedCount && 'text-red-600 font-medium'
                )}>
                  <span>Quality:</span>
                  <span>{stats.qualityCount}</span>
                  {stats.expectedCount && <span>/ {stats.expectedCount}</span>}
                </div>
              </div>

              {/* Custom Details */}
              {renderItemDetails && renderItemDetails(item, stats)}

              {/* Annotations List */}
              {hasAnnotations && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="text-xs text-gray-500 mb-1">
                    Аннотации ({itemAnnotations.length}):
                  </div>
                  <div className="space-y-1">
                    {itemAnnotations.map((ann) => {
                      const imageType = images.find(img => img.id === ann.image_id)?.image_type || 'unknown'
                      const isHovered = hoveredAnnotationId === ann.id

                      return (
                        <div
                          key={ann.id}
                          className={cn(
                            'text-xs p-1.5 rounded flex items-center justify-between',
                            isHovered ? 'bg-yellow-100' : 'bg-gray-50 hover:bg-gray-100'
                          )}
                          onMouseEnter={() => onAnnotationHover?.(ann.id)}
                          onMouseLeave={() => onAnnotationHover?.(null)}
                        >
                          <span>
                            {imageType === 'main' ? '📷 Main' : '📷 Quality'} - {ann.id.substring(0, 8)}
                          </span>
                          {ann.is_manual && (
                            <span className="text-blue-600">✏️</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Actions */}
              {showEditButtons && (onEditItem || onDeleteItem) && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                  {onEditItem && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditItem(item.id)
                      }}
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-xs h-7"
                    >
                      <Edit2 className="w-3 h-3" />
                      Изменить
                    </Button>
                  )}
                  {onDeleteItem && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteItem(item.id)
                      }}
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-xs h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      Удалить
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Специализированные варианты для разных типов
 */

export function DishItemListPanel(props: Omit<ItemListPanelProps, 'title'>) {
  return (
    <ItemListPanel
      {...props}
      title="Блюда"
      renderItemDetails={(item, stats) => (
        <div className="text-xs text-gray-600">
          {!stats.isValid && (
            <div className="flex items-center gap-1 text-red-600">
              <AlertCircle className="w-3 h-3" />
              <span>Несоответствие количества</span>
            </div>
          )}
        </div>
      )}
    />
  )
}

export function PlateItemListPanel(props: Omit<ItemListPanelProps, 'title' | 'showAddButton'>) {
  return (
    <ItemListPanel
      {...props}
      title="Тарелки"
      showAddButton={false}
    />
  )
}

export function BuzzerItemListPanel(props: Omit<ItemListPanelProps, 'title' | 'showAddButton'>) {
  return (
    <ItemListPanel
      {...props}
      title="Баззеры"
      showAddButton={false}
      renderItemDetails={(item, stats) => (
        <div className="text-xs">
          {item.metadata?.color && (
            <span className="text-gray-600">
              Цвет: <span className="font-medium">{item.metadata.color}</span>
            </span>
          )}
        </div>
      )}
    />
  )
}

export function BottleItemListPanel(props: Omit<ItemListPanelProps, 'title'>) {
  return (
    <ItemListPanel
      {...props}
      title="Бутылки"
      showAddButton={false}
      renderItemDetails={(item, stats) => {
        const annotations = props.annotations.filter(a => a.item_id === item.id && !a.is_deleted)
        const orientation = annotations[0]?.object_subtype
        
        return (
          <div className="text-xs">
            {orientation && (
              <span className="text-gray-600">
                Ориентация: <span className="font-medium">
                  {orientation === 'vertical' ? '⬆️ Вертикально' : '➡️ Горизонтально'}
                </span>
              </span>
            )}
            {!orientation && (
              <span className="text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Не указана ориентация
              </span>
            )}
          </div>
        )
      }}
    />
  )
}

