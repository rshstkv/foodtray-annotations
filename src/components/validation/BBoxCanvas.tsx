'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import type { BBox, ItemType } from '@/types/domain'
import { ITEM_TYPE_COLORS } from '@/types/domain'

interface BBoxData {
  id: number
  bbox: BBox
  itemType: ItemType
  itemId: number
  itemLabel?: string
}

interface BBoxCanvasProps {
  imageUrl: string
  annotations: BBoxData[]
  selectedAnnotationId: number | null
  highlightedItemId: number | null
  mode: 'view' | 'draw' | 'edit'
  onAnnotationCreate?: (bbox: BBox) => void
  onAnnotationUpdate?: (id: number, bbox: BBox) => void
  onAnnotationSelect?: (id: number | null) => void
}

interface Point {
  x: number
  y: number
}

/**
 * BBoxCanvas - компонент для рисования и редактирования bbox
 * Без тулбара, минималистичный дизайн
 */
export function BBoxCanvas({
  imageUrl,
  annotations,
  selectedAnnotationId,
  highlightedItemId,
  mode,
  onAnnotationCreate,
  onAnnotationUpdate,
  onAnnotationSelect,
}: BBoxCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [displayedImageSize, setDisplayedImageSize] = useState({ width: 0, height: 0, offsetX: 0, offsetY: 0 })

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState<Point | null>(null)
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null)

  // Editing state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [editingAnnotation, setEditingAnnotation] = useState<BBoxData | null>(null)

  // Calculate displayed image size (after object-contain scaling)
  const calculateDisplayedSize = useCallback(() => {
    if (!imageDimensions.width || !imageDimensions.height || !containerSize.width || !containerSize.height) {
      return { width: 0, height: 0, offsetX: 0, offsetY: 0 }
    }

    const imageAspect = imageDimensions.width / imageDimensions.height
    const containerAspect = containerSize.width / containerSize.height

    let displayWidth, displayHeight, offsetX = 0, offsetY = 0

    if (imageAspect > containerAspect) {
      // Image is wider - fit to width
      displayWidth = containerSize.width
      displayHeight = containerSize.width / imageAspect
      offsetY = (containerSize.height - displayHeight) / 2
    } else {
      // Image is taller - fit to height
      displayHeight = containerSize.height
      displayWidth = containerSize.height * imageAspect
      offsetX = (containerSize.width - displayWidth) / 2
    }

    return { width: displayWidth, height: displayHeight, offsetX, offsetY }
  }, [imageDimensions, containerSize])

  // Scale factor for converting canvas coordinates to bbox coordinates
  const getScale = useCallback(() => {
    const displayed = calculateDisplayedSize()
    if (!imageDimensions.width || !displayed.width) return { x: 1, y: 1 }
    return {
      x: imageDimensions.width / displayed.width,
      y: imageDimensions.height / displayed.height,
    }
  }, [imageDimensions, calculateDisplayedSize])

  // Update container size on resize
  useEffect(() => {
    if (!containerRef.current) return

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setContainerSize({ width: rect.width, height: rect.height })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Update displayed image size when dimensions change
  useEffect(() => {
    const displayed = calculateDisplayedSize()
    setDisplayedImageSize(displayed)
  }, [calculateDisplayedSize])

  // Handle image load
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
    setImageLoaded(true)
  }, [])

  // Convert canvas coordinates to bbox coordinates
  const canvasToBBox = useCallback(
    (canvasX: number, canvasY: number): Point => {
      const scale = getScale()
      return {
        x: (canvasX - displayedImageSize.offsetX) * scale.x,
        y: (canvasY - displayedImageSize.offsetY) * scale.y,
      }
    },
    [getScale, displayedImageSize]
  )

  // Convert bbox coordinates to canvas coordinates
  const bboxToCanvas = useCallback(
    (bboxX: number, bboxY: number): Point => {
      const scale = getScale()
      return {
        x: bboxX / scale.x + displayedImageSize.offsetX,
        y: bboxY / scale.y + displayedImageSize.offsetY,
      }
    },
    [getScale, displayedImageSize]
  )

  // Get mouse position relative to canvas (adjusted for image offset)
  const getMousePos = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Point => {
      if (!canvasRef.current) return { x: 0, y: 0 }
      const rect = canvasRef.current.getBoundingClientRect()
      return {
        x: e.clientX - rect.left - displayedImageSize.offsetX,
        y: e.clientY - rect.top - displayedImageSize.offsetY,
      }
    },
    [displayedImageSize]
  )

  // Draw all annotations
  const drawAnnotations = useCallback(() => {
    if (!canvasRef.current || !imageLoaded) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw existing annotations (only for highlighted item)
    annotations.forEach((ann) => {
      // Show only annotations for highlighted item
      if (highlightedItemId !== null && ann.itemId !== highlightedItemId) {
        return
      }

      const { x, y, w, h } = ann.bbox
      const canvasPos = bboxToCanvas(x, y)
      const canvasSize = {
        w: w / getScale().x,
        h: h / getScale().y,
      }

      const color = ITEM_TYPE_COLORS[ann.itemType] || '#6B7280'
      const isSelected = ann.id === selectedAnnotationId
      const isHighlighted = ann.itemId === highlightedItemId

      ctx.strokeStyle = color
      ctx.lineWidth = isSelected ? 3 : isHighlighted ? 2 : 1
      ctx.setLineDash(isHighlighted && !isSelected ? [5, 5] : [])

      ctx.strokeRect(canvasPos.x, canvasPos.y, canvasSize.w, canvasSize.h)

      // Fill with semi-transparent color
      ctx.fillStyle = color + '20'
      ctx.fillRect(canvasPos.x, canvasPos.y, canvasSize.w, canvasSize.h)

      ctx.setLineDash([])
    })

    // Draw current drawing bbox
    if (isDrawing && startPoint && currentPoint) {
      const x = Math.min(startPoint.x, currentPoint.x)
      const y = Math.min(startPoint.y, currentPoint.y)
      const w = Math.abs(currentPoint.x - startPoint.x)
      const h = Math.abs(currentPoint.y - startPoint.y)

      ctx.strokeStyle = '#3B82F6'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.strokeRect(x, y, w, h)
      ctx.fillStyle = '#3B82F620'
      ctx.fillRect(x, y, w, h)
      ctx.setLineDash([])
    }
  }, [
    annotations,
    selectedAnnotationId,
    highlightedItemId,
    isDrawing,
    startPoint,
    currentPoint,
    imageLoaded,
    bboxToCanvas,
    getScale,
  ])

  // Redraw on changes
  useEffect(() => {
    drawAnnotations()
  }, [drawAnnotations])

  // Mouse down
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getMousePos(e)

      if (mode === 'draw') {
        setIsDrawing(true)
        setStartPoint(pos)
        setCurrentPoint(pos)
      } else if (mode === 'edit') {
        // Find annotation at this position
        const scale = getScale()
        const clicked = annotations.find((ann) => {
          const { x, y, w, h } = ann.bbox
          const canvasPos = bboxToCanvas(x, y)
          const canvasSize = { w: w / scale.x, h: h / scale.y }
          return (
            pos.x >= canvasPos.x &&
            pos.x <= canvasPos.x + canvasSize.w &&
            pos.y >= canvasPos.y &&
            pos.y <= canvasPos.y + canvasSize.h
          )
        })

        if (clicked) {
          onAnnotationSelect?.(clicked.id)
          setIsDragging(true)
          setDragStart(pos)
          setEditingAnnotation(clicked)
        } else {
          onAnnotationSelect?.(null)
        }
      }
    },
    [mode, annotations, getMousePos, getScale, bboxToCanvas, onAnnotationSelect]
  )

  // Mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getMousePos(e)

      if (isDrawing) {
        setCurrentPoint(pos)
      } else if (isDragging && dragStart && editingAnnotation) {
        const dx = pos.x - dragStart.x
        const dy = pos.y - dragStart.y

        const scale = getScale()
        const bboxDx = dx * scale.x
        const bboxDy = dy * scale.y

        const newBbox: BBox = {
          x: editingAnnotation.bbox.x + bboxDx,
          y: editingAnnotation.bbox.y + bboxDy,
          w: editingAnnotation.bbox.w,
          h: editingAnnotation.bbox.h,
        }

        onAnnotationUpdate?.(editingAnnotation.id, newBbox)
        setDragStart(pos)
      }
    },
    [
      isDrawing,
      isDragging,
      dragStart,
      editingAnnotation,
      getMousePos,
      getScale,
      onAnnotationUpdate,
    ]
  )

  // Mouse up
  const handleMouseUp = useCallback(() => {
    if (isDrawing && startPoint && currentPoint) {
      const x = Math.min(startPoint.x, currentPoint.x)
      const y = Math.min(startPoint.y, currentPoint.y)
      const w = Math.abs(currentPoint.x - startPoint.x)
      const h = Math.abs(currentPoint.y - startPoint.y)

      // Only create if bbox has minimum size
      if (w > 10 && h > 10) {
        const bboxStart = canvasToBBox(x, y)
        const bboxEnd = canvasToBBox(x + w, y + h)
        const bbox: BBox = {
          x: bboxStart.x,
          y: bboxStart.y,
          w: bboxEnd.x - bboxStart.x,
          h: bboxEnd.y - bboxStart.y,
        }
        onAnnotationCreate?.(bbox)
      }

      setIsDrawing(false)
      setStartPoint(null)
      setCurrentPoint(null)
    }

    if (isDragging) {
      setIsDragging(false)
      setDragStart(null)
      setEditingAnnotation(null)
    }
  }, [
    isDrawing,
    isDragging,
    startPoint,
    currentPoint,
    canvasToBBox,
    onAnnotationCreate,
  ])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDrawing(false)
        setStartPoint(null)
        setCurrentPoint(null)
        onAnnotationSelect?.(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onAnnotationSelect])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden"
    >
      {/* Image */}
      <Image
        ref={imageRef}
        src={imageUrl}
        alt="Recognition"
        fill
        className="object-contain"
        onLoad={handleImageLoad}
        priority
      />

      {/* Canvas overlay */}
      {imageLoaded && (
        <canvas
          ref={canvasRef}
          width={containerSize.width}
          height={containerSize.height}
          className="absolute inset-0 cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      )}

      {/* Mode indicator */}
      <div className="absolute top-4 left-4 bg-white px-3 py-1 rounded-md shadow-lg text-sm font-medium">
        {mode === 'draw' && 'Режим рисования'}
        {mode === 'edit' && 'Режим редактирования'}
        {mode === 'view' && 'Просмотр'}
      </div>
    </div>
  )
}

