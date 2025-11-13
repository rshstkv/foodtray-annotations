'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { AnnotationControls } from './AnnotationControls'

interface Annotation {
  id: string | number
  image_id: string | number
  bbox_x1: number
  bbox_y1: number
  bbox_x2: number
  bbox_y2: number
  object_type: string
  object_subtype: string | null
  dish_index: number | null
  is_overlapped: boolean
  is_bottle_up: boolean | null
  is_error: boolean
  source: string
  qwen_detection_index?: number | null
  qwen_detection_type?: string | null
}

interface BBoxAnnotatorProps {
  imageUrl: string
  annotations: Annotation[]
  selectedDishIndex?: number | null
  highlightDishIndex?: number | null // NEW: для синхронной подсветки блюд на M+Q
  hoveredAnnotationId?: string | null // NEW: для hover подсветки
  dishNames?: Record<number, string>
  originalAnnotations?: {
    qwen_dishes_detections?: unknown[]
    qwen_plates_detections?: unknown[]
  } | null
  imageId?: number
  onAnnotationCreate?: (bbox: {
    bbox_x1: number
    bbox_y1: number
    bbox_x2: number
    bbox_y2: number
  }) => void
  onAnnotationUpdate?: (id: string | number, updates: {
    bbox_x1?: number
    bbox_y1?: number
    bbox_x2?: number
    bbox_y2?: number
    is_overlapped?: boolean
    is_bottle_up?: boolean | null
    is_error?: boolean
  }) => Promise<void> | void
  onAnnotationSelect?: (annotation: Annotation | null) => void
  selectedAnnotation?: Annotation | null
  onAnnotationHover?: (annotation: Annotation | null) => void // NEW: для hover событий
  drawingMode?: boolean
  readOnly?: boolean
  showControls?: boolean // NEW: показывать ли панель управления
  referenceWidth?: number
  referenceHeight?: number
  onChangeDish?: (annotationId: number, position: { x: number; y: number; width: number; bboxWidth: number }) => void
  onDelete?: () => void
  onToggleOverlapped?: (annotationId: number) => void
  onToggleOrientation?: (annotationId: number) => void
  onToggleError?: (id: string | number) => void
  updateAnnotationLocally?: (id: string | number, updates: Partial<Annotation>) => void // NEW: для оптимистичных обновлений
}

// Цвета для разных блюд
const DISH_COLORS = [
  '#22c55e', // green-500
  '#3b82f6', // blue-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#84cc16', // lime-500
]

export default function BBoxAnnotator({
  imageUrl,
  annotations,
  selectedDishIndex,
  highlightDishIndex,
  hoveredAnnotationId,
  dishNames = {},
  originalAnnotations: _originalAnnotations,
  imageId: _imageId,
  onAnnotationCreate,
  onAnnotationUpdate,
  onAnnotationSelect,
  selectedAnnotation,
  onAnnotationHover,
  drawingMode = false,
  readOnly = false,
  showControls = true,
  referenceWidth = 1810,
  referenceHeight = 1080,
  onChangeDish,
  onDelete,
  onToggleOverlapped: _onToggleOverlapped,
  onToggleOrientation: _onToggleOrientation,
  onToggleError,
  updateAnnotationLocally, // NEW: для оптимистичных обновлений
}: BBoxAnnotatorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null)
  
  // Состояние для drag & resize
  const [draggedAnnotation, setDraggedAnnotation] = useState<number | string | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [resizeHandle, setResizeHandle] = useState<string | null>(null) // 'tl', 'tr', 'bl', 'br'
  
  // Ref для хранения начальных координат bbox при старте drag/resize
  const initialBBoxRef = useRef<{bbox_x1: number, bbox_y1: number, bbox_x2: number, bbox_y2: number} | null>(null)
  // State для локального отображения во время драга
  const [tempBBox, setTempBBox] = useState<{id: number | string, bbox: {bbox_x1: number, bbox_y1: number, bbox_x2: number, bbox_y2: number}} | null>(null)

  // Debounce helper
  const debounce = <T extends (...args: any[]) => void>(fn: T, delay: number) => {
    let timeoutId: NodeJS.Timeout
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => fn(...args), delay)
    }
  }

  // Измерение контейнера
  const measureContainer = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setContainerSize((prev) =>
      prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }
    )
  }, [])

  useEffect(() => {
    measureContainer()
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(() => measureContainer())
    observer.observe(el)
    
    // Debounced window resize для стабилизации координат
    const debouncedResize = debounce(measureContainer, 100)
    window.addEventListener('resize', debouncedResize)
    window.addEventListener('orientationchange', measureContainer)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', debouncedResize)
      window.removeEventListener('orientationchange', measureContainer)
    }
  }, [measureContainer])

  // Вычисление метрик рендеринга
  const renderMetrics = useMemo(() => {
    if (!naturalSize || !containerSize) return null

    const scale = Math.min(containerSize.w / naturalSize.w, containerSize.h / naturalSize.h)
    const renderedWidth = naturalSize.w * scale
    const renderedHeight = naturalSize.h * scale

    return {
      scale,
      offsetX: (containerSize.w - renderedWidth) / 2,
      offsetY: (containerSize.h - renderedHeight) / 2,
    }
  }, [naturalSize, containerSize])

  // Конвертация координат из reference (БД) в screen (canvas)
  const refToScreen = useCallback(
    (x: number, y: number) => {
      if (!naturalSize || !renderMetrics) return { x: 0, y: 0 }

      // Координаты в БД нормализованы (0-1), конвертируем их напрямую в natural, затем в screen
      const naturalX = x * naturalSize.w
      const naturalY = y * naturalSize.h

      const screenX = renderMetrics.offsetX + naturalX * renderMetrics.scale
      const screenY = renderMetrics.offsetY + naturalY * renderMetrics.scale

      return { x: screenX, y: screenY }
    },
    [naturalSize, renderMetrics]
  )

  // Конвертация координат из screen (canvas) в normalized (БД: 0-1)
  const screenToRef = useCallback(
    (x: number, y: number) => {
      if (!naturalSize || !renderMetrics) return { x: 0, y: 0 }

      // Screen -> Natural -> Normalized
      const naturalX = (x - renderMetrics.offsetX) / renderMetrics.scale
      const naturalY = (y - renderMetrics.offsetY) / renderMetrics.scale

      // Нормализуем к 0-1
      const normalizedX = naturalX / naturalSize.w
      const normalizedY = naturalY / naturalSize.h

      return { x: normalizedX, y: normalizedY }
    },
    [naturalSize, renderMetrics]
  )

  // Обработка рисования нового bbox
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Предотвращаем дефолтное поведение браузера
      e.preventDefault()
      
      if (!drawingMode || readOnly || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      setIsDrawing(true)
      setDrawStart({ x, y })
      setDrawCurrent({ x, y })
    },
    [drawingMode, readOnly]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isDrawing && drawStart) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        setDrawCurrent({ x, y })
      } else if (draggedAnnotation !== null && dragStart && initialBBoxRef.current) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        const dx = x - dragStart.x
        const dy = y - dragStart.y

        const p1 = refToScreen(initialBBoxRef.current.bbox_x1, initialBBoxRef.current.bbox_y1)
        const p2 = refToScreen(initialBBoxRef.current.bbox_x2, initialBBoxRef.current.bbox_y2)

        let updates: { bbox_x1: number; bbox_y1: number; bbox_x2: number; bbox_y2: number }

        if (resizeHandle) {
          // Resize
          const newP1 = { ...p1 }
          const newP2 = { ...p2 }

          if (resizeHandle.includes('t')) newP1.y = p1.y + dy
          if (resizeHandle.includes('b')) newP2.y = p2.y + dy
          if (resizeHandle.includes('l')) newP1.x = p1.x + dx
          if (resizeHandle.includes('r')) newP2.x = p2.x + dx

          const ref1 = screenToRef(newP1.x, newP1.y)
          const ref2 = screenToRef(newP2.x, newP2.y)

          updates = {
            bbox_x1: Math.min(ref1.x, ref2.x),
            bbox_y1: Math.min(ref1.y, ref2.y),
            bbox_x2: Math.max(ref1.x, ref2.x),
            bbox_y2: Math.max(ref1.y, ref2.y),
          }
        } else {
          // Drag
          const newP1 = { x: p1.x + dx, y: p1.y + dy }
          const newP2 = { x: p2.x + dx, y: p2.y + dy }

          const ref1 = screenToRef(newP1.x, newP1.y)
          const ref2 = screenToRef(newP2.x, newP2.y)

          updates = {
            bbox_x1: ref1.x,
            bbox_y1: ref1.y,
            bbox_x2: ref2.x,
            bbox_y2: ref2.y,
          }
        }

        // Обновляем локальное состояние для отрисовки
        setTempBBox({ id: draggedAnnotation, bbox: updates })
      }
    },
    [isDrawing, drawStart, draggedAnnotation, dragStart, resizeHandle, refToScreen, screenToRef]
  )

  const handleMouseUp = useCallback(() => {
    if (isDrawing && drawStart && drawCurrent && !readOnly) {
      const minX = Math.min(drawStart.x, drawCurrent.x)
      const minY = Math.min(drawStart.y, drawCurrent.y)
      const maxX = Math.max(drawStart.x, drawCurrent.x)
      const maxY = Math.max(drawStart.y, drawCurrent.y)

      if (maxX - minX >= 10 && maxY - minY >= 10 && onAnnotationCreate) {
        const p1 = screenToRef(minX, minY)
        const p2 = screenToRef(maxX, maxY)

        onAnnotationCreate({
          bbox_x1: p1.x,
          bbox_y1: p1.y,
          bbox_x2: p2.x,
          bbox_y2: p2.y,
        })
      }

      setIsDrawing(false)
      setDrawStart(null)
      setDrawCurrent(null)
    }

    // Если было drag/resize - отправляем финальные координаты
    if (tempBBox && draggedAnnotation !== null && !readOnly && onAnnotationUpdate) {
      // Сохраняем временные координаты для отображения
      const finalBBox = tempBBox.bbox
      const annotationId = tempBBox.id
      
      console.log('[BBoxAnnotator] mouseUp - updating bbox:', annotationId, finalBBox)
      
      // ОПТИМИСТИЧНОЕ ОБНОВЛЕНИЕ: сначала обновляем локально
      if (updateAnnotationLocally) {
        console.log('[BBoxAnnotator] Calling updateAnnotationLocally')
        updateAnnotationLocally(annotationId, finalBBox)
      }
      
      // НЕ ОЧИЩАЕМ tempBBox сразу - оставляем на 100мс для плавности
      setTimeout(() => {
        setTempBBox(null)
      }, 100)
      
      // Затем отправляем на сервер (асинхронно, не блокируя UI)
      Promise.resolve(onAnnotationUpdate(annotationId, finalBBox)).catch((error) => {
        console.error('[BBoxAnnotator] Failed to update annotation:', error)
        // В случае ошибки можно откатить изменения или показать уведомление
      })
    } else {
      // Если не было drag/resize, просто очищаем tempBBox
      setTempBBox(null)
    }

    // Очищаем состояние drag
    setDraggedAnnotation(null)
    setDragStart(null)
    setResizeHandle(null)
    initialBBoxRef.current = null
  }, [isDrawing, drawStart, drawCurrent, readOnly, screenToRef, onAnnotationCreate, draggedAnnotation, onAnnotationUpdate, tempBBox, updateAnnotationLocally])

  // Цвет по номеру блюда или типу
  const getColor = (annotation: Annotation) => {
    // Ошибка - ярко-красный с предупреждением
    if (annotation.is_error) {
      return '#dc2626' // red-600
    }

    // Перекрытие - оранжевый
    if (annotation.is_overlapped) {
      return '#f97316' // orange-500
    }

    // Если есть dish_index, используем цвет по индексу
    if (annotation.dish_index !== null) {
      return DISH_COLORS[annotation.dish_index % DISH_COLORS.length]
    }

    // Fallback на типы объектов
    switch (annotation.object_type) {
      case 'plate': return '#eab308' // yellow-500
      case 'buzzer':
        switch (annotation.object_subtype) {
          case 'red': return '#ef4444'    // red-500
          case 'green': return '#22c55e'  // green-500
          case 'blue': return '#3b82f6'   // blue-500
          case 'yellow': return '#eab308' // yellow-500
          case 'black': return '#1f2937'  // gray-800
          case 'white': return '#f3f4f6'  // gray-100
          default: return '#8b5cf6'       // purple-500
        }
      case 'non_food': return '#a855f7' // purple-500 для non-food
      case 'tray': return '#6b7280'
      default: return '#6b7280'
    }
  }

  // Получить название для аннотации
  const getAnnotationLabel = (annotation: Annotation) => {
    const parts: string[] = []

    // Маркер ошибки
    if (annotation.is_error) {
      parts.push('⚠️ ОШИБКА')
      return parts.join(' ')
    }

    // Non-food объекты
    if (annotation.object_type === 'non_food') {
      const nonFoodNames: Record<string, string> = {
        hand: '✋ Рука',
        phone: '📱 Телефон',
        wallet: '👛 Кошелек',
        cards: '💳 Карты',
        cutlery: '🍴 Приборы',
        other: '📦 Другое'
      }
      const name = annotation.object_subtype ? nonFoodNames[annotation.object_subtype] : '📦 Non-food'
      parts.push(name || '📦 Non-food')
      return parts.join(' ')
    }

    // Блюда
    if (annotation.dish_index !== null) {
      parts.push(`#${annotation.dish_index + 1}`)
      const dishName = dishNames[annotation.dish_index]
      if (dishName) {
        parts.push(dishName)
      }
    } else {
      parts.push(annotation.object_type)
    }

    // Маркер перекрытия
    if (annotation.is_overlapped) {
      parts.push('⚠️')
    }

    return parts.join(' ')
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-gray-100 overflow-hidden rounded"
      style={{ minHeight: '400px', cursor: drawingMode ? 'crosshair' : 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        if (isDrawing) {
          setIsDrawing(false)
          setDrawStart(null)
          setDrawCurrent(null)
        }
        if (draggedAnnotation !== null) {
          setDraggedAnnotation(null)
          setDragStart(null)
          setResizeHandle(null)
        }
      }}
    >
      {/* Изображение */}
      <Image
        src={imageUrl}
        alt="Annotation target"
        fill
        sizes="(max-width: 768px) 100vw, 80vw"
        className="object-contain pointer-events-none select-none"
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget as HTMLImageElement
          setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
          requestAnimationFrame(measureContainer)
        }}
      />

      {/* Существующие аннотации */}
      {renderMetrics &&
        annotations.map((annotation) => {
          // Используем временные координаты если bbox сейчас перетаскивается
          const coords = (tempBBox && tempBBox.id === annotation.id && tempBBox.bbox) 
            ? tempBBox.bbox 
            : annotation
          const p1 = refToScreen(coords.bbox_x1, coords.bbox_y1)
          const p2 = refToScreen(coords.bbox_x2, coords.bbox_y2)

          // Bbox считается выбранным если:
          // Выделен только если это конкретный bbox по id (для правильной работы стрелок)
          const isSelected = selectedAnnotation?.id === annotation.id
          // Подсвечен если это блюдо выбрано в sidebar (highlightDishIndex)
          const isHighlighted = highlightDishIndex !== null && 
                                annotation.object_type === 'dish' && 
                                annotation.dish_index === highlightDishIndex
          // Hovered если наведение из списка
          const isHovered = hoveredAnnotationId !== null && annotation.id === hoveredAnnotationId
          const color = getColor(annotation)
          const isPending = annotation.id === -1

          // Красная рамка для выделенного bbox, желтая для highlighted блюда, светло-желтая для hover
          const borderColor = isSelected 
            ? '#dc2626'  // Ярко-красный для выделенного (редактируемого)
            : isHighlighted
            ? '#eab308'  // Желтая для подсвеченного блюда из sidebar
            : isHovered
            ? '#fbbf24'  // Светло-желтая для hover
            : (isPending ? '#666' : annotation.is_error ? '#dc2626' : color)
          const borderWidth = isSelected ? 7 : (isHighlighted || isHovered) ? 4 : 2
          const borderStyle = isPending ? 'dashed' : 'solid'
          
          // Паттерн для перекрытых объектов
          const getBackgroundPattern = () => {
            if (annotation.is_overlapped) {
              // Диагональные полосы для перекрытых объектов
              return `repeating-linear-gradient(
                45deg,
                rgba(249, 115, 22, 0.15),
                rgba(249, 115, 22, 0.15) 10px,
                transparent 10px,
                transparent 20px
              )`
            }
            if (isSelected) {
              return 'rgba(239, 68, 68, 0.15)'
            }
            if (isHighlighted) {
              return 'rgba(234, 179, 8, 0.1)'  // Желтая полупрозрачная заливка для highlighted
            }
            if (isHovered) {
              return 'rgba(251, 191, 36, 0.08)'  // Светло-желтая для hover
            }
            if (isPending) {
              return 'rgba(102, 102, 102, 0.1)'
            }
            return 'transparent'
          }

          return (
            <div
              key={annotation.id}
              style={{
                position: 'absolute',
                left: p1.x,
                top: p1.y,
                width: p2.x - p1.x,
                height: p2.y - p1.y,
                border: `${borderWidth}px ${borderStyle} ${borderColor}`,
                background: getBackgroundPattern(),
                boxSizing: 'border-box',
                cursor: drawingMode ? 'not-allowed' : (isPending ? 'default' : (isSelected ? 'move' : 'pointer')),
                pointerEvents: isPending ? 'none' : (drawingMode ? 'none' : 'auto'),
                zIndex: isSelected ? 10 : 1,
              }}
              onMouseEnter={() => {
                if (!drawingMode && !readOnly && onAnnotationHover) {
                  onAnnotationHover(annotation)
                }
              }}
              onMouseLeave={() => {
                if (!drawingMode && !readOnly && onAnnotationHover) {
                  onAnnotationHover(null)
                }
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (!drawingMode && !readOnly && onAnnotationSelect) {
                  // Находим все bbox под этим кликом
                  const rect = containerRef.current?.getBoundingClientRect()
                  if (!rect) return
                  const clickX = e.clientX - rect.left
                  const clickY = e.clientY - rect.top

                  const overlappingAnnotations = annotations.filter(ann => {
                    const p1 = refToScreen(ann.bbox_x1, ann.bbox_y1)
                    const p2 = refToScreen(ann.bbox_x2, ann.bbox_y2)
                    return clickX >= p1.x && clickX <= p2.x && clickY >= p1.y && clickY <= p2.y
                  })

                  // Если несколько перекрывающихся - цикл через них
                  if (overlappingAnnotations.length > 1 && selectedAnnotation) {
                    const currentIndex = overlappingAnnotations.findIndex(a => a.id === selectedAnnotation.id)
                    if (currentIndex !== -1) {
                      // Выбираем следующий (или первый если это был последний)
                      const nextIndex = (currentIndex + 1) % overlappingAnnotations.length
                      onAnnotationSelect(overlappingAnnotations[nextIndex])
                      return
                    }
                  }

                  onAnnotationSelect(annotation)
                }
              }}
              onMouseDown={(e) => {
                if (!drawingMode && !readOnly && isSelected) {
                  e.stopPropagation()
                  const rect = containerRef.current?.getBoundingClientRect()
                  if (!rect) return
                  setDraggedAnnotation(annotation.id)
                  initialBBoxRef.current = {
                    bbox_x1: annotation.bbox_x1,
                    bbox_y1: annotation.bbox_y1,
                    bbox_x2: annotation.bbox_x2,
                    bbox_y2: annotation.bbox_y2
                  }
                  setDragStart({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                  })
                }
              }}
            >
              {/* Лейбл - скрываем для pending */}
              {!isPending && (
                <div
                  style={{
                    position: 'absolute',
                    top: -28,
                    left: 0,
                    backgroundColor: color,
                    color: annotation.object_subtype === 'white' ? '#000' : '#fff',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {annotation.source === 'manual' && <span>🖊️</span>}
                  {getAnnotationLabel(annotation)}
                </div>
              )}

              {/* Resize handles - скрываем для pending и readOnly */}
              {isSelected && !drawingMode && !readOnly && !isPending && (
                <>
                  {['tl', 'tr', 'bl', 'br'].map((handle) => {
                    const size = 10
                    const offset = -size / 2
                    const positions = {
                      tl: { top: offset, left: offset },
                      tr: { top: offset, right: offset },
                      bl: { bottom: offset, left: offset },
                      br: { bottom: offset, right: offset },
                    }
                    const cursors = {
                      tl: 'nwse-resize',
                      tr: 'nesw-resize',
                      bl: 'nesw-resize',
                      br: 'nwse-resize',
                    }

                    return (
                      <div
                        key={handle}
                        style={{
                          position: 'absolute',
                          width: size,
                          height: size,
                          backgroundColor: color,
                          border: '2px solid white',
                          borderRadius: '50%',
                          cursor: cursors[handle as keyof typeof cursors],
                          ...positions[handle as keyof typeof positions],
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          const rect = containerRef.current?.getBoundingClientRect()
                          if (!rect) return
                          setDraggedAnnotation(annotation.id)
                          setResizeHandle(handle)
                          initialBBoxRef.current = {
                            bbox_x1: annotation.bbox_x1,
                            bbox_y1: annotation.bbox_y1,
                            bbox_x2: annotation.bbox_x2,
                            bbox_y2: annotation.bbox_y2
                          }
                          setDragStart({
                            x: e.clientX - rect.left,
                            y: e.clientY - rect.top
                          })
                        }}
                      />
                    )
                  })}
                </>
              )}
            </div>
          )
        })}

      {/* Текущий рисуемый bbox */}
      {isDrawing && drawStart && drawCurrent && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(drawStart.x, drawCurrent.x),
            top: Math.min(drawStart.y, drawCurrent.y),
            width: Math.abs(drawCurrent.x - drawStart.x),
            height: Math.abs(drawCurrent.y - drawStart.y),
            border: '2px dashed #3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Floating toolbar над bbox */}
      {selectedAnnotation && renderMetrics && !drawingMode && !readOnly && (
        (() => {
          const p1 = refToScreen(selectedAnnotation.bbox_x1, selectedAnnotation.bbox_y1)
          const p2 = refToScreen(selectedAnnotation.bbox_x2, selectedAnnotation.bbox_y2)
          const toolbarWidth = 100 // примерная ширина toolbar
          
          if (!showControls) return null
          
          return (
            <div
              data-toolbar-position
              style={{
                position: 'absolute',
                left: p1.x,
                top: p1.y - 36,
                zIndex: 10,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-black bg-opacity-90 rounded px-2 py-1 shadow-lg">
                <AnnotationControls
                  annotation={selectedAnnotation as any}
                  originalAnnotations={_originalAnnotations}
                  imageId={_imageId}
                  compact={true}
                  showEdit={true}
                  showOverlapped={true}
                  showOrientation={true}
                  showError={false}
                  showDelete={true}
                  onUpdate={(id, updates) => {
                    // Сначала оптимистично обновляем локально (синхронно)
                    if (updateAnnotationLocally) {
                      updateAnnotationLocally(id, updates)
                    }
                    // Потом async сохраняем на сервер
                    if (onAnnotationUpdate) {
                      onAnnotationUpdate(id, updates)
                    }
                  }}
                  onDelete={onDelete ? () => onDelete() : undefined}
                  onChangeDish={(id) => {
                    if (onChangeDish) {
                      const rect = {
                        x: p1.x,
                        y: p1.y - 36,
                        width: toolbarWidth,
                        bboxWidth: p2.x - p1.x
                      }
                      onChangeDish(id, rect)
                    }
                  }}
                  onToggleError={onToggleError}
                  className="text-white"
                />
              </div>
            </div>
          )
        })()
      )}
    </div>
  )
}
