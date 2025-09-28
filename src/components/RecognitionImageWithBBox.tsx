"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type RectangleString = string // format: "x,y,w,h"

interface RecognitionImageWithBBoxProps {
  src: string
  alt: string
  rectangle: RectangleString
  className?: string
  // Enable horizontal mirroring support. When true, x is recalculated as naturalWidth - (x + w)
  mirrored?: boolean
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

export function RecognitionImageWithBBox({ src, alt, rectangle, className, mirrored = false }: RecognitionImageWithBBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  const parsed = useMemo(() => parseRectangle(rectangle), [rectangle])

  const updateDisplaySize = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const w = el.clientWidth
    const h = el.clientHeight
    if (w !== displaySize.w || h !== displaySize.h) {
      setDisplaySize({ w, h })
    }
  }, [displaySize.h, displaySize.w])

  useEffect(() => {
    updateDisplaySize()
    const ro = new ResizeObserver(() => updateDisplaySize())
    if (containerRef.current) ro.observe(containerRef.current)
    const onResize = () => updateDisplaySize()
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      ro.disconnect()
    }
  }, [updateDisplaySize])

  const scaleX = useMemo(() => {
    if (!naturalSize || naturalSize.w === 0) return 0
    return displaySize.w / naturalSize.w
  }, [displaySize.w, naturalSize])

  const scaleY = useMemo(() => {
    if (!naturalSize || naturalSize.h === 0) return 0
    return displaySize.h / naturalSize.h
  }, [displaySize.h, naturalSize])

  const bboxStyle = useMemo(() => {
    if (!parsed || !naturalSize) return undefined
    const xOriginal = parsed.x
    const xMirrored = naturalSize.w - (parsed.x + parsed.w)
    const xUse = mirrored ? xMirrored : xOriginal
    const left = xUse * scaleX
    const top = parsed.y * scaleY
    const width = parsed.w * scaleX
    const height = parsed.h * scaleY

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
  }, [parsed, naturalSize, scaleX, scaleY, mirrored])

  return (
    <div ref={containerRef} className={"relative w-full h-full " + (className ?? "") }>
      <Image
        src={src}
        alt={alt}
        fill
        sizes="100vw"
        className="object-contain"
        onLoadingComplete={(img) => {
          setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
          // sync a tick later to capture final layout size
          requestAnimationFrame(() => updateDisplaySize())
        }}
      />
      {bboxStyle && <div style={bboxStyle} />}
    </div>
  )
}

export default RecognitionImageWithBBox


