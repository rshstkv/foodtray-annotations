'use client'

import { Annotation } from '@/types/annotations'
import { Button } from '@/components/ui/button'
import { Edit3, Trash2, AlertCircle } from 'lucide-react'

interface BBoxToolbarProps {
  annotation: Annotation
  position: { x: number; y: number; width: number }
  onChangeDish?: () => void
  onToggleOverlap?: () => void
  onDelete?: () => void
  
  // Specific controls for different object types
  buzzerColorSelector?: React.ReactNode
  bottleOrientationSelector?: React.ReactNode
  nonfoodSubtypeSelector?: React.ReactNode
}

export function BBoxToolbar({
  annotation,
  position,
  onChangeDish,
  onToggleOverlap,
  onDelete,
  buzzerColorSelector,
  bottleOrientationSelector,
  nonfoodSubtypeSelector,
}: BBoxToolbarProps) {
  const { object_type } = annotation

  return (
    <div
      className="absolute z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex items-center gap-2"
      style={{
        left: position.x,
        top: position.y - 48, // Above bbox
        minWidth: Math.max(position.width, 200),
      }}
    >
      {/* Dish controls */}
      {object_type === 'dish' && (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={onChangeDish}
            className="h-8 text-xs"
          >
            <Edit3 className="w-3 h-3 mr-1" />
            Change Dish
          </Button>

          <Button
            size="sm"
            variant={annotation.is_overlapped ? 'default' : 'ghost'}
            onClick={onToggleOverlap}
            className="h-8 text-xs"
          >
            <AlertCircle className="w-3 h-3 mr-1" />
            Overlap
          </Button>
        </>
      )}

      {/* Buzzer controls */}
      {object_type === 'buzzer' && buzzerColorSelector}

      {/* Bottle controls */}
      {object_type === 'bottle' && bottleOrientationSelector}

      {/* Non-food controls */}
      {object_type === 'nonfood' && nonfoodSubtypeSelector}

      {/* Delete button (always) */}
      <div className="ml-auto border-l pl-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="w-3 h-3 mr-1" />
          Delete
        </Button>
      </div>
    </div>
  )
}

