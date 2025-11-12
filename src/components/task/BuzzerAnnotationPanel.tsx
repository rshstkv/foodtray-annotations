'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'

const BUZZER_COLORS = [
  { id: 'red', name: 'Красный', color: '#ef4444' },
  { id: 'green', name: 'Зеленый', color: '#22c55e' },
  { id: 'blue', name: 'Синий', color: '#3b82f6' },
  { id: 'yellow', name: 'Желтый', color: '#eab308' },
]

interface BuzzerAnnotationPanelProps {
  annotations: Array<{ id: string; object_subtype: string | null }>
  onStartDrawing: (color: string) => void
  isDrawing: boolean
}

export function BuzzerAnnotationPanel({
  annotations,
  onStartDrawing,
  isDrawing,
}: BuzzerAnnotationPanelProps) {
  const [selectedColor, setSelectedColor] = useState('red')

  const buzzerCount = annotations.filter(a => !a).length

  return (
    <div className="space-y-3">
      {/* Compact count */}
      <div className="text-sm text-gray-600">
        Отмечено: <span className="font-semibold">{buzzerCount}</span>
      </div>

      {/* Color selector */}
      <div>
        <label className="text-xs text-gray-600 block mb-2">Цвет:</label>
        <div className="grid grid-cols-3 gap-1.5">
          {BUZZER_COLORS.map((buzzer) => (
            <button
              key={buzzer.id}
              onClick={() => setSelectedColor(buzzer.id)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded border-2 transition-all ${
                selectedColor === buzzer.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div
                className="w-3 h-3 rounded-full border border-gray-300"
                style={{ backgroundColor: buzzer.color }}
              />
              <span className="text-xs">{buzzer.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Draw button */}
      <Button
        onClick={() => onStartDrawing(selectedColor)}
        disabled={isDrawing}
        className="w-full gap-2"
        variant={isDrawing ? 'default' : 'outline'}
      >
        <Pencil className="w-4 h-4" />
        {isDrawing ? 'Рисуйте...' : 'Нарисовать баззер'}
      </Button>
    </div>
  )
}

