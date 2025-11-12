'use client'

import { Check, Circle, Loader } from 'lucide-react'
import { StepContext } from '@/types/annotations'
import { cn } from '@/lib/utils'

interface StepIndicatorProps {
  steps: StepContext[]
  currentStepIndex: number
  onStepClick?: (stepIndex: number) => void
}

export function StepIndicator({ steps, currentStepIndex, onStepClick }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, index) => {
        const isActive = index === currentStepIndex
        const isCompleted = step.isCompleted
        const isPending = step.isPending
        
        return (
          <div key={step.step.id} className="flex items-center">
            <button
              onClick={() => onStepClick?.(index)}
              disabled={isPending && index > currentStepIndex}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                isActive && 'bg-blue-100 text-blue-900 ring-2 ring-blue-500',
                isCompleted && !isActive && 'bg-green-100 text-green-900',
                isPending && !isActive && 'bg-gray-100 text-gray-600',
                'hover:bg-opacity-80 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isCompleted && (
                <Check className="w-4 h-4 text-green-600" />
              )}
              {isActive && !isCompleted && (
                <Loader className="w-4 h-4 animate-spin text-blue-600" />
              )}
              {isPending && (
                <Circle className="w-4 h-4 text-gray-400" />
              )}
              
              <span>{step.step.name}</span>
            </button>
            
            {index < steps.length - 1 && (
              <div className={cn(
                'w-8 h-0.5 mx-1',
                isCompleted ? 'bg-green-600' : 'bg-gray-300'
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}



