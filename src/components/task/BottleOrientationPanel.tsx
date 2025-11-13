'use client'

import { Annotation } from '@/types/annotations'
import { Button } from '@/components/ui/button'
import { Check, Plus } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'

interface BottleOrientationPanelProps {
  annotations: Annotation[]
  onStartDrawing: () => void
  onUpdateOrientation: (annotationId: string, orientation: 'vertical' | 'horizontal') => void
  isDrawing: boolean
}

export function BottleOrientationPanel({
  annotations,
  onStartDrawing,
  onUpdateOrientation,
  isDrawing,
}: BottleOrientationPanelProps) {
  const bottles = annotations.filter(a => a.object_type === 'bottle' && !a.is_deleted)
  
  // Проверка что все бутылки имеют ориентацию
  const allHaveOrientation = bottles.every(b => b.object_subtype === 'vertical' || b.object_subtype === 'horizontal')
  const missingCount = bottles.filter(b => !b.object_subtype).length

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Ориентация бутылок</h3>
        {allHaveOrientation && bottles.length > 0 ? (
          <Check className="w-4 h-4 text-green-600" />
        ) : bottles.length > 0 ? (
          <span className="text-xs text-amber-600">{missingCount} без ориентации</span>
        ) : null}
      </div>

      {/* Add bottle button */}
      <Button
        size="sm"
        variant="outline"
        onClick={onStartDrawing}
        disabled={isDrawing}
        className="w-full text-xs"
      >
        <Plus className="w-3 h-3 mr-1" />
        Добавить бутылку
      </Button>

      {/* Bottle list */}
      {bottles.length === 0 ? (
        <div className="text-xs text-gray-500 text-center py-4 border border-dashed rounded">
          Бутылок не найдено
        </div>
      ) : (
        <div className="space-y-2">
          {bottles.map((bottle, index) => {
            const hasOrientation = bottle.object_subtype === 'vertical' || bottle.object_subtype === 'horizontal'
            
            return (
              <div
                key={bottle.id}
                className={`p-2 border rounded ${
                  hasOrientation ? 'border-gray-200 bg-white' : 'border-amber-300 bg-amber-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">
                    Бутылка #{index + 1}
                  </span>
                  {hasOrientation && <Check className="w-3 h-3 text-green-600" />}
                </div>

                <RadioGroup
                  value={bottle.object_subtype || ''}
                  onValueChange={(value) => {
                    onUpdateOrientation(bottle.id, value as 'vertical' | 'horizontal')
                  }}
                  className="flex gap-3 mt-2"
                >
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem
                      value="vertical"
                      id={`${bottle.id}-vertical`}
                      className="h-3 w-3"
                    />
                    <Label
                      htmlFor={`${bottle.id}-vertical`}
                      className="text-xs cursor-pointer"
                    >
                      Вертикально
                    </Label>
                  </div>
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem
                      value="horizontal"
                      id={`${bottle.id}-horizontal`}
                      className="h-3 w-3"
                    />
                    <Label
                      htmlFor={`${bottle.id}-horizontal`}
                      className="text-xs cursor-pointer"
                    >
                      Горизонтально
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )
          })}
        </div>
      )}

      {/* Help text */}
      <div className="text-xs text-gray-500 mt-2">
        Отметьте ориентацию каждой бутылки на изображении
      </div>
    </div>
  )
}

