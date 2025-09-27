'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface NumberRangeFilterProps {
  label: string
  fromValue: number | null
  toValue: number | null
  onFromChange: (value: number | null) => void
  onToChange: (value: number | null) => void
}

export function NumberRangeFilter({
  label,
  fromValue,
  toValue,
  onFromChange,
  onToChange
}: NumberRangeFilterProps) {
  const handleFromChange = (value: string) => {
    if (value === '') {
      onFromChange(null)
    } else {
      const num = parseInt(value)
      if (!isNaN(num)) {
        onFromChange(num)
      }
    }
  }

  const handleToChange = (value: string) => {
    if (value === '') {
      onToChange(null)
    } else {
      const num = parseInt(value)
      if (!isNaN(num)) {
        onToChange(num)
      }
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${label}-from`} className="text-xs text-gray-500">
            От
          </Label>
          <Input
            id={`${label}-from`}
            type="number"
            min="0"
            value={fromValue ?? ''}
            onChange={(e) => handleFromChange(e.target.value)}
            placeholder="0"
            className="w-full"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${label}-to`} className="text-xs text-gray-500">
            До
          </Label>
          <Input
            id={`${label}-to`}
            type="number"
            min="0"
            value={toValue ?? ''}
            onChange={(e) => handleToChange(e.target.value)}
            placeholder="∞"
            className="w-full"
          />
        </div>
      </div>
    </div>
  )
}
