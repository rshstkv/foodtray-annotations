'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'

const BUZZER_COLORS = [
  { id: 'red', name: 'Красный', color: '#ef4444' },
  { id: 'green', name: 'Зеленый', color: '#22c55e' },
  { id: 'blue', name: 'Синий', color: '#3b82f6' },
  { id: 'yellow', name: 'Желтый', color: '#eab308' },
  { id: 'black', name: 'Черный', color: '#1f2937' },
  { id: 'white', name: 'Белый', color: '#f3f4f6' },
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
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-medium text-gray-900">Буззеры</h3>
        <p className="text-sm text-gray-600 mt-1">
          Отмечено: {buzzerCount}
        </p>
      </div>

      {/* Color selector */}
      <div>
        <label className="text-sm text-gray-700 block mb-2">Цвет буззера:</label>
        <div className="grid grid-cols-3 gap-2">
          {BUZZER_COLORS.map((buzzer) => (
            <button
              key={buzzer.id}
              onClick={() => setSelectedColor(buzzer.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                selectedColor === buzzer.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div
                className="w-4 h-4 rounded-full border border-gray-300"
                style={{ backgroundColor: buzzer.color }}
              />
              <span className="text-xs font-medium">{buzzer.name}</span>
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
        {isDrawing ? 'Рисуйте на изображении...' : 'Нарисовать буззер'}
      </Button>

      {/* Instructions */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>• Выберите цвет буззера</p>
        <p>• Нажмите "Нарисовать"</p>
        <p>• Обведите буззер на обеих картинках</p>
        <p>• Клик для удаления bbox</p>
      </div>
    </div>
  )
}

