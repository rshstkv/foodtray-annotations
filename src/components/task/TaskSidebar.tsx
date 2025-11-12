'use client'

import { StepContext } from '@/types/annotations'
import { taskStepLabels } from '@/styles/design-tokens'

interface TaskSidebarProps {
  currentStep: StepContext
  children: React.ReactNode
}

// Подсказки для каждого этапа
const stepHints: Record<string, string> = {
  check_overlaps: 'Клик на картинку = выбор • ←→ = смена картинки • 1-9 и ↑↓ = навигация • O = переключить',
  validate_dishes: 'Проверьте соответствие блюд из чека',
  validate_plates: 'Отметьте все тарелки на фото',
  validate_buzzers: 'Отметьте буззеры и их цвета',
}

export function TaskSidebar({ currentStep, children }: TaskSidebarProps) {
  const stepLabel = taskStepLabels[currentStep.step.id as keyof typeof taskStepLabels] || currentStep.step.name
  const hint = stepHints[currentStep.step.id]

  return (
    <aside className="w-96 border-r border-gray-200 bg-white p-6 overflow-y-auto">
      {/* Step header */}
      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">
          Этап {currentStep.stepIndex + 1}
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          {stepLabel}
        </h2>
        {hint && (
          <p className="text-xs text-gray-600 leading-relaxed">
            {hint}
          </p>
        )}
      </div>

      {/* Dynamic content based on step */}
      {children}
    </aside>
  )
}

