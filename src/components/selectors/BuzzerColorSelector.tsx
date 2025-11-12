'use client'

import { buzzerColors } from '@/styles/design-tokens'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface BuzzerColorSelectorProps {
  value: string | null
  onChange: (color: string) => void
}

const colorEmojis: Record<string, string> = {
  red: '🔴',
  green: '🟢',
  blue: '🔵',
  white: '⚪',
}

const colorLabels: Record<string, string> = {
  red: 'Красный',
  green: 'Зеленый',
  blue: 'Синий',
  white: 'Белый',
}

export function BuzzerColorSelector({ value, onChange }: BuzzerColorSelectorProps) {
  return (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs w-32">
        <SelectValue placeholder="Цвет" />
      </SelectTrigger>
      <SelectContent>
        {Object.keys(buzzerColors).map((color) => (
          <SelectItem key={color} value={color} className="text-xs">
            {colorEmojis[color]} {colorLabels[color]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

