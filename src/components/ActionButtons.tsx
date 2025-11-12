'use client'

import { Save, SkipForward, CheckCircle2, Loader, RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

interface ActionButtonsProps {
  onSave: () => void
  onSkipStep: () => void
  onSkipTask: () => void
  onComplete: () => void
  onReset?: () => void
  hasUnsavedChanges: boolean
  isSaving: boolean
  canComplete: boolean
}

export function ActionButtons({
  onSave,
  onSkipStep,
  onSkipTask,
  onComplete,
  onReset,
  hasUnsavedChanges,
  isSaving,
  canComplete,
}: ActionButtonsProps) {
  const [showSavedFeedback, setShowSavedFeedback] = useState(false)

  // Show "Saved" feedback after saving
  useEffect(() => {
    if (!isSaving && !hasUnsavedChanges && showSavedFeedback) {
      const timer = setTimeout(() => setShowSavedFeedback(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [isSaving, hasUnsavedChanges, showSavedFeedback])

  const handleSave = () => {
    onSave()
    setShowSavedFeedback(true)
  }
  
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50">
      <div className="max-w-7xl mx-auto px-6 py-3.5">
        <div className="flex items-center justify-between">
          {/* Левая часть: менее важные действия */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
              className={cn(
                "gap-2 transition-all",
                showSavedFeedback && !hasUnsavedChanges && "border-green-500 text-green-600"
              )}
            >
              {isSaving ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : showSavedFeedback && !hasUnsavedChanges ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {showSavedFeedback && !hasUnsavedChanges ? 'Сохранено!' : 'Сохранить'}
              <kbd className="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-mono">S</kbd>
            </Button>
            
            {onReset && hasUnsavedChanges && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                disabled={isSaving}
                className="gap-2 text-gray-600"
              >
                <RotateCcw className="w-4 h-4" />
                Сбросить
              </Button>
            )}
            
            {hasUnsavedChanges && (
              <span className="ml-2 text-xs text-amber-600 font-medium">
                ● Несохранённые изменения
              </span>
            )}
          </div>
          
          {/* Правая часть: важные действия */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onSkipStep}
              disabled={isSaving}
              className="gap-2"
            >
              <SkipForward className="w-4 h-4" />
              Пропустить этап
              <kbd className="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-mono">Tab</kbd>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={onSkipTask}
              disabled={isSaving}
              className="gap-2 text-orange-600 border-orange-300 hover:bg-orange-50"
            >
              <SkipForward className="w-4 h-4" />
              Пропустить задачу
              <kbd className="ml-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-mono">⇧Tab</kbd>
            </Button>
            
            <Button
              size="sm"
              onClick={onComplete}
              disabled={isSaving || !canComplete}
              className={cn(
                'gap-2',
                canComplete ? 'bg-green-600 hover:bg-green-700' : ''
              )}
            >
              <CheckCircle2 className="w-4 h-4" />
              Завершить этап
              <kbd className="ml-1 px-1.5 py-0.5 bg-green-800 bg-opacity-30 text-white rounded text-xs font-mono">Enter</kbd>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

