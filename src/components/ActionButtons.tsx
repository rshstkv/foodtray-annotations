'use client'

import { Save, SkipForward, CheckCircle2, Loader, RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

interface ActionButtonsProps {
  onSave: () => void
  onSkip: () => void
  onComplete: () => void
  onReset?: () => void
  hasUnsavedChanges: boolean
  isSaving: boolean
  canComplete: boolean
}

export function ActionButtons({
  onSave,
  onSkip,
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
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
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
              {showSavedFeedback && !hasUnsavedChanges ? 'Сохранено!' : 'Сохранить прогресс'}
            </Button>
            
            {onReset && hasUnsavedChanges && (
              <Button
                variant="ghost"
                onClick={onReset}
                disabled={isSaving}
                className="gap-2 text-gray-600"
              >
                <RotateCcw className="w-4 h-4" />
                Сбросить
              </Button>
            )}
            
            {hasUnsavedChanges && (
              <span className="text-xs text-amber-600 font-medium">
                ● Есть несохранённые изменения
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={onSkip}
              disabled={isSaving}
              className="gap-2"
            >
              <SkipForward className="w-4 h-4" />
              Пропустить задачу
            </Button>
            
            <Button
              onClick={onComplete}
              disabled={isSaving || !canComplete}
              className={cn(
                'gap-2',
                canComplete ? 'bg-green-600 hover:bg-green-700' : ''
              )}
            >
              <CheckCircle2 className="w-4 h-4" />
              Завершить этап
            </Button>
          </div>
        </div>
        
        {/* Hotkeys подсказки */}
        <div className="mt-2 flex gap-4 text-xs text-gray-500">
          <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded">S</kbd> Сохранить</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded">Esc</kbd> Пропустить</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded">Enter</kbd> Завершить</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-100 rounded">Tab</kbd> Следующий этап</span>
        </div>
      </div>
    </div>
  )
}

