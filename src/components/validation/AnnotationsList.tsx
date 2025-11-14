'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import type { AnnotationView, TrayItem } from '@/types/domain'
import { ITEM_TYPE_LABELS, ITEM_TYPE_COLORS } from '@/types/domain'
import { cn } from '@/lib/utils'

interface AnnotationsListProps {
  annotations: AnnotationView[]
  items: TrayItem[]
  imageId: number
  selectedAnnotationId: number | null
  onAnnotationSelect: (id: number) => void
  onAnnotationDelete: (id: number) => void
}

export function AnnotationsList({
  annotations,
  items,
  imageId,
  selectedAnnotationId,
  onAnnotationSelect,
  onAnnotationDelete,
}: AnnotationsListProps) {
  // Filter annotations for this image
  const imageAnnotations = annotations.filter((ann) => ann.image_id === imageId)

  // Group annotations by item
  const annotationsByItem = imageAnnotations.reduce(
    (acc, ann) => {
      if (!acc[ann.tray_item_id]) {
        acc[ann.tray_item_id] = []
      }
      acc[ann.tray_item_id].push(ann)
      return acc
    },
    {} as Record<number, AnnotationView[]>
  )

  // Get item label
  const getItemLabel = (item: TrayItem): string => {
    if (item.menu_item_external_id) {
      return item.menu_item_external_id
    }
    if (item.metadata?.name) {
      return String(item.metadata.name)
    }
    if (item.metadata?.color) {
      return `${ITEM_TYPE_LABELS[item.item_type]} (${item.metadata.color})`
    }
    return ITEM_TYPE_LABELS[item.item_type]
  }

  // Format bbox for display
  const formatBBox = (bbox: { x: number; y: number; w: number; h: number }) => {
    return `[${Math.round(bbox.x)}, ${Math.round(bbox.y)}, ${Math.round(bbox.w)}, ${Math.round(bbox.h)}]`
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-none p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Annotations</h2>
        <p className="text-sm text-gray-500">{imageAnnotations.length} annotations</p>
      </div>

      {/* Annotations list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {Object.keys(annotationsByItem).length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">Нет annotations</p>
          </div>
        ) : (
          Object.entries(annotationsByItem).map(([itemIdStr, anns]) => {
            const itemId = parseInt(itemIdStr, 10)
            const item = items.find((i) => i.id === itemId)
            if (!item) return null

            const color = ITEM_TYPE_COLORS[item.item_type]

            return (
              <div key={itemId} className="space-y-2">
                {/* Item header */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-none"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm font-medium text-gray-900">
                    {getItemLabel(item)}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({ITEM_TYPE_LABELS[item.item_type]})
                  </span>
                </div>

                {/* Annotations for this item */}
                <div className="ml-5 space-y-1">
                  {anns.map((ann) => {
                    const isSelected = ann.id === selectedAnnotationId

                    return (
                      <Card
                        key={ann.id}
                        className={cn(
                          'p-2 cursor-pointer transition-all hover:shadow-md',
                          isSelected && 'ring-2 ring-blue-500 bg-blue-50'
                        )}
                        onClick={() => onAnnotationSelect(ann.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-mono text-gray-600">
                              {formatBBox(ann.bbox)}
                            </div>
                            {ann.is_modified && (
                              <div className="text-xs text-blue-600 mt-1">изменено</div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="flex-none h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              onAnnotationDelete(ann.id)
                            }}
                          >
                            <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-600" />
                          </Button>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

