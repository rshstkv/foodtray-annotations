'use client'

import { nonfoodSubtypes } from '@/styles/design-tokens'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface NonFoodSubtypeSelectorProps {
  value: string | null
  onChange: (subtype: string) => void
}

export function NonFoodSubtypeSelector({ value, onChange }: NonFoodSubtypeSelectorProps) {
  return (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs w-36">
        <SelectValue placeholder="Тип объекта" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(nonfoodSubtypes).map(([key, label]) => (
          <SelectItem key={key} value={key} className="text-xs">
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

