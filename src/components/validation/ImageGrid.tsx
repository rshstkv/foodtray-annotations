'use client'

import { useState } from 'react'
import type { Image, AnnotationView, TrayItem, ItemType, RecipeLineOption } from '@/types/domain'
import { BBoxCanvas } from './BBoxCanvas'
import type { BBox } from '@/types/domain'
import { ITEM_TYPE_COLORS } from '@/types/domain'

interface ImageGridProps {
  images: Image[]
  annotations: AnnotationView[]
  items: TrayItem[]
  recipeLineOptions: RecipeLineOption[]
  selectedItemId: number | null
  mode: 'view' | 'draw' | 'edit'
  onAnnotationCreate: (imageId: number, bbox: BBox) => void
  onAnnotationUpdate: (id: number, bbox: BBox) => void
  onAnnotationSelect: (id: number | null) => void
}

export function ImageGrid({
  images,
  annotations,
  items,
  recipeLineOptions,
  selectedItemId,
  mode,
  onAnnotationCreate,
  onAnnotationUpdate,
  onAnnotationSelect,
}: ImageGridProps) {
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<number | null>(null)

  // Get storage URL
  const getImageUrl = (storagePath: string) => {
    // storagePath is like "recognitions/100024/camera1.jpg", need to add bucket name
    return `http://127.0.0.1:54321/storage/v1/object/public/rrs-photos/${storagePath}`
  }

  // Get item label for display from recipe_line_options (from check)
  const getItemLabel = (item: TrayItem | undefined): string => {
    if (!item) return ''
    
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
    
    // Third priority: external_id (for manually added items)
    if (item.menu_item_external_id) {
      return item.menu_item_external_id
    }
    
    return ''
  }

  // Convert annotations to BBoxCanvas format
  const getAnnotationsForImage = (imageId: number) => {
    return annotations
      .filter((ann) => ann.image_id === imageId)
      .map((ann) => {
        const item = items.find((i) => i.id === ann.tray_item_id)
        return {
          id: ann.id,
          bbox: ann.bbox,
          itemType: item?.item_type || ('OTHER' as ItemType),
          itemId: ann.tray_item_id,
          itemLabel: getItemLabel(item),
        }
      })
  }

  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(null)

  const handleAnnotationSelect = (id: number | null) => {
    setSelectedAnnotationId(id)
    onAnnotationSelect(id)
  }

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      {images
        .sort((a, b) => a.camera_number - b.camera_number)
        .map((image) => {
          const imageAnnotations = getAnnotationsForImage(image.id)
          const selectedItemAnnotations = selectedItemId 
            ? imageAnnotations.filter(ann => ann.itemId === selectedItemId)
            : []
          
          return (
            <div key={image.id} className="flex flex-col h-full">
              <div className="flex-none mb-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700">
                    Камера {image.camera_number}
                  </h3>
                  {selectedItemId && selectedItemAnnotations.length > 0 && (
                    <span className="text-xs text-gray-500">
                      {selectedItemAnnotations.length} аннотаций
                    </span>
                  )}
                </div>
                {/* Show annotations for selected item */}
                {selectedItemId && selectedItemAnnotations.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedItemAnnotations.map((ann) => (
                      <div
                        key={ann.id}
                        className="text-xs px-2 py-1 rounded"
                        style={{ 
                          backgroundColor: ITEM_TYPE_COLORS[ann.itemType] + '20',
                          color: ITEM_TYPE_COLORS[ann.itemType],
                          border: `1px solid ${ITEM_TYPE_COLORS[ann.itemType]}`
                        }}
                      >
                        {ann.itemLabel || `#${ann.id}`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <BBoxCanvas
                  imageUrl={getImageUrl(image.storage_path)}
                  imageWidth={image.width}
                  imageHeight={image.height}
                  annotations={imageAnnotations}
                  selectedAnnotationId={selectedAnnotationId}
                  highlightedItemId={selectedItemId}
                  mode={mode}
                  onAnnotationCreate={(bbox) => onAnnotationCreate(image.id, bbox)}
                  onAnnotationUpdate={onAnnotationUpdate}
                  onAnnotationSelect={handleAnnotationSelect}
                />
              </div>
            </div>
          )
        })}
    </div>
  )
}

