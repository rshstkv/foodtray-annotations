'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
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

interface StepFilter {
  enabled: boolean
  status: StepStatus
}

interface ExportFiltersProps {
  users: User[]
  selectedUserIds: Set<string>
  onUserIdsChange: (userIds: Set<string>) => void
  validationStepFilters: Map<ValidationType, StepFilter>
  onValidationStepFilterChange: (type: ValidationType, filter: StepFilter) => void
  onApply: () => void
  loading?: boolean
  previewCount?: number
}

export function ExportFilters({
  users,
  selectedUserIds,
  onUserIdsChange,
  validationStepFilters,
  onValidationStepFilterChange,
  onApply,
  loading = false,
  previewCount,
}: ExportFiltersProps) {
  const [userSelectOpen, setUserSelectOpen] = useState(false)

  const toggleUser = (userId: string) => {
    const newSet = new Set(selectedUserIds)
    if (newSet.has(userId)) {
      newSet.delete(userId)
    } else {
      newSet.add(userId)
    }
    onUserIdsChange(newSet)
  }

  const toggleStepEnabled = (type: ValidationType) => {
    const current = validationStepFilters.get(type) || { enabled: false, status: 'completed' }
    onValidationStepFilterChange(type, { ...current, enabled: !current.enabled })
  }

  const setStepStatus = (type: ValidationType, status: StepStatus) => {
    const current = validationStepFilters.get(type) || { enabled: false, status: 'completed' }
    onValidationStepFilterChange(type, { ...current, status })
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
    Array.from(validationStepFilters.values()).some(filter => filter.enabled)
  
  const selectedUsers = users.filter(u => selectedUserIds.has(u.id))

  return (
    <Card className="p-6 rounded-xl shadow-sm">
      <div className="space-y-6">
        {/* User Filter - Multiselect Dropdown */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-2 block">
            Фильтр по пользователям
          </Label>
          
          {/* Selected users badges */}
          {selectedUserIds.size > 0 && (
            <div className="flex flex-wrap gap-1 mb-2 p-2 bg-gray-50 rounded-md border">
              {selectedUsers.map(user => (
                <Badge key={user.id} variant="secondary" className="gap-1">
                  {user.email}
                  <button
                    onClick={() => clearUser(user.id)}
                    className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                    type="button"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          
          <Popover open={userSelectOpen} onOpenChange={setUserSelectOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={userSelectOpen}
                className="w-full justify-between"
              >
                <span className="text-gray-700">
                  {selectedUserIds.size === 0 
                    ? 'Выберите пользователей...' 
                    : `Выбрано: ${selectedUserIds.size}`}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[500px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Поиск пользователя..." />
                <CommandEmpty>Пользователи не найдены.</CommandEmpty>
                <CommandGroup className="max-h-64 overflow-auto">
                  {users.map((user) => (
                    <CommandItem
                      key={user.id}
                      value={user.email}
                      onSelect={() => {
                        toggleUser(user.id)
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selectedUserIds.has(user.id) ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="flex-1">{user.email}</span>
                      {user.recognitions_count !== undefined && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          {user.recognitions_count}
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-2 mt-2">
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

        {/* Validation Steps Filter */}
        <div>
          <Label className="text-sm font-semibold text-gray-900 mb-3 block">
            Фильтр по этапам валидации
          </Label>
          <div className="space-y-3">
            {VALIDATION_TYPES.map(type => {
              const filter = validationStepFilters.get(type) || { enabled: false, status: 'completed' }
              return (
                <div key={type} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={filter.enabled}
                      onCheckedChange={() => toggleStepEnabled(type)}
                    />
                    <span className="text-sm text-gray-700 w-28">
                      {VALIDATION_TYPE_LABELS[type]}
                    </span>
                  </label>
                  <div className="flex gap-2">
                    {(['completed', 'skipped', 'any'] as StepStatus[]).map(status => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setStepStatus(type, status)}
                        disabled={!filter.enabled}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          filter.enabled && filter.status === status
                            ? getStatusColor(status)
                            : filter.enabled
                            ? 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
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
            Отметьте этапы для фильтрации и выберите статус. По умолчанию: "Завершен".
          </p>
        </div>

        {/* Preview and Apply */}
        <div className="pt-4 border-t space-y-3">
          {previewCount !== undefined && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900">
                {previewCount > 0 ? (
                  <>Будет выгружено: <span className="text-lg font-bold">{previewCount}</span> recognitions</>
                ) : (
                  'Нет данных для выгрузки с текущими фильтрами'
                )}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between">
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
      </div>
    </Card>
  )
}

