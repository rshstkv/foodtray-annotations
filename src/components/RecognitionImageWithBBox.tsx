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
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [layout, setLayout] = useState<{
    container: { w: number; h: number }
    image: { w: number; h: number; offsetX: number; offsetY: number } | null
  }>({
    container: { w: 0, h: 0 },
    image: null,
  })

  const parsed = useMemo(() => parseRectangle(rectangle), [rectangle])

  const measureLayout = useCallback(() => {
    const containerEl = containerRef.current
    if (!containerEl) return

    const containerRect = containerEl.getBoundingClientRect()
    const imgEl = imageRef.current ?? (containerEl.querySelector("img") as HTMLImageElement | null)

    const imageLayout = imgEl
      ? (() => {
          const imgRect = imgEl.getBoundingClientRect()
          return {
            w: imgRect.width,
            h: imgRect.height,
            offsetX: imgRect.left - containerRect.left,
            offsetY: imgRect.top - containerRect.top,
          }
        })()
      : null

    setLayout({
      container: { w: containerRect.width, h: containerRect.height },
      image: imageLayout,
    })
  }, [])

  useEffect(() => {
    measureLayout()

    const ro = new ResizeObserver(() => measureLayout())
    const containerEl = containerRef.current
    if (containerEl) ro.observe(containerEl)
    const imgEl = containerEl?.querySelector("img") as HTMLElement | null
    if (imgEl) ro.observe(imgEl)

    const onResize = () => measureLayout()
    window.addEventListener("resize", onResize)
    window.addEventListener("orientationchange", onResize)

    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("orientationchange", onResize)
      ro.disconnect()
    }
  }, [measureLayout])

  const bboxStyle = useMemo(() => {
    if (!parsed || !naturalSize || !layout.image) return undefined

    const imageLayout = layout.image
    const scaleX = imageLayout.w / naturalSize.w
    const scaleY = imageLayout.h / naturalSize.h

    const xOriginal = parsed.x
    const xMirrored = naturalSize.w - (parsed.x + parsed.w)
    const xUse = mirrored ? xMirrored : xOriginal

    const left = imageLayout.offsetX + xUse * scaleX
    const top = imageLayout.offsetY + parsed.y * scaleY
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
  }, [parsed, naturalSize, mirrored, layout.image])

  return (
    <div ref={containerRef} className={"relative w-full h-full " + (className ?? "") }>
      <Image
        ref={imageRef}
        src={src}
        alt={alt}
        fill
        sizes="100vw"
        className="object-contain"
        unoptimized
        onLoadingComplete={(img) => {
          setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
          requestAnimationFrame(() => {
            imageRef.current = img
            measureLayout()
          })
        }}
      />
      {bboxStyle && <div style={bboxStyle} />}
    </div>
  )
}

export default RecognitionImageWithBBox


