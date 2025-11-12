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
    <div className="space-y-4">
      {/* Header with status */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-medium text-gray-900">Тарелки</h3>
          {allMatch && hasAny ? (
            <Check className="w-5 h-5 text-green-600" />
          ) : hasAny ? (
            <AlertCircle className="w-5 h-5 text-amber-600" />
          ) : null}
        </div>
        
        <div className="text-sm space-y-1">
          <p className="text-gray-700">
            Ожидается: <span className="font-semibold">{expectedCount}</span> шт.
          </p>
          {imageIds.map((imageId, idx) => {
            const count = byImage[imageId].length
            const isCorrect = count === expectedCount
            return (
              <p
                key={imageId}
                className={`${
                  isCorrect
                    ? 'text-green-700'
                    : count > 0
                    ? 'text-amber-700'
                    : 'text-red-700'
                }`}
              >
                {idx === 0 ? 'Main' : 'Quality'}: {count}/{expectedCount}
              </p>
            )
          })}
        </div>
      </div>

      {/* Draw button */}
      <Button
        onClick={onStartDrawing}
        disabled={isDrawing}
        className="w-full gap-2"
        variant={isDrawing ? 'default' : 'outline'}
      >
        <Pencil className="w-4 h-4" />
        {isDrawing ? 'Рисуйте на изображении...' : 'Нарисовать тарелку'}
      </Button>

      {/* Instructions */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>• Нажмите "Нарисовать"</p>
        <p>• Обведите тарелку на обеих картинках</p>
        <p>• Количество должно совпадать на обеих</p>
        <p>• Клик на bbox для удаления</p>
      </div>
    </div>
  )
}

