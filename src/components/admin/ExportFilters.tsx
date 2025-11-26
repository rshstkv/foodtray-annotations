'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'
import type { ValidationType } from '@/types/domain'

const VALIDATION_TYPES: ValidationType[] = [
  'FOOD_VALIDATION',
  'PLATE_VALIDATION',
  'BUZZER_VALIDATION',
  'OCCLUSION_VALIDATION',
  'BOTTLE_ORIENTATION_VALIDATION',
]

const VALIDATION_TYPE_LABELS: Record<ValidationType, string> = {
  FOOD_VALIDATION: 'Блюда',
  PLATE_VALIDATION: 'Тарелки',
  BUZZER_VALIDATION: 'Пейджеры',
  OCCLUSION_VALIDATION: 'Окклюзии',
  BOTTLE_ORIENTATION_VALIDATION: 'Ориентация',
}

type StepStatus = 'any' | 'completed' | 'skipped'

const STATUS_LABELS: Record<StepStatus, string> = {
  any: 'Любой',
  completed: 'Завершен',
  skipped: 'Пропущен',
}

interface User {
  id: string
  email: string
  recognitions_count?: number
}

interface ExportFiltersProps {
  users: User[]
  selectedUserIds: Set<string>
  onUserIdsChange: (userIds: Set<string>) => void
  validationStepStatuses: Map<ValidationType, StepStatus>
  onValidationStepStatusChange: (type: ValidationType, status: StepStatus) => void
  onApply: () => void
  loading?: boolean
}

export function ExportFilters({
  users,
  selectedUserIds,
  onUserIdsChange,
  validationStepStatuses,
  onValidationStepStatusChange,
  onApply,
  loading = false,
}: ExportFiltersProps) {

  const toggleUser = (userId: string) => {
    const newSet = new Set(selectedUserIds)
    if (newSet.has(userId)) {
      newSet.delete(userId)
    } else {
      newSet.add(userId)
    }
    onUserIdsChange(newSet)
  }

  const getStatusColor = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-300 text-green-700'
      case 'skipped':
        return 'bg-orange-50 border-orange-300 text-orange-700'
      default:
        return 'bg-gray-50 border-gray-300 text-gray-700'
    }
  }

  const selectAllUsers = () => {
    onUserIdsChange(new Set(users.map(u => u.id)))
  }

  const deselectAllUsers = () => {
    onUserIdsChange(new Set())
  }

  const clearUser = (userId: string) => {
    const newSet = new Set(selectedUserIds)
    newSet.delete(userId)
    onUserIdsChange(newSet)
  }

  const hasActiveFilters = selectedUserIds.size > 0 || 
    Array.from(validationStepStatuses.values()).some(status => status !== 'any')

  return (
    <Card className="p-6 rounded-xl shadow-sm">
      <div className="space-y-6">
        {/* User Filter */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-semibold text-gray-900">
              Фильтр по пользователям
            </Label>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAllUsers}
                disabled={loading}
                className="h-7 text-xs"
              >
                Выбрать всех
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={deselectAllUsers}
                disabled={loading}
                className="h-7 text-xs"
              >
                Сбросить
              </Button>
            </div>
          </div>

          {/* Selected users as chips */}
          {selectedUserIds.size > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {Array.from(selectedUserIds).map(userId => {
                const user = users.find(u => u.id === userId)
                if (!user) return null
                return (
                  <div
                    key={userId}
                    className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-sm"
                  >
                    <span>{user.email}</span>
                    {user.recognitions_count && (
                      <span className="text-xs opacity-75">
                        ({user.recognitions_count})
                      </span>
                    )}
                    <button
                      onClick={() => clearUser(userId)}
                      className="ml-1 hover:bg-blue-200 rounded p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* User checkboxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-gray-50 rounded-lg">
            {users.map(user => (
              <label
                key={user.id}
                className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <Checkbox
                  checked={selectedUserIds.has(user.id)}
                  onCheckedChange={() => toggleUser(user.id)}
                />
                <span className="text-sm flex-1 truncate" title={user.email}>
                  {user.email}
                </span>
                {user.recognitions_count !== undefined && (
                  <span className="text-xs text-gray-500">
                    {user.recognitions_count}
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Validation Steps Filter */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">
            Фильтр по этапам валидации
          </Label>
          <div className="space-y-2">
            {VALIDATION_TYPES.map(type => {
              const currentStatus = validationStepStatuses.get(type) || 'any'
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-32">
                    {VALIDATION_TYPE_LABELS[type]}:
                  </span>
                  <div className="flex gap-2">
                    {(['any', 'completed', 'skipped'] as StepStatus[]).map(status => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => onValidationStepStatusChange(type, status)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          currentStatus === status
                            ? getStatusColor(status)
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {STATUS_LABELS[status]}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Выберите требуемый статус для каждого этапа. "Любой" - включает recognitions с любым статусом этапа.
          </p>
        </div>

        {/* Apply Button */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-600">
            {hasActiveFilters ? (
              <span>Фильтры активны</span>
            ) : (
              <span>Фильтры не применены</span>
            )}
          </div>
          <Button
            onClick={onApply}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? 'Загрузка...' : 'Применить фильтры'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

