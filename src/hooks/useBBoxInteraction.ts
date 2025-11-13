'use client'

import { useState, useCallback, useRef } from 'react'
import { Annotation } from '@/types/annotations'

interface BBox {
  bbox_x1: number
  bbox_y1: number
  bbox_x2: number
  bbox_y2: number
}

export interface UseBBoxInteractionReturn {
  draggedAnnotation: number | null
  resizeHandle: string | null
  tempBBox: { id: number; bbox: BBox } | null
  
  startDrag: (annotationId: number, mouseX: number, mouseY: number, annotation: Annotation) => void
  startResize: (annotationId: number, handle: string, mouseX: number, mouseY: number, annotation: Annotation) => void
  handleMove: (mouseX: number, mouseY: number, scale: { x: number; y: number }) => void
  endInteraction: (onUpdate?: (id: number, updates: Partial<BBox>) => void) => void
  cancelInteraction: () => void
}

export function useBBoxInteraction(): UseBBoxInteractionReturn {
  const [draggedAnnotation, setDraggedAnnotation] = useState<number | null>(null)
  const [resizeHandle, setResizeHandle] = useState<string | null>(null)
  const [tempBBox, setTempBBox] = useState<{ id: number; bbox: BBox } | null>(null)
  
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const initialBBoxRef = useRef<BBox | null>(null)

  const startDrag = useCallback((
    annotationId: number,
    mouseX: number,
    mouseY: number,
    annotation: Annotation
  ) => {
    setDraggedAnnotation(annotationId)
    dragStartRef.current = { x: mouseX, y: mouseY }
    
    const bbox: BBox = {
      bbox_x1: annotation.bbox_x1,
      bbox_y1: annotation.bbox_y1,
      bbox_x2: annotation.bbox_x2,
      bbox_y2: annotation.bbox_y2,
    }
    
    initialBBoxRef.current = bbox
    setTempBBox({ id: annotationId, bbox })
  }, [])

  const startResize = useCallback((
    annotationId: number,
    handle: string,
    mouseX: number,
    mouseY: number,
    annotation: Annotation
  ) => {
    setDraggedAnnotation(annotationId)
    setResizeHandle(handle)
    dragStartRef.current = { x: mouseX, y: mouseY }
    
    const bbox: BBox = {
      bbox_x1: annotation.bbox_x1,
      bbox_y1: annotation.bbox_y1,
      bbox_x2: annotation.bbox_x2,
      bbox_y2: annotation.bbox_y2,
    }
    
    initialBBoxRef.current = bbox
    setTempBBox({ id: annotationId, bbox })
  }, [])

  const handleMove = useCallback((
    mouseX: number,
    mouseY: number,
    scale: { x: number; y: number }
  ) => {
    if (!dragStartRef.current || !initialBBoxRef.current || draggedAnnotation === null) {
      return
    }

    const dx = (mouseX - dragStartRef.current.x) / scale.x
    const dy = (mouseY - dragStartRef.current.y) / scale.y

    const initial = initialBBoxRef.current

    if (resizeHandle) {
      // Resize
      const newBBox = { ...initial }

      switch (resizeHandle) {
        case 'tl': // top-left
          newBBox.bbox_x1 = initial.bbox_x1 + dx
          newBBox.bbox_y1 = initial.bbox_y1 + dy
          break
        case 'tr': // top-right
          newBBox.bbox_x2 = initial.bbox_x2 + dx
          newBBox.bbox_y1 = initial.bbox_y1 + dy
          break
        case 'bl': // bottom-left
          newBBox.bbox_x1 = initial.bbox_x1 + dx
          newBBox.bbox_y2 = initial.bbox_y2 + dy
          break
        case 'br': // bottom-right
          newBBox.bbox_x2 = initial.bbox_x2 + dx
          newBBox.bbox_y2 = initial.bbox_y2 + dy
          break
      }

      // Ensure min size
      const minSize = 0.02
      if (newBBox.bbox_x2 - newBBox.bbox_x1 < minSize) {
        if (resizeHandle.includes('l')) {
          newBBox.bbox_x1 = newBBox.bbox_x2 - minSize
        } else {
          newBBox.bbox_x2 = newBBox.bbox_x1 + minSize
        }
      }
      if (newBBox.bbox_y2 - newBBox.bbox_y1 < minSize) {
        if (resizeHandle.includes('t')) {
          newBBox.bbox_y1 = newBBox.bbox_y2 - minSize
        } else {
          newBBox.bbox_y2 = newBBox.bbox_y1 + minSize
        }
      }

      // Clamp to [0, 1]
      newBBox.bbox_x1 = Math.max(0, Math.min(1, newBBox.bbox_x1))
      newBBox.bbox_y1 = Math.max(0, Math.min(1, newBBox.bbox_y1))
      newBBox.bbox_x2 = Math.max(0, Math.min(1, newBBox.bbox_x2))
      newBBox.bbox_y2 = Math.max(0, Math.min(1, newBBox.bbox_y2))

      setTempBBox({ id: draggedAnnotation, bbox: newBBox })
    } else {
      // Drag (move)
      const width = initial.bbox_x2 - initial.bbox_x1
      const height = initial.bbox_y2 - initial.bbox_y1

      let newX1 = initial.bbox_x1 + dx
      let newY1 = initial.bbox_y1 + dy

      // Clamp to boundaries
      newX1 = Math.max(0, Math.min(1 - width, newX1))
      newY1 = Math.max(0, Math.min(1 - height, newY1))

      const newBBox = {
        bbox_x1: newX1,
        bbox_y1: newY1,
        bbox_x2: newX1 + width,
        bbox_y2: newY1 + height,
      }

      setTempBBox({ id: draggedAnnotation, bbox: newBBox })
    }
  }, [draggedAnnotation, resizeHandle])

  const endInteraction = useCallback((
    onUpdate?: (id: number, updates: Partial<BBox>) => void
  ) => {
    if (tempBBox && onUpdate) {
      onUpdate(tempBBox.id, tempBBox.bbox)
    }

    // Reset state
    setDraggedAnnotation(null)
    setResizeHandle(null)
    setTempBBox(null)
    dragStartRef.current = null
    initialBBoxRef.current = null
  }, [tempBBox])

  const cancelInteraction = useCallback(() => {
    setDraggedAnnotation(null)
    setResizeHandle(null)
    setTempBBox(null)
    dragStartRef.current = null
    initialBBoxRef.current = null
  }, [])

  return {
    draggedAnnotation,
    resizeHandle,
    tempBBox,
    startDrag,
    startResize,
    handleMove,
    endInteraction,
    cancelInteraction,
  }
}

