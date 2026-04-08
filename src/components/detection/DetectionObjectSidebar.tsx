'use client'

import { Button } from '@/components/ui/button'
import { Plus, Trash2, ChevronRight, Save } from 'lucide-react'
import {
  DETECTION_CLASSES,
  DETECTION_CLASS_COLORS,
  type DetectionClassId,
} from '@/types/detection'
import { cn } from '@/lib/utils'

interface AnnotationItem {
  _uid: number
  class: DetectionClassId
}

interface DetectionObjectSidebarProps {
  annotations: AnnotationItem[]
  selectedId: number | string | null
  hasUnsavedChanges: boolean
  onSelectAnnotation: (id: number) => void
  onDeleteAnnotation: (id: number) => void
  onAddFood: () => void
  onAddPlate: () => void
  onSave: () => void
  onDoneAndNext: () => void
  saving: boolean
  isDrawing: boolean
}

export function DetectionObjectSidebar({
  annotations,
  selectedId,
  hasUnsavedChanges,
  onSelectAnnotation,
  onDeleteAnnotation,
  onAddFood,
  onAddPlate,
  onSave,
  onDoneAndNext,
  saving,
  isDrawing,
}: DetectionObjectSidebarProps) {
  const foodCount = annotations.filter((a) => a.class === 0).length
  const plateCount = annotations.filter((a) => a.class === 1).length

  return (
    <div className="w-64 bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Summary header */}
      <div className="px-3 py-2 border-b border-gray-200 text-xs text-gray-500 flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          {foodCount} food
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {plateCount} plate
        </span>
        <span className="ml-auto text-gray-400">{annotations.length} total</span>
      </div>

      {/* Flat annotation list */}
      <div className="flex-1 overflow-y-auto">
        {annotations.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-gray-400">
            No annotations
          </div>
        ) : (
          <div className="py-1">
            {annotations.map((item, idx) => {
              const cls = item.class as DetectionClassId
              const color = DETECTION_CLASS_COLORS[cls]
              const isSelected = selectedId === item._uid
              return (
                <div
                  key={item._uid}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-sm',
                    isSelected ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
                  )}
                  onClick={() => onSelectAnnotation(item._uid)}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="flex-1 truncate">
                    {DETECTION_CLASSES[cls]} {idx + 1}
                  </span>
                  <button
                    className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteAnnotation(item._uid)
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add buttons */}
      <div className="px-3 py-2 border-t border-gray-100 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={onAddFood}
          disabled={isDrawing}
        >
          <Plus className="w-3 h-3 mr-1" />
          Food
          <kbd className="ml-auto text-[10px] opacity-50">1</kbd>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={onAddPlate}
          disabled={isDrawing}
        >
          <Plus className="w-3 h-3 mr-1" />
          Plate
          <kbd className="ml-auto text-[10px] opacity-50">2</kbd>
        </Button>
      </div>

      {/* Actions */}
      <div className="px-3 py-3 border-t border-gray-200 space-y-2">
        {hasUnsavedChanges && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onSave}
            disabled={saving}
          >
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Saving...' : 'Save'}
            <kbd className="ml-auto text-[10px] opacity-50">Ctrl+S</kbd>
          </Button>
        )}
        <Button
          size="sm"
          className="w-full bg-green-600 hover:bg-green-700"
          onClick={onDoneAndNext}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Done & Next'}
          <ChevronRight className="w-4 h-4 ml-1" />
          <kbd className="ml-auto text-[10px] opacity-50">Space</kbd>
        </Button>
      </div>

      {/* Hotkey hints */}
      <div className="px-3 py-2 border-t border-gray-100 text-[10px] text-gray-400 leading-relaxed">
        <span className="font-semibold">Shift</span> next &middot;{' '}
        <span className="font-semibold">Del</span> delete &middot;{' '}
        <span className="font-semibold">&larr;&rarr;</span> images &middot;{' '}
        <span className="font-semibold">Ctrl+Z</span> undo
      </div>
    </div>
  )
}
