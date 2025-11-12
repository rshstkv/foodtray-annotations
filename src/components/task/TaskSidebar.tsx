'use client'

import { StepContext } from '@/types/annotations'
import { taskStepLabels } from '@/styles/design-tokens'

interface TaskSidebarProps {
  currentStep: StepContext
  children: React.ReactNode
}

export function TaskSidebar({ currentStep, children }: TaskSidebarProps) {
  const stepLabel = taskStepLabels[currentStep.step.id as keyof typeof taskStepLabels] || currentStep.step.name

  return (
    <aside className="w-96 border-r border-gray-200 bg-white p-6 overflow-y-auto">
      {/* Step header */}
      <div className="mb-6">
        <div className="text-sm text-gray-500 mb-1">
          Этап {currentStep.stepIndex + 1}
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          {stepLabel}
        </h2>
      </div>

      {/* Dynamic content based on step */}
      {children}
    </aside>
  )
}

