'use client'

import { Annotation } from '@/types/annotations'
import { objectColors, objectTypeLabels } from '@/styles/design-tokens'

interface BBoxLabelProps {
  annotation: Annotation
  position: { x: number; y: number }
  dishName?: string
}

export function BBoxLabel({
  annotation,
  position,
  dishName,
}: BBoxLabelProps) {
  const { object_type, source } = annotation
  
  // Get label text
  const getLabel = () => {
    if (object_type === 'dish' && dishName) {
      return dishName
    }
    return objectTypeLabels[object_type as keyof typeof objectTypeLabels] || object_type
  }

  // Get color
  const color = objectColors[object_type as keyof typeof objectColors] || objectColors.nonfood

  // Source icon
  const getSourceIcon = () => {
    if (source === 'manual' || source === 'user') {
      return '✏️'
    }
    if (source === 'qwen_auto') {
      return '🤖'
    }
    return ''
  }

  // Overlapped indicator
  const getOverlappedIcon = () => {
    if (annotation.is_overlapped) {
      return '🔀' // Icon for overlapped objects
    }
    return ''
  }

  return (
    <div
      className="absolute z-40 px-2 py-1 text-xs font-medium text-white rounded shadow-md pointer-events-none"
      style={{
        left: position.x,
        top: position.y - 24, // Above bbox
        backgroundColor: color,
      }}
    >
      {getSourceIcon()} {getLabel()} {getOverlappedIcon()}
    </div>
  )
}

