'use client'

import { Button } from '@/components/ui/button'
import { RotateCcw, AlertCircle, CheckCircle } from 'lucide-react'
import type { ValidationType } from '@/types/domain'
import { VALIDATION_TYPE_LABELS } from '@/types/domain'
import type { SessionValidationResult } from '@/lib/validation-rules'

interface ValidationSessionHeaderProps {
  recognitionId: number
  validationType: ValidationType
  hasUnsavedChanges?: boolean
  validationStatus?: SessionValidationResult
  onReset?: () => void
  onSelectFirstError?: () => void
  readOnly?: boolean
}

export function ValidationSessionHeader({
  recognitionId,
  validationType,
  hasUnsavedChanges = false,
  validationStatus,
  onReset,
  onSelectFirstError,
  readOnly = false,
}: ValidationSessionHeaderProps) {
  // Подсчёт количества items с ошибками
  const itemsWithErrors = validationStatus ? validationStatus.itemErrors.size : 0
  const hasErrors = itemsWithErrors > 0 || (validationStatus?.globalErrors.length ?? 0) > 0

  return (
    <div className="px-6 py-4 border-b border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Recognition #{recognitionId}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-gray-600">
              {VALIDATION_TYPE_LABELS[validationType]}
            </p>
            {readOnly && (
              <span className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-medium text-gray-700">
                Режим просмотра
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Индикатор статуса валидации */}
          {validationStatus && (
            validationStatus.canComplete ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-md">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">
                  Все проверки пройдены
                </span>
              </div>
            ) : (
              <button
                onClick={onSelectFirstError}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors cursor-pointer"
                title="Кликните чтобы перейти к проблемному объекту"
              >
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-700">
                  {itemsWithErrors} {itemsWithErrors === 1 ? 'объект требует' : itemsWithErrors > 1 && itemsWithErrors < 5 ? 'объекта требуют' : 'объектов требуют'} внимания
                </span>
              </button>
            )
          )}

          {/* Индикатор несохраненных изменений - только в edit режиме */}
          {!readOnly && hasUnsavedChanges && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">
                Есть несохраненные изменения
              </span>
            </div>
          )}

          {/* Кнопка Reset - только в edit режиме */}
          {!readOnly && onReset && (
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

