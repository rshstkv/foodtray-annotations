'use client'

import { useState, useCallback } from 'react'

interface Point {
  x: number
  y: number
}

interface DrawingBBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface UseBBoxDrawingReturn {
  isDrawing: boolean
  drawStart: Point | null
  drawCurrent: Point | null
  drawingBBox: DrawingBBox | null
  
  startDrawing: (x: number, y: number) => void
  updateDrawing: (x: number, y: number) => void
  finishDrawing: (onCreate?: (bbox: {
    bbox_x1: number
    bbox_y1: number
    bbox_x2: number
    bbox_y2: number
  }) => void, scale?: { x: number; y: number }, refWidth?: number, refHeight?: number) => void
  cancelDrawing: () => void
}

export function useBBoxDrawing(): UseBBoxDrawingReturn {
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState<Point | null>(null)
  const [drawCurrent, setDrawCurrent] = useState<Point | null>(null)

  const startDrawing = useCallback((x: number, y: number) => {
    setIsDrawing(true)
    setDrawStart({ x, y })
    setDrawCurrent({ x, y })
  }, [])

  const updateDrawing = useCallback((x: number, y: number) => {
    if (!isDrawing) return
    setDrawCurrent({ x, y })
  }, [isDrawing])

  const finishDrawing = useCallback((
    onCreate?: (bbox: {
      bbox_x1: number
      bbox_y1: number
      bbox_x2: number
      bbox_y2: number
    }) => void,
    scale = { x: 1, y: 1 },
    refWidth = 1810,
    refHeight = 1080
  ) => {
    if (!drawStart || !drawCurrent) {
      setIsDrawing(false)
      setDrawStart(null)
      setDrawCurrent(null)
      return
    }

    // Normalize coordinates to [0, 1] относительно reference dimensions
    const normalizedBBox = {
      bbox_x1: Math.min(drawStart.x, drawCurrent.x) / scale.x / refWidth,
      bbox_y1: Math.min(drawStart.y, drawCurrent.y) / scale.y / refHeight,
      bbox_x2: Math.max(drawStart.x, drawCurrent.x) / scale.x / refWidth,
      bbox_y2: Math.max(drawStart.y, drawCurrent.y) / scale.y / refHeight,
    }

    // Clamp to [0, 1]
    normalizedBBox.bbox_x1 = Math.max(0, Math.min(1, normalizedBBox.bbox_x1))
    normalizedBBox.bbox_y1 = Math.max(0, Math.min(1, normalizedBBox.bbox_y1))
    normalizedBBox.bbox_x2 = Math.max(0, Math.min(1, normalizedBBox.bbox_x2))
    normalizedBBox.bbox_y2 = Math.max(0, Math.min(1, normalizedBBox.bbox_y2))

    // Only create if bbox has minimum size
    const minSize = 0.01
    const width = normalizedBBox.bbox_x2 - normalizedBBox.bbox_x1
    const height = normalizedBBox.bbox_y2 - normalizedBBox.bbox_y1

    if (width >= minSize && height >= minSize && onCreate) {
      onCreate(normalizedBBox)
    }

    // Reset state
    setIsDrawing(false)
    setDrawStart(null)
    setDrawCurrent(null)
  }, [drawStart, drawCurrent])

  const cancelDrawing = useCallback(() => {
    setIsDrawing(false)
    setDrawStart(null)
    setDrawCurrent(null)
  }, [])

  // Calculate current drawing bbox for display
  const drawingBBox: DrawingBBox | null = 
    isDrawing && drawStart && drawCurrent
      ? {
          x1: Math.min(drawStart.x, drawCurrent.x),
          y1: Math.min(drawStart.y, drawCurrent.y),
          x2: Math.max(drawStart.x, drawCurrent.x),
          y2: Math.max(drawStart.y, drawCurrent.y),
        }
      : null

  return {
    isDrawing,
    drawStart,
    drawCurrent,
    drawingBBox,
    startDrawing,
    updateDrawing,
    finishDrawing,
    cancelDrawing,
  }
}

