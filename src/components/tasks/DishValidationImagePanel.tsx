/**
 * Image Panel компонент для Dish Validation
 * Отображает одно изображение (Main или Qualifying) с BBoxAnnotator
 */

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import dynamic from 'next/dynamic'
import type { Image, Annotation } from '@/types/annotations'

const BBoxAnnotator = dynamic(() => import('@/components/BBoxAnnotator'), { ssr: false })

interface DishValidationImagePanelProps {
  title: string
  image: Image | undefined
  expectedCount: number
  count: number
  isAligned: boolean
  showAllBBoxes: boolean
  selectedAnnotation: Annotation | null
  selectedBBoxIndexInDish: number
  activeImage: 'Main' | 'Qualifying'
  thisImageType: 'Main' | 'Qualifying'
  highlightedDishIndex: number | null
  drawingMode: boolean
  mode: 'quick_validation' | 'edit_mode'
  referenceWidth: number
  referenceHeight: number
  onImageClick: () => void
  onSetActiveImage: () => void
  onSetDrawingMode: (mode: boolean) => void
  onAnnotationCreate: (bbox: {
    bbox_x1: number
    bbox_y1: number
    bbox_x2: number
    bbox_y2: number
  }) => void
  onAnnotationUpdate: (id: number, updates: {
    bbox_x1?: number
    bbox_y1?: number
    bbox_x2?: number
    bbox_y2?: number
    is_overlapped?: boolean
    is_bottle_up?: boolean | null
    is_error?: boolean
  }) => void
  onAnnotationSelect: (annotation: Annotation | null) => void
  updateAnnotationLocally: (id: number, updates: Partial<Annotation>) => void
}

export function DishValidationImagePanel({
  title,
  image,
  expectedCount,
  count,
  isAligned,
  showAllBBoxes,
  selectedAnnotation,
  selectedBBoxIndexInDish,
  activeImage,
  thisImageType,
  highlightedDishIndex,
  drawingMode,
  mode,
  referenceWidth,
  referenceHeight,
  onImageClick,
  onSetActiveImage,
  onSetDrawingMode,
  onAnnotationCreate,
  onAnnotationUpdate,
  onAnnotationSelect,
  updateAnnotationLocally,
}: DishValidationImagePanelProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{title}</h3>
          {!showAllBBoxes && selectedAnnotation && selectedAnnotation.dish_index !== null && activeImage === thisImageType && image && (
            <Badge variant="outline" className="text-xs">
              bbox {selectedBBoxIndexInDish + 1} / {image.annotations.filter(ann => ann.dish_index === selectedAnnotation.dish_index).length || 0}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={
              count === expectedCount
                ? 'bg-green-500'
                : 'bg-red-500'
            }
          >
            {count} bbox
          </Badge>
          {!isAligned && (
            <Button
              size="sm"
              variant={
                activeImage === thisImageType && drawingMode
                  ? 'default'
                  : 'outline'
              }
              onClick={() => {
                onSetActiveImage()
                onSetDrawingMode(true)
              }}
            >
              Рисовать (D)
            </Button>
          )}
        </div>
      </div>
      <div
        className="h-[calc(100vh-320px)] rounded border relative bg-gray-100 cursor-pointer"
        onClick={onImageClick}
      >
        {image && (
          <BBoxAnnotator
            imageUrl={`/api/bbox-images/${image.storage_path}`}
            annotations={
              !showAllBBoxes && selectedAnnotation && selectedAnnotation.dish_index !== null
                ? image.annotations.filter(ann => 
                    ann.dish_index === selectedAnnotation.dish_index || 
                    ann.dish_index === null // Всегда показываем plate
                  )
                : image.annotations
            }
            originalAnnotations={image.original_annotations}
            imageId={image.id}
            highlightDishIndex={highlightedDishIndex}
            onAnnotationCreate={onAnnotationCreate}
            onAnnotationUpdate={onAnnotationUpdate}
            onAnnotationSelect={onAnnotationSelect}
            selectedAnnotation={selectedAnnotation}
            drawingMode={activeImage === thisImageType && drawingMode}
            readOnly={mode === 'quick_validation' && !selectedAnnotation}
            showControls={false}
            updateAnnotationLocally={updateAnnotationLocally}
            referenceWidth={referenceWidth}
            referenceHeight={referenceHeight}
            priority={true}
          />
        )}
      </div>
    </Card>
  )
}


