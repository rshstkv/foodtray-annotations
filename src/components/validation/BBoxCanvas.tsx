'use client'

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import type { BBox, ItemType } from '@/types/domain'
import { ITEM_TYPE_COLORS } from '@/types/domain'

interface BBoxData {
  id: number | string
  bbox: BBox
  itemType: ItemType
  itemId: number
  itemLabel?: string
  itemColor?: string
  isOccluded?: boolean
}

interface BBoxCanvasProps {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  annotations: BBoxData[]
  selectedAnnotationId: number | string | null
  highlightedItemId: number | null
  mode: 'view' | 'draw' | 'edit'
  canEdit?: boolean // false для BOTTLE_ORIENTATION_VALIDATION (read-only mode)
  onAnnotationCreate?: (bbox: BBox) => void
  onAnnotationUpdate?: (id: number | string, data: { bbox: BBox }) => void
  onAnnotationSelect?: (id: number | string | null) => void
  onAnnotationToggleOcclusion?: (id: number | string) => void
  onAnnotationDelete?: (id: number | string) => void
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
  imageWidth,
  imageHeight,
  annotations,
  selectedAnnotationId,
  highlightedItemId,
  mode,
  canEdit = true,
  onAnnotationCreate,
  onAnnotationUpdate,
  onAnnotationSelect,
  onAnnotationToggleOcclusion,
  onAnnotationDelete,
}: BBoxCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const [imageLoaded, setImageLoaded] = useState(false)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [displayedImageSize, setDisplayedImageSize] = useState({ width: 0, height: 0, offsetX: 0, offsetY: 0 })
  
  // Use provided original image dimensions instead of naturalWidth/Height
  const imageDimensions = useMemo(() => ({ width: imageWidth, height: imageHeight }), [imageWidth, imageHeight])

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState<Point | null>(null)
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null)

  // Editing state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [editingAnnotation, setEditingAnnotation] = useState<BBoxData | null>(null)
  
  // Resize state
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null)
  const [resizeStart, setResizeStart] = useState<{ pos: Point; bbox: BBox } | null>(null)
  
  // Временный bbox для плавного редактирования (сохраняется только на mouseUp)
  const [tempBBox, setTempBBox] = useState<{ id: number | string; bbox: BBox } | null>(null)
  
  // Hover state для изменения курсора
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<number | string | null>(null)
  const [hoveredHandle, setHoveredHandle] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null)

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

  // Coordinate conversion helpers
  const imageToCanvas = useCallback((params: { x: number; y: number; scale: { x: number; y: number }; containerSize: { width: number; height: number; offsetX: number; offsetY: number } }) => {
    const { x, y, scale, containerSize } = params
    return {
      x: x / scale.x + containerSize.offsetX,
      y: y / scale.y + containerSize.offsetY,
    }
  }, [])

  const canvasToImage = useCallback((x: number, y: number) => {
    const scale = getScale()
    const displayed = displayedImageSize
    return {
      x: (x - displayed.offsetX) * scale.x,
      y: (y - displayed.offsetY) * scale.y,
    }
  }, [getScale, displayedImageSize])

  const bboxToCanvas = useCallback((x: number, y: number) => {
    const scale = getScale()
    const displayed = displayedImageSize
    return {
      x: x / scale.x + displayed.offsetX,
      y: y / scale.y + displayed.offsetY,
    }
  }, [getScale, displayedImageSize])

  const canvasToBBox = useCallback((x: number, y: number) => {
    return canvasToImage(x, y)
  }, [canvasToImage])

  // Get mouse position relative to canvas
  const getMousePos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 }
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  // Check if mouse is over a resize handle
  const getResizeHandle = useCallback((pos: Point, ann: BBoxData): 'tl' | 'tr' | 'bl' | 'br' | null => {
    const scale = getScale()
    // Используем tempBBox если он есть
    const bbox = tempBBox?.id === ann.id ? tempBBox.bbox : ann.bbox
    const canvasPos = bboxToCanvas(bbox.x, bbox.y)
    const canvasWidth = bbox.w / scale.x
    const canvasHeight = bbox.h / scale.y
    const handleSize = 10
    const hitbox = handleSize + 5 // Немного увеличиваем область для удобства

    const corners = [
      { type: 'tl' as const, x: canvasPos.x, y: canvasPos.y },
      { type: 'tr' as const, x: canvasPos.x + canvasWidth, y: canvasPos.y },
      { type: 'bl' as const, x: canvasPos.x, y: canvasPos.y + canvasHeight },
      { type: 'br' as const, x: canvasPos.x + canvasWidth, y: canvasPos.y + canvasHeight },
    ]

    for (const corner of corners) {
      const dx = Math.abs(pos.x - corner.x)
      const dy = Math.abs(pos.y - corner.y)
      if (dx <= hitbox && dy <= hitbox) {
        return corner.type
      }
    }

    return null
  }, [getScale, bboxToCanvas, tempBBox])

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
    if (displayed.width > 0) {
      console.log('[BBoxCanvas] Displayed size:', displayed)
      console.log('[BBoxCanvas] Container size:', containerSize)
      console.log('[BBoxCanvas] Image dimensions:', imageDimensions)
      // Calculate scale directly instead of calling getScale to avoid circular dependency
      const scale = {
        x: imageDimensions.width / displayed.width,
        y: imageDimensions.height / displayed.height,
      }
      console.log('[BBoxCanvas] Scale:', scale)
    }
  }, [calculateDisplayedSize, containerSize, imageDimensions])

  // Handle image load
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true)
    console.log('[BBoxCanvas] Image loaded, using original dimensions:', imageDimensions)
  }, [imageDimensions])

  // УДАЛЕНЫ ДУБЛИКАТЫ: canvasToBBox, bboxToCanvas и getMousePos уже определены выше (строки 139, 130 и 144)

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

      // Используем tempBBox если он есть для этой аннотации
      const bbox = tempBBox?.id === ann.id ? tempBBox.bbox : ann.bbox
      const { x, y, w, h } = bbox
      const canvasPos = bboxToCanvas(x, y)
      const canvasSize = {
        w: w / getScale().x,
        h: h / getScale().y,
      }
      
      if (ann.itemId === highlightedItemId) {
        const scale = getScale()
        const displayedSize = displayedImageSize
        console.log('[BBoxCanvas] Drawing bbox for item', ann.itemId, { 
          original: { x, y, w, h },
          canvas: { x: canvasPos.x, y: canvasPos.y, w: canvasSize.w, h: canvasSize.h },
          imageDimensions,
          displayedSize,
          scale,
          containerSize
        })
      }

      const color = ann.itemColor || ITEM_TYPE_COLORS[ann.itemType] || '#6B7280'
      const isSelected = ann.id === selectedAnnotationId
      const isHighlighted = ann.itemId === highlightedItemId
      const isHovered = ann.id === hoveredAnnotationId
      const isOccluded = ann.isOccluded || false

      // Стиль границы - всегда solid яркие линии
      ctx.strokeStyle = isOccluded ? '#EF4444' : color
      // Толще для выбранной, средняя для наведенной
      ctx.lineWidth = isSelected ? 4 : isHovered ? 3.5 : 3
      
      // Пунктирная линия только для окклюзий
      if (isOccluded) {
        ctx.setLineDash([8, 4])
      } else {
        ctx.setLineDash([])  // Всегда solid для обычных
      }

      ctx.strokeRect(canvasPos.x, canvasPos.y, canvasSize.w, canvasSize.h)

      // Заливка с semi-transparent color
      if (isOccluded) {
        // Красная штриховка для окклюзий
        ctx.fillStyle = '#EF444430'
        ctx.fillRect(canvasPos.x, canvasPos.y, canvasSize.w, canvasSize.h)
        
        // Диагональная штриховка
        ctx.strokeStyle = '#EF444450'
        ctx.lineWidth = 1
        ctx.setLineDash([])
        const spacing = 8
        for (let i = 0; i < canvasSize.w + canvasSize.h; i += spacing) {
          ctx.beginPath()
          ctx.moveTo(canvasPos.x + i, canvasPos.y)
          ctx.lineTo(canvasPos.x, canvasPos.y + i)
          ctx.stroke()
        }
      } else {
        ctx.fillStyle = color + '20'
        ctx.fillRect(canvasPos.x, canvasPos.y, canvasSize.w, canvasSize.h)
      }

      ctx.setLineDash([])
    })

    // Рисуем ручки для выбранной аннотации - увеличенные и яркие
    const selectedAnn = annotations.find(a => a.id === selectedAnnotationId)
    if (selectedAnn && mode === 'edit') {
      const currentScale = getScale()
      const currentContainerSize = displayedImageSize
      
      // Используем tempBBox если он есть для выбранной аннотации
      const bbox = tempBBox?.id === selectedAnn.id ? tempBBox.bbox : selectedAnn.bbox
      
      const canvasPos = imageToCanvas({
        x: bbox.x,
        y: bbox.y,
        scale: currentScale,
        containerSize: currentContainerSize
      })
      // Для размеров просто делим на scale
      const canvasWidth = bbox.w / currentScale.x
      const canvasHeight = bbox.h / currentScale.y

      const handleSize = 10
      
      const corners = [
        { type: 'tl', x: canvasPos.x, y: canvasPos.y }, // top-left
        { type: 'tr', x: canvasPos.x + canvasWidth, y: canvasPos.y }, // top-right
        { type: 'bl', x: canvasPos.x, y: canvasPos.y + canvasHeight }, // bottom-left
        { type: 'br', x: canvasPos.x + canvasWidth, y: canvasPos.y + canvasHeight }, // bottom-right
      ]
      
      corners.forEach((corner) => {
        const x = corner.x - handleSize / 2
        const y = corner.y - handleSize / 2
        
        // Подсвечиваем наведенную ручку
        const isHovered = hoveredHandle === corner.type
        
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineWidth = 2
        ctx.fillStyle = isHovered ? '#2563EB' : '#3B82F6'
        
        ctx.fillRect(x, y, handleSize, handleSize)
        ctx.strokeRect(x, y, handleSize, handleSize)
      })
      
      ctx.setLineDash([])
    }

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
    hoveredAnnotationId,
    hoveredHandle,
    isDrawing,
    startPoint,
    currentPoint,
    imageLoaded,
    tempBBox,
    bboxToCanvas,
    getScale,
    imageToCanvas,
    displayedImageSize,
    mode,
  ])

  // Redraw on changes
  useEffect(() => {
    drawAnnotations()
  }, [drawAnnotations])

  // Mouse down
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getMousePos(e)

      // Для режима draw требуется canEdit
      if (mode === 'draw') {
        if (!canEdit) return
        setIsDrawing(true)
        setStartPoint(pos)
        setCurrentPoint(pos)
      } else if (mode === 'edit') {
        // Сначала проверяем, кликнули ли на ручку ресайза выбранной аннотации (только если canEdit)
        if (canEdit) {
          const selectedAnn = annotations.find(a => a.id === selectedAnnotationId)
          if (selectedAnn) {
            const handle = getResizeHandle(pos, selectedAnn)
            if (handle) {
              // Начинаем ресайз
              setIsResizing(true)
              setResizeHandle(handle)
              setResizeStart({ pos, bbox: { ...selectedAnn.bbox } })
              setEditingAnnotation(selectedAnn)
              return
            }
          }
        }

        // Затем проверяем, кликнули ли на какую-то аннотацию
        const scale = getScale()
        const clicked = annotations.find((ann) => {
          // Используем tempBBox если он есть
          const bbox = tempBBox?.id === ann.id ? tempBBox.bbox : ann.bbox
          const { x, y, w, h } = bbox
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
          // Клик по существующей аннотации - выбираем её
          onAnnotationSelect?.(clicked.id)
          
          // Начинаем перетаскивание только если canEdit
          if (canEdit) {
            setIsDragging(true)
            setDragStart(pos)
            setEditingAnnotation(clicked)
          }
        } else {
          // Клик по пустому месту - снимаем выделение
          onAnnotationSelect?.(null)
          
          // Создание новой аннотации только если canEdit
          if (canEdit) {
            setIsDrawing(true)
            setStartPoint(pos)
            setCurrentPoint(pos)
          }
        }
      }
    },
    [canEdit, mode, annotations, selectedAnnotationId, tempBBox, getMousePos, getScale, bboxToCanvas, getResizeHandle, onAnnotationSelect]
  )

  // Mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getMousePos(e)

      if (isDrawing) {
        setCurrentPoint(pos)
      } else if (isResizing && resizeStart && resizeHandle && editingAnnotation) {
        // Обработка ресайза - обновляем только локально
        const scale = getScale()
        const dx = (pos.x - resizeStart.pos.x) * scale.x
        const dy = (pos.y - resizeStart.pos.y) * scale.y

        const newBbox: BBox = { ...resizeStart.bbox }

        switch (resizeHandle) {
          case 'tl': // Top-left
            newBbox.x = resizeStart.bbox.x + dx
            newBbox.y = resizeStart.bbox.y + dy
            newBbox.w = resizeStart.bbox.w - dx
            newBbox.h = resizeStart.bbox.h - dy
            break
          case 'tr': // Top-right
            newBbox.y = resizeStart.bbox.y + dy
            newBbox.w = resizeStart.bbox.w + dx
            newBbox.h = resizeStart.bbox.h - dy
            break
          case 'bl': // Bottom-left
            newBbox.x = resizeStart.bbox.x + dx
            newBbox.w = resizeStart.bbox.w - dx
            newBbox.h = resizeStart.bbox.h + dy
            break
          case 'br': // Bottom-right
            newBbox.w = resizeStart.bbox.w + dx
            newBbox.h = resizeStart.bbox.h + dy
            break
        }

        // Проверяем минимальные размеры и обновляем локально
        if (newBbox.w > 10 && newBbox.h > 10) {
          setTempBBox({ id: editingAnnotation.id, bbox: newBbox })
        }
      } else if (isDragging && dragStart && editingAnnotation) {
        // Обработка перетаскивания - обновляем только локально
        // Используем tempBBox если есть, иначе текущую аннотацию
        const baseBbox = tempBBox?.id === editingAnnotation.id 
          ? tempBBox.bbox 
          : editingAnnotation.bbox

        const dx = pos.x - dragStart.x
        const dy = pos.y - dragStart.y

        const scale = getScale()
        const bboxDx = dx * scale.x
        const bboxDy = dy * scale.y

        const newBbox: BBox = {
          x: baseBbox.x + bboxDx,
          y: baseBbox.y + bboxDy,
          w: baseBbox.w,
          h: baseBbox.h,
        }

        setTempBBox({ id: editingAnnotation.id, bbox: newBbox })
        setDragStart(pos)
      } else if (mode === 'edit' && !isDrawing && !isDragging && !isResizing) {
        // Проверяем наведение на ручки ресайза выбранной аннотации
        const selectedAnn = annotations.find(a => a.id === selectedAnnotationId)
        if (selectedAnn) {
          const handle = getResizeHandle(pos, selectedAnn)
          if (handle) {
            setHoveredHandle(handle)
            // Устанавливаем курсор в зависимости от ручки
            if (canvasRef.current) {
              const cursorMap = {
                'tl': 'nwse-resize',
                'tr': 'nesw-resize',
                'bl': 'nesw-resize',
                'br': 'nwse-resize',
              }
              canvasRef.current.style.cursor = cursorMap[handle]
            }
            return
          }
        }
        setHoveredHandle(null)

        // Проверяем наведение на bbox для изменения курсора
        const scale = getScale()
        const hoveredAnn = annotations.find((ann) => {
          // Используем tempBBox если он есть
          const bbox = tempBBox?.id === ann.id ? tempBBox.bbox : ann.bbox
          const { x, y, w, h } = bbox
          const canvasPos = bboxToCanvas(x, y)
          const canvasSize = { w: w / scale.x, h: h / scale.y }
          return (
            pos.x >= canvasPos.x &&
            pos.x <= canvasPos.x + canvasSize.w &&
            pos.y >= canvasPos.y &&
            pos.y <= canvasPos.y + canvasSize.h
          )
        })

        if (hoveredAnn) {
          setHoveredAnnotationId(hoveredAnn.id)
          if (canvasRef.current) {
            canvasRef.current.style.cursor = 'move'
          }
        } else {
          setHoveredAnnotationId(null)
          if (canvasRef.current) {
            canvasRef.current.style.cursor = 'crosshair'
          }
        }
      }
    },
    [
      isDrawing,
      isDragging,
      isResizing,
      dragStart,
      resizeStart,
      resizeHandle,
      editingAnnotation,
      selectedAnnotationId,
      annotations,
      tempBBox,
      getMousePos,
      getScale,
      getResizeHandle,
      onAnnotationUpdate,
      mode,
      bboxToCanvas,
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

    // Сохраняем изменения в базу только после завершения перетаскивания/ресайза
    if ((isDragging || isResizing) && tempBBox) {
      onAnnotationUpdate?.(tempBBox.id, { bbox: tempBBox.bbox })
      setTempBBox(null)
    }

    if (isDragging) {
      setIsDragging(false)
      setDragStart(null)
      setEditingAnnotation(null)
    }

    if (isResizing) {
      setIsResizing(false)
      setResizeHandle(null)
      setResizeStart(null)
      setEditingAnnotation(null)
    }
  }, [
    isDrawing,
    isDragging,
    isResizing,
    startPoint,
    currentPoint,
    tempBBox,
    canvasToBBox,
    onAnnotationCreate,
    onAnnotationUpdate,
  ])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDrawing(false)
        setIsDragging(false)
        setIsResizing(false)
        setStartPoint(null)
        setCurrentPoint(null)
        setDragStart(null)
        setResizeStart(null)
        setResizeHandle(null)
        setEditingAnnotation(null)
        setTempBBox(null) // Отменяем временные изменения
        onAnnotationSelect?.(null)
      }
      
      // Delete или Backspace - удаление выбранной аннотации
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId && onAnnotationDelete) {
        e.preventDefault()
        onAnnotationDelete(selectedAnnotationId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onAnnotationSelect, onAnnotationDelete, selectedAnnotationId])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[400px] bg-gray-900 rounded-lg overflow-hidden"
    >
      {/* Image */}
      <Image
        ref={imageRef}
        src={imageUrl}
        alt="Recognition"
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
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
          onContextMenu={(e) => {
            e.preventDefault()
            // Найти аннотацию под курсором
            const pos = getMousePos(e as any)
            const scale = getScale()
            const clicked = annotations.find((ann) => {
              // Используем tempBBox если он есть
              const bbox = tempBBox?.id === ann.id ? tempBBox.bbox : ann.bbox
              const { x, y, w, h } = bbox
              const canvasPos = bboxToCanvas(x, y)
              const canvasSize = { w: w / scale.x, h: h / scale.y }
              return (
                pos.x >= canvasPos.x &&
                pos.x <= canvasPos.x + canvasSize.w &&
                pos.y >= canvasPos.y &&
                pos.y <= canvasPos.y + canvasSize.h
              )
            })
            if (clicked && onAnnotationToggleOcclusion) {
              onAnnotationToggleOcclusion(clicked.id)
            }
          }}
        />
      )}
    </div>
  )
}

