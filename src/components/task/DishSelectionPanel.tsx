'use client'

import { useState } from 'react'
import { Annotation, DishFromReceipt, Image } from '@/types/annotations'
import { Button } from '@/components/ui/button'
import { Check, AlertCircle, X, Plus, Minus, ChevronDown, ChevronUp, Trash2, Edit } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

interface DishSelectionPanelProps {
  dishesFromReceipt: DishFromReceipt[]
  annotations: Annotation[]
  images: Image[]
  selectedDishIndex: number | null
  onSelectDish: (index: number) => void
  onAddFromMenu: () => void
  onDishCountChange?: (groupIndex: number, newCount: number) => void
  onResolveAmbiguity?: (dishIndex: number, selectedDishName: string) => void
  onDeleteAnnotation?: (annotationId: string) => void
}

// Compact annotation list with hover details
function AnnotationListCompact({
  imageType,
  dishIndex,
  expected,
  annotations,
  onDeleteAnnotation,
}: {
  imageType: 'main' | 'quality'
  dishIndex: number
  expected: number
  annotations: Annotation[]
  onDeleteAnnotation?: (annotationId: string) => void
}) {
  const count = annotations.length
  const hasError = count !== expected
  const hasDuplicates = (() => {
    const coords = annotations
      .filter(a => a.bbox_x1 !== undefined && a.bbox_y1 !== undefined)
      .map(a => `${a.bbox_x1},${a.bbox_y1},${a.bbox_x2},${a.bbox_y2}`)
    return coords.length !== new Set(coords).size
  })()
  
  const getStatusIcon = () => {
    if (count === expected) return <Check className="w-3 h-3 text-green-600" />
    if (count === 0) return <X className="w-3 h-3 text-red-600" />
    return <AlertCircle className="w-3 h-3 text-amber-600" />
  }
  
  const getStatusColor = () => {
    if (count === expected) return 'text-green-600'
    if (count === 0) return 'text-red-600'
    return 'text-amber-600'
  }
  
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <div className="flex items-center gap-1 cursor-help" onClick={(e) => e.stopPropagation()}>
          <span className="text-gray-500 capitalize">{imageType}:</span>
          <span className={getStatusColor()}>{count}/{expected}</span>
          {getStatusIcon()}
          {hasDuplicates && <span className="text-xs text-orange-600 ml-0.5">дубли</span>}
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-700 mb-1.5">
            Аннотации на {imageType} ({count})
          </div>
          {annotations.length === 0 ? (
            <div className="text-xs text-gray-500 italic">Нет аннотаций</div>
          ) : (
            annotations.map((ann, idx) => {
              if (ann.bbox_x1 === undefined || ann.bbox_y1 === undefined) return null
              const coord = `(${Math.round(ann.bbox_x1)}, ${Math.round(ann.bbox_y1)})`
              return (
                <div key={ann.id} className="flex items-center justify-between gap-2 text-xs py-0.5">
                  <span className="text-gray-600 font-mono">{coord}</span>
                  {onDeleteAnnotation && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0 hover:bg-red-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteAnnotation(ann.id)
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-red-600" />
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

// Flatten dishes for display
function flattenDishes(dishesFromReceipt: DishFromReceipt[]) {
  return dishesFromReceipt.flatMap((item, groupIndex) => {
    const hasAmbiguity = item.Dishes.length > 1
    
    if (hasAmbiguity) {
      // Для неопределенности показываем все варианты через "/"
      const allNames = item.Dishes.map(d => d.Name).join(' / ')
      return [{
        name: allNames,
        expectedCount: item.Count,
        externalId: item.Dishes[0].ExternalId,
        groupIndex,
        flatIndex: groupIndex * 100,
        hasAmbiguity: true,
        variants: item.Dishes, // Сохраняем все варианты
      }]
    }
    
    return item.Dishes.map((dish, dishIndex) => ({
      name: dish.Name,
      expectedCount: item.Count,
      externalId: dish.ExternalId,
      groupIndex,
      flatIndex: groupIndex * 100 + dishIndex,
      hasAmbiguity: false,
      variants: [] as any[],
    }))
  })
}

export function DishSelectionPanel({
  dishesFromReceipt,
  annotations,
  images,
  selectedDishIndex,
  onSelectDish,
  onAddFromMenu,
  onDishCountChange,
  onResolveAmbiguity,
  onDeleteAnnotation,
}: DishSelectionPanelProps) {
  const dishes = dishesFromReceipt ? flattenDishes(dishesFromReceipt) : []
  const [expandedAmbiguityIndex, setExpandedAmbiguityIndex] = useState<number | null>(null)
  const [resolvedAmbiguities, setResolvedAmbiguities] = useState<Map<number, string>>(new Map())

  // Get annotations for a dish on a specific image type
  const getAnnotationsByImageType = (dishIndex: number, imageType: 'main' | 'quality') => {
    const image = images.find(img => img.image_type === imageType)
    if (!image) return []
    
    return annotations.filter(a =>
      a.object_type === 'dish' &&
      a.dish_index === dishIndex &&
      !a.is_deleted &&
      a.image_id === image.id
    )
  }

  // Count actual annotations for each dish on each image type
  const getCountByImageType = (dishIndex: number, imageType: 'main' | 'quality') => {
    return getAnnotationsByImageType(dishIndex, imageType).length
  }
  
  // Check if annotations have duplicate coordinates
  const hasDuplicateCoordinates = (anns: Annotation[]) => {
    const coords = anns
      .filter(a => a.bbox_x1 !== undefined && a.bbox_y1 !== undefined)
      .map(a => `${a.bbox_x1},${a.bbox_y1},${a.bbox_x2},${a.bbox_y2}`)
    return coords.length !== new Set(coords).size
  }

  // Check if ambiguity is resolved for a dish
  const isAmbiguityResolved = (dishIndex: number) => {
    // Проверяем локальное состояние
    if (resolvedAmbiguities.has(dishIndex)) return true
    
    // Проверяем аннотации
    const dishAnnotations = annotations.filter(a =>
      a.object_type === 'dish' &&
      a.dish_index === dishIndex &&
      !a.is_deleted
    )
    
    if (dishAnnotations.length === 0) return false
    
    // Проверяем что у всех аннотаций есть custom_dish_name
    return dishAnnotations.every(a => a.custom_dish_name)
  }

  // Get selected dish name if ambiguity is resolved
  const getSelectedDishName = (dishIndex: number) => {
    // Сначала проверяем локальное состояние
    if (resolvedAmbiguities.has(dishIndex)) {
      return resolvedAmbiguities.get(dishIndex)
    }
    
    // Затем проверяем аннотации
    const dishAnnotation = annotations.find(a =>
      a.object_type === 'dish' &&
      a.dish_index === dishIndex &&
      !a.is_deleted &&
      a.custom_dish_name
    )
    
    return dishAnnotation?.custom_dish_name
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
    <div className="space-y-3">
      {/* Header */}
      <Button
        size="sm"
        variant="outline"
        onClick={onAddFromMenu}
        className="w-full text-xs"
      >
        + Добавить из меню
      </Button>

      {/* Dishes list */}
      <div className="space-y-1">
        {dishes.map((dish, index) => {
          const countMain = getCountByImageType(dish.groupIndex, 'main')
          const countQuality = getCountByImageType(dish.groupIndex, 'quality')
          const expected = dish.expectedCount
          const isSelected = selectedDishIndex === dish.groupIndex
          
          const statusMain = getStatus(expected, countMain)
          const statusQuality = getStatus(expected, countQuality)
          
          // Общий статус - если хоть одна картинка неправильная, показываем предупреждение
          const hasError = countMain !== expected || countQuality !== expected

          return (
            <div
              key={dish.flatIndex}
              className={`p-2 rounded border cursor-pointer transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => onSelectDish(dish.groupIndex)}
            >
              {/* Dish info */}
              <div className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {dish.hasAmbiguity ? (
                      <>
                        {isAmbiguityResolved(dish.groupIndex) ? (
                          <>
                            <div className="text-sm text-gray-900 truncate">
                              {dish.groupIndex + 1}. {getSelectedDishName(dish.groupIndex)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm text-gray-900 truncate">
                              {dish.groupIndex + 1}. <span className="text-gray-500 italic">Неопределенность</span>
                            </div>
                            <div className="text-xs text-red-600 font-medium mt-0.5">
                              ⚠️ НЕОПРЕДЕЛЕННОСТЬ - выберите правильное блюдо
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-gray-900 truncate">
                        {dish.groupIndex + 1}. {dish.name}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Edit button - показываем для всех блюд */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0 hover:bg-blue-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        onResolveAmbiguity(index, '')  // Пустая строка означает "открыть меню для выбора"
                      }}
                      title={dish.hasAmbiguity && !isAmbiguityResolved(index) 
                        ? "Выбрать из вариантов"
                        : "Заменить блюдо"}
                    >
                      <Edit className="h-3 w-3 text-blue-600" />
                    </Button>
                    {/* Status icon */}
                    {dish.hasAmbiguity && !isAmbiguityResolved(index) ? (
                      <X className="w-4 h-4 text-red-600 flex-shrink-0" />
                    ) : (
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                    )}
                  </div>
                </div>
                
                {/* Count adjustment (редко) */}
                {onDishCountChange && (
                  <div className="flex items-center gap-1 text-xs mt-1" onClick={(e) => e.stopPropagation()}>
                    <span className="text-gray-500">Чек:</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-4 w-4 p-0"
                      onClick={() => onDishCountChange(dish.groupIndex, expected - 1)}
                      disabled={expected <= 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="text-gray-900 font-mono min-w-[2ch] text-center">
                      {expected}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-4 w-4 p-0"
                      onClick={() => onDishCountChange(dish.groupIndex, expected + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                
                {/* Inline variant selector for ambiguity - скрываем после выбора */}
                {dish.hasAmbiguity && !isAmbiguityResolved(index) && (
                  <div className="mt-2 border-t border-red-200 pt-2">
                    <button
                      className="flex items-center justify-between w-full text-xs text-red-700 hover:text-red-800 mb-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedAmbiguityIndex(expandedAmbiguityIndex === index ? null : index)
                      }}
                    >
                      <span className="font-medium">Выберите правильное блюдо:</span>
                      {expandedAmbiguityIndex === index ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                    
                    {expandedAmbiguityIndex === index && (
                      <RadioGroup
                        onValueChange={(value) => {
                          // Сохраняем выбор локально
                          setResolvedAmbiguities(new Map(resolvedAmbiguities).set(index, value))
                          // Вызываем колбэк для сохранения
                          if (onResolveAmbiguity) {
                            onResolveAmbiguity(index, value)
                          }
                          setExpandedAmbiguityIndex(null)
                        }}
                        className="space-y-1 mt-1"
                      >
                        {dish.variants?.map((variant: any, variantIdx: number) => (
                          <div
                            key={variantIdx}
                            className="flex items-center space-x-2 p-1.5 rounded hover:bg-red-50"
                          >
                            <RadioGroupItem
                              value={variant.Name}
                              id={`variant-${index}-${variantIdx}`}
                              className="h-3 w-3"
                            />
                            <Label
                              htmlFor={`variant-${index}-${variantIdx}`}
                              className="text-xs cursor-pointer flex-1"
                            >
                              {variant.Name}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

