'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface DateRangeFilterProps {
  label: string
  fromValue: string
  toValue: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
}

export function DateRangeFilter({
  label,
  fromValue,
  toValue,
  onFromChange,
  onToChange
}: DateRangeFilterProps) {
  return (
    <div className="space-y-2">
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <div className="grid grid-cols-2 gap-2">
        <div className={label ? "space-y-1" : ""}>
          {label && (
            <Label htmlFor={`${label}-from`} className="text-xs text-gray-500">
              От
            </Label>
          )}
          <Input
            id={`${label}-from`}
            type="date"
            value={fromValue}
            onChange={(e) => onFromChange(e.target.value)}
            className={`w-full ${!label ? 'h-8 text-sm' : ''}`}
            placeholder={!label ? "От" : undefined}
          />
        </div>
        <div className={label ? "space-y-1" : ""}>
          {label && (
            <Label htmlFor={`${label}-to`} className="text-xs text-gray-500">
              До
            </Label>
          )}
          <Input
            id={`${label}-to`}
            type="date"
            value={toValue}
            onChange={(e) => onToChange(e.target.value)}
            className={`w-full ${!label ? 'h-8 text-sm' : ''}`}
            placeholder={!label ? "До" : undefined}
          />
        </div>
      </div>
    </div>
  )
}
