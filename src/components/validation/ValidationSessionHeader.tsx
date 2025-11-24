'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { RotateCcw, AlertCircle, CheckCircle, Check, Minus } from 'lucide-react'
import type { ValidationType, ValidationStep } from '@/types/domain'
import { VALIDATION_TYPE_LABELS } from '@/types/domain'
import type { SessionValidationResult } from '@/lib/validation-rules'

// Краткие инструкции для каждого типа валидации
const VALIDATION_INSTRUCTIONS: Record<ValidationType, string> = {
  FOOD_VALIDATION: 'Проверьте что все блюда отмечены и рамки правильные',
  PLATE_VALIDATION: 'Отметьте плоские тарелки (пустые или с едой, кроме супов)',
  BUZZER_VALIDATION: 'Если есть пейджер — укажите, если нет — нажмите Enter',
  BOTTLE_ORIENTATION_VALIDATION: 'Выделите банку/бутылку и укажите ориентацию',
  OCCLUSION_VALIDATION: 'Если блюдо перекрыто — отметьте перекрытое, если нет — Enter',
}

interface ValidationSessionHeaderProps {
  recognitionId: number
  validationType: ValidationType
  hasUnsavedChanges?: boolean
  validationStatus?: SessionValidationResult
  onReset?: () => void
  onSelectFirstError?: () => void
  readOnly?: boolean
  validationSteps?: ValidationStep[] | null
  currentStepIndex?: number
  onStepClick?: (index: number) => void
  highlightedStepIndex?: number | null // Для анимации переключения этапа
}

export function ValidationSessionHeader({
  recognitionId,
  validationType,
  hasUnsavedChanges = false,
  validationStatus,
  onReset,
  onSelectFirstError,
  readOnly = false,
  validationSteps = null,
  currentStepIndex = 0,
  onStepClick,
  highlightedStepIndex = null,
}: ValidationSessionHeaderProps) {
  // Подсчёт количества items с ошибками
  const itemsWithErrors = validationStatus ? validationStatus.itemErrors.size : 0
  const hasErrors = itemsWithErrors > 0 || (validationStatus?.globalErrors.length ?? 0) > 0

  const hasSteps = validationSteps && validationSteps.length > 0

  return (
    <div className="px-6 py-4 border-b border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Логотип - возврат на главную */}
          <Link 
            href="/work" 
            className="hover:opacity-70 transition-opacity"
            title="Вернуться на главную"
          >
            <Image 
              src="/logo.svg" 
              alt="RRS Logo" 
              width={28} 
              height={28}
              className="rounded-lg"
            />
          </Link>

          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Recognition #{recognitionId}
            </h1>
            <div className="mt-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900">
                  {VALIDATION_TYPE_LABELS[validationType]}
                </p>
                {readOnly && (
                  <span className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-medium text-gray-700">
                    Режим просмотра
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {VALIDATION_INSTRUCTIONS[validationType]}
              </p>
            </div>
          </div>

          {/* Inline stepper */}
          {hasSteps && (
            <div className="flex items-center gap-1.5 ml-4 pl-4 border-l border-gray-300">
              {validationSteps.map((step, index) => {
                const isCurrent = index === currentStepIndex
                const isCompleted = step.status === 'completed'
                const isSkipped = step.status === 'skipped'
                const isPending = step.status === 'pending'
                const isClickable = onStepClick !== undefined
                const isHighlighted = index === highlightedStepIndex

                return (
                  <div key={index} className="flex items-center gap-1">
                    <button
                      onClick={isClickable ? () => onStepClick(index) : undefined}
                      disabled={!isClickable}
                      className={`
                        w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 transition-all
                        ${isCompleted ? 'bg-green-500 text-white' : ''}
                        ${isSkipped ? 'bg-gray-400 text-white' : ''}
                        ${isCurrent ? 'bg-blue-500 text-white ring-2 ring-blue-200' : ''}
                        ${isPending ? 'bg-gray-300 text-gray-600' : ''}
                        ${isClickable ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}
                        ${isHighlighted ? 'animate-pulse ring-4 ring-blue-400 scale-110' : ''}
                      `}
                      title={VALIDATION_TYPE_LABELS[step.type]}
                    >
                      {isCompleted ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : isSkipped ? (
                        <Minus className="w-3.5 h-3.5" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </button>
                    {index < validationSteps.length - 1 && (
                      <div className={`w-4 h-0.5 ${isCompleted ? 'bg-green-500' : isSkipped ? 'bg-gray-400' : 'bg-gray-300'}`} />
                    )}
                  </div>
                )
              })}
              <span className="text-xs text-gray-500 ml-1">
                {currentStepIndex + 1}/{validationSteps.length}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 min-w-0">
          {/* Индикатор статуса валидации */}
          {validationStatus && (
            <div className="flex-shrink-0">
              {validationStatus.canComplete ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-md">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-green-700 whitespace-nowrap">
                    Все проверки пройдены
                  </span>
                </div>
              ) : (
                <button
                  onClick={onSelectFirstError}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors cursor-pointer"
                  title="Кликните чтобы перейти к проблемному объекту"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-red-700 whitespace-nowrap">
                    {itemsWithErrors} {itemsWithErrors === 1 ? 'объект требует' : itemsWithErrors > 1 && itemsWithErrors < 5 ? 'объекта требуют' : 'объектов требуют'} внимания
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Индикатор несохраненных изменений - только в edit режиме */}
          {!readOnly && hasUnsavedChanges && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md flex-shrink-0">
              <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span className="text-sm font-medium text-blue-700 whitespace-nowrap">
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
              className="flex-shrink-0"
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

