'use client'

import Image from 'next/image'
import { useRef, useEffect, useState, useCallback } from 'react'
import { Annotation } from '@/types/annotations'
import { objectColors } from '@/styles/design-tokens'

interface BBoxCanvasProps {
  imageUrl: string
  annotations: Annotation[]
  selectedAnnotationId: string | null
  highlightedDishIndex: number | null
  tempBBox: { id: string; bbox: { bbox_x1: number; bbox_y1: number; bbox_x2: number; bbox_y2: number } } | null
  drawingBBox: { x1: number; y1: number; x2: number; y2: number } | null
  showAllBBoxes: boolean
  
  onMouseDown: (e: React.MouseEvent, annotation?: Annotation) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseUp: (e: React.MouseEvent) => void
  onAnnotationClick: (annotation: Annotation) => void
  
  containerRef: React.RefObject<HTMLDivElement>
  onNaturalSizeChange: (size: { w: number; h: number }) => void
  onContainerSizeChange: (size: { w: number; h: number }) => void
}

export function BBoxCanvas({
  imageUrl,
  annotations,
  selectedAnnotationId,
  highlightedDishIndex,
  tempBBox,
  drawingBBox,
  showAllBBoxes,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onAnnotationClick,
  containerRef,
  onNaturalSizeChange,
  onContainerSizeChange,
}: BBoxCanvasProps) {
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null)

  // Measure container size
  const measureContainer = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const newSize = { w: width, h: height }
    setContainerSize(newSize)
    onContainerSizeChange(newSize)
  }, [containerRef, onContainerSizeChange])

  useEffect(() => {
    measureContainer()
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(measureContainer)
    observer.observe(el)

    window.addEventListener('resize', measureContainer)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measureContainer)
    }
  }, [measureContainer])

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const size = { w: img.naturalWidth, h: img.naturalHeight }
    setNaturalSize(size)
    onNaturalSizeChange(size)
  }

  // Calculate scale from natural to container
  const scale = naturalSize && containerSize
    ? {
        x: containerSize.w / naturalSize.w,
        y: containerSize.h / naturalSize.h,
      }
    : null

  // Filter visible annotations
  const visibleAnnotations = showAllBBoxes 
    ? annotations.filter(a => !a.is_deleted)
    : annotations.filter(a => !a.is_deleted && a.id === selectedAnnotationId)

  // Get bbox to display (temp or original)
  const getBBox = (annotation: Annotation) => {
    if (tempBBox && tempBBox.id === annotation.id) {
      return tempBBox.bbox
    }
    return {
      bbox_x1: annotation.bbox_x1,
      bbox_y1: annotation.bbox_y1,
      bbox_x2: annotation.bbox_x2,
      bbox_y2: annotation.bbox_y2,
    }
  }

  // Get bbox color
  const getBBoxColor = (annotation: Annotation) => {
    const type = annotation.object_type
    return objectColors[type as keyof typeof objectColors] || objectColors.nonfood
  }

  // Check if annotation is highlighted
  const isHighlighted = (annotation: Annotation) => {
    if (highlightedDishIndex !== null && annotation.object_type === 'dish') {
      return annotation.dish_index === highlightedDishIndex
    }
    return false
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-gray-100 rounded-lg"
      onMouseDown={(e) => {
        // Check if clicked on annotation
        if (!naturalSize || !scale) return
        
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        
        const x = (e.clientX - rect.left) / scale.x
        const y = (e.clientY - rect.top) / scale.y
        
        // Find clicked annotation (from top to bottom)
        const clickedAnnotation = [...visibleAnnotations].reverse().find(ann => {
          const bbox = getBBox(ann)
          const x1 = bbox.bbox_x1 * naturalSize.w
          const y1 = bbox.bbox_y1 * naturalSize.h
          const x2 = bbox.bbox_x2 * naturalSize.w
          const y2 = bbox.bbox_y2 * naturalSize.h
          
          return x >= x1 && x <= x2 && y >= y1 && y <= y2
        })
        
        onMouseDown(e, clickedAnnotation)
      }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {/* Image */}
      <Image
        src={imageUrl}
        alt="Annotation"
        fill
        className="object-contain"
        onLoad={handleImageLoad}
        draggable={false}
      />

      {/* BBoxes SVG Overlay */}
      {naturalSize && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Draw annotations */}
          {visibleAnnotations.map(annotation => {
            const bbox = getBBox(annotation)
            const x1 = bbox.bbox_x1 * naturalSize.w
            const y1 = bbox.bbox_y1 * naturalSize.h
            const width = (bbox.bbox_x2 - bbox.bbox_x1) * naturalSize.w
            const height = (bbox.bbox_y2 - bbox.bbox_y1) * naturalSize.h

            const isSelected = annotation.id === selectedAnnotationId
            const highlighted = isHighlighted(annotation)
            const color = getBBoxColor(annotation)

            return (
              <g key={annotation.id}>
                {/* BBox rectangle */}
                <rect
                  x={x1}
                  y={y1}
                  width={width}
                  height={height}
                  fill="none"
                  stroke={color}
                  strokeWidth={isSelected ? 3 : highlighted ? 2 : 1.5}
                  opacity={isSelected ? 1 : highlighted ? 0.9 : 0.7}
                  className="pointer-events-auto cursor-pointer"
                  onClick={() => onAnnotationClick(annotation)}
                />

                {/* Resize handles (only for selected) */}
                {isSelected && (
                  <>
                    <circle cx={x1} cy={y1} r={6} fill={color} className="pointer-events-auto cursor-nwse-resize" />
                    <circle cx={x1 + width} cy={y1} r={6} fill={color} className="pointer-events-auto cursor-nesw-resize" />
                    <circle cx={x1} cy={y1 + height} r={6} fill={color} className="pointer-events-auto cursor-nesw-resize" />
                    <circle cx={x1 + width} cy={y1 + height} r={6} fill={color} className="pointer-events-auto cursor-nwse-resize" />
                  </>
                )}
              </g>
            )
          })}

          {/* Drawing bbox */}
          {drawingBBox && (
            <rect
              x={drawingBBox.x1}
              y={drawingBBox.y1}
              width={drawingBBox.x2 - drawingBBox.x1}
              height={drawingBBox.y2 - drawingBBox.y1}
              fill="none"
              stroke="#3B82F6"
              strokeWidth={2}
              strokeDasharray="4 4"
              opacity={0.8}
            />
          )}
        </svg>
      )}
    </div>
  )
}

