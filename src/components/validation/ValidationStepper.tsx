'use client'

import { ValidationStep } from '@/types/domain'
import { VALIDATION_TYPE_LABELS } from '@/types/domain'
import { Check } from 'lucide-react'

interface ValidationStepperProps {
  steps: ValidationStep[]
  currentStepIndex: number
}

export function ValidationStepper({ steps, currentStepIndex }: ValidationStepperProps) {
  if (!steps || steps.length === 0) {
    return null
  }

  return (
    <div className="bg-white border-b border-gray-200 py-2 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-center gap-2">
          {steps.map((step, index) => {
            const isCurrent = index === currentStepIndex
            const isCompleted = step.status === 'completed'
            const isPending = step.status === 'pending'

            return (
              <div key={index} className="flex items-center">
                {/* Step Circle + Label */}
                <div className="flex items-center gap-2">
                  <div
                    className={`
                      w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0
                      ${isCompleted ? 'bg-green-500 text-white' : ''}
                      ${isCurrent ? 'bg-blue-500 text-white ring-2 ring-blue-200' : ''}
                      ${isPending ? 'bg-gray-200 text-gray-500' : ''}
                    `}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium whitespace-nowrap ${
                      isCurrent ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500'
                    }`}
                  >
                    {VALIDATION_TYPE_LABELS[step.type]}
                  </span>
                </div>

                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div className="w-8 h-0.5 mx-2">
                    <div
                      className={`h-full ${
                        isCompleted ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                  </div>
                )}
              </div>
            )
          })}
          
          {/* Progress Counter - inline */}
          <span className="text-xs text-gray-500 ml-3">
            ({currentStepIndex + 1}/{steps.length})
          </span>
        </div>
      </div>
    </div>
  )
}

