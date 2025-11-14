'use client'

import type { ValidationType } from '@/types/domain'
import { VALIDATION_TYPE_LABELS } from '@/types/domain'

interface ValidationSessionHeaderProps {
  recognitionId: number
  validationType: ValidationType
}

export function ValidationSessionHeader({
  recognitionId,
  validationType,
}: ValidationSessionHeaderProps) {
  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Recognition #{recognitionId}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {VALIDATION_TYPE_LABELS[validationType]}
          </p>
        </div>
      </div>
    </div>
  )
}

