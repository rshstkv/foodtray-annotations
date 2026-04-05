'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Download, ArrowLeft } from 'lucide-react'
import { DETECTION_CLASSES, DETECTION_CLASS_COLORS, type DetectionClassId } from '@/types/detection'
import { cn } from '@/lib/utils'

interface DetectionTopBarProps {
  activeClass: DetectionClassId
  onClassChange: (cls: DetectionClassId) => void
  currentIndex: number
  totalImages: number
  isDone: boolean
  onToggleDone: () => void
  onExport: () => void
  onBack: () => void
  taskName: string
}

export function DetectionTopBar({
  activeClass,
  onClassChange,
  currentIndex,
  totalImages,
  isDone,
  onToggleDone,
  onExport,
  onBack,
  taskName,
}: DetectionTopBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm text-gray-500 font-medium truncate max-w-[180px]">{taskName}</span>
      </div>

      <div className="flex items-center gap-2">
        {(Object.entries(DETECTION_CLASSES) as [string, string][]).map(([id, name]) => {
          const classId = parseInt(id) as DetectionClassId
          return (
            <button
              key={id}
              onClick={() => onClassChange(classId)}
              className={cn(
                'px-3 py-1 rounded text-sm font-medium transition-colors border',
                activeClass === classId
                  ? 'border-current text-white'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              )}
              style={
                activeClass === classId
                  ? { backgroundColor: DETECTION_CLASS_COLORS[classId] }
                  : undefined
              }
            >
              <kbd className="mr-1 text-xs opacity-70">{classId + 1}</kbd>
              {name}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600 tabular-nums font-medium">
          {currentIndex + 1} / {totalImages}
        </span>

        <div className="flex items-center gap-2">
          <Switch
            checked={isDone}
            onCheckedChange={onToggleDone}
            className="data-[state=checked]:bg-green-500"
          />
          <Badge variant={isDone ? 'default' : 'secondary'} className={isDone ? 'bg-green-500' : ''}>
            {isDone ? 'Done' : 'Pending'}
          </Badge>
          <kbd className="text-xs text-gray-400 ml-0.5">D</kbd>
        </div>

        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="w-4 h-4 mr-1" />
          Export
        </Button>
      </div>
    </div>
  )
}
