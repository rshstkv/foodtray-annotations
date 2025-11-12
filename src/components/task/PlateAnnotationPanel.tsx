'use client'

import { Button } from '@/components/ui/button'
import { Pencil, Check, AlertCircle } from 'lucide-react'
import { Annotation } from '@/types/annotations'

interface PlateAnnotationPanelProps {
  annotations: Annotation[]
  expectedCount: number  // Количество тарелок из QWEN аннотаций
  onStartDrawing: () => void
  isDrawing: boolean
}

export function PlateAnnotationPanel({
  annotations,
  expectedCount,
  onStartDrawing,
  isDrawing,
}: PlateAnnotationPanelProps) {
  // Группируем по картинкам
  const byImage = annotations.reduce((acc, ann) => {
    if (!acc[ann.image_id]) acc[ann.image_id] = []
    acc[ann.image_id].push(ann)
    return acc
  }, {} as Record<string, Annotation[]>)

  const imageIds = Object.keys(byImage)
  const counts = imageIds.map(id => byImage[id].length)
  const totalCount = counts.reduce((a, b) => a + b, 0)

  // Статус: все ли картинки имеют ожидаемое количество
  const allMatch = counts.every(c => c === expectedCount)
  const hasAny = totalCount > 0

  return (
    <div className="space-y-3">
      {/* Header with status */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-700">
          Ожидается: <span className="font-semibold">{expectedCount}</span>
        </span>
        {allMatch && hasAny ? (
          <Check className="w-4 h-4 text-green-600" />
        ) : hasAny ? (
          <AlertCircle className="w-4 h-4 text-amber-600" />
        ) : null}
      </div>

      {/* Counts by image */}
      <div className="flex gap-2 text-sm">
        {imageIds.map((imageId, idx) => {
          const count = byImage[imageId].length
          const isCorrect = count === expectedCount
          return (
            <div
              key={imageId}
              className={`flex-1 px-2 py-1 rounded text-center ${
                isCorrect
                  ? 'bg-green-50 text-green-700'
                  : count > 0
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {count}/{expectedCount}
            </div>
          )
        })}
      </div>

      {/* Draw button */}
      <Button
        onClick={onStartDrawing}
        disabled={isDrawing}
        className="w-full gap-2"
        variant={isDrawing ? 'default' : 'outline'}
      >
        <Pencil className="w-4 h-4" />
        {isDrawing ? 'Рисуйте...' : 'Нарисовать тарелку'}
      </Button>
    </div>
  )
}

