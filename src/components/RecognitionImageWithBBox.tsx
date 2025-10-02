"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type RectangleString = string // format: "x,y,w,h"

interface RecognitionImageWithBBoxProps {
  src: string
  alt: string
  rectangle: RectangleString
  className?: string
  // Enable horizontal mirroring support. When true, x is recalculated as referenceWidth - (x + w)
  mirrored?: boolean
  referenceWidth?: number
  referenceHeight?: number
  sizes?: string
  priority?: boolean
}

interface ParsedRect {
  x: number
  y: number
  w: number
  h: number
}

function parseRectangle(rectangle: RectangleString | undefined | null): ParsedRect | null {
  if (!rectangle) return null
  const parts = rectangle.split(",").map((p) => Number(p.trim()))
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null
  const [x, y, w, h] = parts
  return { x, y, w, h }
}

export function RecognitionImageWithBBox({
  src,
  alt,
  rectangle,
  className,
  mirrored = false,
  referenceWidth,
  referenceHeight,
  sizes,
  priority,
}: RecognitionImageWithBBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null)

  const parsed = useMemo(() => parseRectangle(rectangle), [rectangle])

  const measureContainer = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setContainerSize((prev) =>
      prev && prev.w === width && prev.h === height ? prev : { w: width, h: height },
    )
  }, [])

  useEffect(() => {
    measureContainer()
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(() => measureContainer())
    observer.observe(el)

    window.addEventListener("orientationchange", measureContainer)

    return () => {
      observer.disconnect()
      window.removeEventListener("orientationchange", measureContainer)
    }
  }, [measureContainer])

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

  const bboxStyle = useMemo(() => {
    if (!parsed || !naturalSize || !renderMetrics) return undefined

    const refWidth = referenceWidth ?? naturalSize.w
    const refHeight = referenceHeight ?? naturalSize.h
    if (!refWidth || !refHeight) return undefined

    const scaleRefToNaturalX = naturalSize.w / refWidth
    const scaleRefToNaturalY = naturalSize.h / refHeight

    const mirroredXRef = refWidth - (parsed.x + parsed.w)
    const xRef = mirrored ? mirroredXRef : parsed.x

    const bboxNaturalX = xRef * scaleRefToNaturalX
    const bboxNaturalY = parsed.y * scaleRefToNaturalY
    const bboxNaturalW = parsed.w * scaleRefToNaturalX
    const bboxNaturalH = parsed.h * scaleRefToNaturalY

    const left = renderMetrics.offsetX + bboxNaturalX * renderMetrics.scale
    const top = renderMetrics.offsetY + bboxNaturalY * renderMetrics.scale
    const width = bboxNaturalW * renderMetrics.scale
    const height = bboxNaturalH * renderMetrics.scale

    return {
      position: "absolute" as const,
      left,
      top,
      width,
      height,
      border: "3px solid #ef4444",
      boxSizing: "border-box" as const,
      pointerEvents: "none" as const,
    }
  }, [parsed, naturalSize, renderMetrics, mirrored, referenceWidth, referenceHeight])

  return (
    <div ref={containerRef} className={"relative w-full h-full " + (className ?? "") }>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes || "(max-width: 768px) 100vw, (max-width: 1280px) 70vw, 60vw"}
        className="object-contain"
        priority={priority}
        onLoad={(e) => {
          const img = e.currentTarget as HTMLImageElement
          setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
          requestAnimationFrame(measureContainer)
        }}
      />
      {bboxStyle && <div style={bboxStyle} />}
    </div>
  )
}

export default RecognitionImageWithBBox


