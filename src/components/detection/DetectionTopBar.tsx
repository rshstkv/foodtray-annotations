'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'

interface DetectionTopBarProps {
  taskName: string
  imageFilename: string
  currentIndex: number
  totalImages: number
  isDone: boolean
  hasUnsavedChanges: boolean
  onBack: () => void
  onPrev: () => void
  onNext: () => void
}

export function DetectionTopBar({
  taskName,
  imageFilename,
  currentIndex,
  totalImages,
  isDone,
  hasUnsavedChanges,
  onBack,
  onPrev,
  onNext,
}: DetectionTopBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 shrink-0">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" />
      </Button>

      <span className="text-sm text-gray-400 truncate max-w-[140px]">{taskName}</span>
      <span className="text-gray-300">/</span>
      <span className="text-sm font-medium truncate max-w-[200px]">
        {imageFilename}
        {hasUnsavedChanges && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400 ml-1.5 align-middle" />
        )}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onPrev}
          disabled={currentIndex <= 0}
        >
          <ChevronLeft className="w-4 h-4" />
          <kbd className="text-xs text-gray-400 ml-0.5">&larr;</kbd>
        </Button>

        <span className="text-sm text-gray-600 tabular-nums font-medium min-w-[60px] text-center">
          {currentIndex + 1} / {totalImages}
        </span>

        <Button
          variant="ghost"
          size="sm"
          onClick={onNext}
          disabled={currentIndex >= totalImages - 1}
        >
          <kbd className="text-xs text-gray-400 mr-0.5">&rarr;</kbd>
          <ChevronRight className="w-4 h-4" />
        </Button>

        {isDone && (
          <Badge className="bg-green-500 ml-2">Done</Badge>
        )}
      </div>
    </div>
  )
}
