'use client'

import { Button } from '@/components/ui/button'
import { RotateCcw, AlertCircle } from 'lucide-react'
import type { ValidationType } from '@/types/domain'
import { VALIDATION_TYPE_LABELS } from '@/types/domain'

interface ValidationSessionHeaderProps {
  recognitionId: number
  validationType: ValidationType
  hasUnsavedChanges?: boolean
  onReset?: () => void
}

export function ValidationSessionHeader({
  recognitionId,
  validationType,
  hasUnsavedChanges = false,
  onReset,
}: ValidationSessionHeaderProps) {
  return (
    <div className="px-6 py-4 border-b border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Recognition #{recognitionId}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {VALIDATION_TYPE_LABELS[validationType]}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Индикатор несохраненных изменений */}
          {hasUnsavedChanges && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">
                Есть несохраненные изменения
              </span>
            </div>
          )}

          {/* Кнопка Reset */}
          {onReset && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              disabled={!hasUnsavedChanges}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Initial
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

