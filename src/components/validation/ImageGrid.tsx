'use client'

import { useState } from 'react'
import type { Image, AnnotationView, TrayItem, ItemType, RecipeLineOption, ValidationType } from '@/types/domain'
import { BBoxCanvas } from './BBoxCanvas'
import type { BBox } from '@/types/domain'
import { ITEM_TYPE_COLORS, getItemTypeFromValidationType, getItemColor } from '@/types/domain'
import { getValidationCapabilities } from '@/lib/validation-capabilities'

// Supabase URL - must be set as NEXT_PUBLIC_SUPABASE_URL env variable
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

interface ImageGridProps {
  images: Image[]
  annotations: AnnotationView[]
  items: TrayItem[]
  recipeLineOptions: RecipeLineOption[]
  selectedItemId: number | null
  selectedAnnotationId: number | string | null
  validationType: ValidationType
  mode: 'view' | 'draw' | 'edit'
  displayMode?: 'edit' | 'view'  // Режим отображения для фильтрации (edit=все объекты, view=только с окклюзиями)
  onAnnotationCreate: (imageId: number, bbox: BBox) => void
  onAnnotationUpdate: (id: number | string, data: { bbox: BBox }) => void
  onAnnotationSelect: (id: number | string | null, itemId?: number) => void
  onAnnotationDelete: (id: number | string) => void
  onAnnotationToggleOcclusion: (id: number | string) => void
}

export function ImageGrid({
  images,
  annotations,
  items,
  recipeLineOptions,
  selectedItemId,
  selectedAnnotationId,
  validationType,
  mode,
  displayMode = 'view',
  onAnnotationCreate,
  onAnnotationUpdate,
  onAnnotationSelect,
  onAnnotationDelete,
  onAnnotationToggleOcclusion,
}: ImageGridProps) {
  // Получаем capabilities для текущего типа валидации
  const capabilities = getValidationCapabilities(validationType)

  // Get storage URL
  const getImageUrl = (storagePath: string) => {
    // storagePath is like "recognitions/100024/camera1.jpg"
    const url = `${SUPABASE_URL}/storage/v1/object/public/rrs-photos/${storagePath}`
    // Debug: log first URL to check if env variable is set
    if (storagePath.includes('camera1')) {
      console.log('[ImageGrid] Image URL:', url, '| Supabase URL:', SUPABASE_URL)
    }
    return url
  }

  // Get item label for display from recipe_line_options (from check)
  const getItemLabel = (item: TrayItem | undefined): string => {
    if (!item) return ''
    
    // For FOOD items with recipe_line_id, find the recipe line and show selected option
    if (item.recipe_line_id && item.type === 'FOOD') {
      const selectedOption = recipeLineOptions.find(
        (opt) => opt.recipe_line_id === item.recipe_line_id && opt.is_selected
      )
      if (selectedOption?.name) {
        return selectedOption.name
      }
      const anyOption = recipeLineOptions.find((opt) => opt.recipe_line_id === item.recipe_line_id)
      if (anyOption?.name) {
        return anyOption.name
      }
    }
    
    return ''
  }

  // Фильтрация annotations по типу валидации
  const getRelevantAnnotations = (annotations: AnnotationView[]) => {
    // Для OCCLUSION_VALIDATION фильтрация зависит от displayMode
    if (validationType === 'OCCLUSION_VALIDATION') {
      if (displayMode === 'edit') {
        // В режиме edit показываем ВСЕ аннотации (можно пометить окклюзию на любой)
        return annotations
      } else {
        // В режиме view показываем только аннотации с is_occluded=true
        return annotations.filter(ann => ann.is_occluded === true)
      }
    }
    
    // Если показываем все типы (например для других случаев)
    if (capabilities.showAllItemTypes) {
      return annotations
    }
    
    // Для остальных типов валидации показываем только соответствующий тип
    const allowedType = getItemTypeFromValidationType(validationType)
    if (!allowedType) return annotations
    
    return annotations.filter(ann => {
      const item = items.find(i => i.id === ann.work_item_id)
      return item?.type === allowedType
    })
  }

  // Convert annotations to BBoxCanvas format
  const getAnnotationsForImage = (imageId: number) => {
    // Сначала фильтруем по типу валидации, потом по imageId
    const relevantAnnotations = getRelevantAnnotations(annotations)
    
    return relevantAnnotations
      .filter((ann) => ann.image_id === imageId)
      .map((ann) => {
        const item = items.find((i) => i.id === ann.work_item_id)
        return {
          id: ann.id,
          bbox: ann.bbox,
          itemType: item?.type || ('OTHER' as ItemType),
          itemId: ann.work_item_id,
          itemLabel: getItemLabel(item),
          itemColor: item ? getItemColor(item) : ITEM_TYPE_COLORS.OTHER,
          // Показываем визуальные признаки окклюзии ТОЛЬКО на вкладке OCCLUSION_VALIDATION
          isOccluded: validationType === 'OCCLUSION_VALIDATION' ? ann.is_occluded : false,
        }
      })
  }

  return (
    <div className="grid grid-cols-2 gap-4 h-full min-h-0">
      {images
        .sort((a, b) => a.camera_number - b.camera_number)
        .map((image) => {
          const allImageAnnotations = getAnnotationsForImage(image.id)
          
          // Если выбран объект - показываем только его аннотации
          // Если не выбран:
          //   - В режиме view - показываем все аннотации
          //   - Для OCCLUSION_VALIDATION - показываем все
          //   - Для остальных типов валидации в режиме редактирования - пустой список
          const imageAnnotations = selectedItemId 
            ? allImageAnnotations.filter(ann => ann.itemId === selectedItemId)
            : (mode === 'view' || capabilities.showAllItemTypes ? allImageAnnotations : [])
          
          return (
            <div key={image.id} className="flex flex-col h-full min-h-0">
              {/* Фиксированная высота для заголовка и списка аннотаций */}
              <div className="flex-none mb-2 flex flex-col" style={{ minHeight: '60px', maxHeight: '120px' }}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-gray-700">
                    Камера {image.camera_number}
                  </h3>
                  {imageAnnotations.length > 0 && (
                    <span className="text-xs text-gray-500">
                      {imageAnnotations.length} аннотаций
                    </span>
                  )}
                </div>
                {/* Show annotations - с фиксированной высотой и скроллом */}
                {imageAnnotations.length > 0 && (
                  <div className="flex-1 overflow-y-auto">
                    <div className="flex flex-wrap gap-1">
                      {imageAnnotations.map((ann, idx) => {
                        const isSelected = ann.id === selectedAnnotationId
                        return (
                          <div
                            key={`ann-${image.id}-${ann.id}-${idx}`}
                            className={`text-xs px-2 py-1 rounded cursor-pointer flex items-center gap-2 transition-all ${
                              isSelected ? 'ring-2 ring-offset-1' : 'hover:brightness-90'
                            }`}
                            style={{ 
                              backgroundColor: ann.itemColor + (isSelected ? '40' : '20'),
                              color: ann.itemColor,
                              border: `${isSelected ? '2px' : '1px'} solid ${ann.itemColor}`,
                              // Показываем затемнение окклюзии только на вкладке OCCLUSION_VALIDATION
                              opacity: (validationType === 'OCCLUSION_VALIDATION' && ann.isOccluded) ? 0.6 : 1
                            }}
                            onClick={() => onAnnotationSelect(ann.id, ann.itemId)}
                          >
                            <span className="flex-1">
                              {ann.itemLabel || `#${idx + 1}`}
                            </span>
                            {isSelected && (capabilities.canToggleOcclusion || capabilities.canDeleteAnnotations) && (
                              <div className="flex items-center gap-2 border-l border-gray-300 pl-2">
                                {capabilities.canToggleOcclusion && (
                                  <label
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-100/50 px-1.5 py-0.5 rounded transition-colors"
                                    title="Отметить перекрытие"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={ann.isOccluded || false}
                                      onChange={() => onAnnotationToggleOcclusion(ann.id)}
                                      className="w-4 h-4 cursor-pointer accent-blue-600 border-2 border-gray-400 rounded"
                                    />
                                    <span className="text-xs font-medium whitespace-nowrap text-gray-900">Перекрыт</span>
                                  </label>
                                )}
                                {capabilities.canDeleteAnnotations && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (confirm('Удалить аннотацию?')) {
                                        onAnnotationDelete(ann.id)
                                      }
                                    }}
                                    className="hover:scale-110 transition-transform"
                                    title="Удалить"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              {/* Canvas занимает оставшееся пространство */}
              <div className="flex-1 min-h-0">
                <BBoxCanvas
                  imageUrl={getImageUrl(image.storage_path)}
                  imageWidth={image.width}
                  imageHeight={image.height}
                  annotations={imageAnnotations}
                  selectedAnnotationId={selectedAnnotationId}
                  highlightedItemId={selectedItemId}
                  mode={mode}
                  canEdit={capabilities.canEditAnnotationsBBox}
                  onAnnotationCreate={(bbox) => onAnnotationCreate(image.id, bbox)}
                  onAnnotationUpdate={onAnnotationUpdate}
                  onAnnotationSelect={(id) => {
                    const ann = imageAnnotations.find(a => a.id === id)
                    onAnnotationSelect(id, ann?.itemId)
                  }}
                  onAnnotationDelete={onAnnotationDelete}
                  onAnnotationToggleOcclusion={onAnnotationToggleOcclusion}
                />
              </div>
            </div>
          )
        })}
    </div>
  )
}

