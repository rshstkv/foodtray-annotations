'use client'

import { Button } from '@/components/ui/button'

interface BottleOrientationSelectorProps {
  value: boolean | null  // true = vertical, false = horizontal
  onChange: (vertical: boolean) => void
}

export function BottleOrientationSelector({ 
  value, 
  onChange 
}: BottleOrientationSelectorProps) {
  return (
    <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1">
      <Button
        size="sm"
        variant={value === true ? 'default' : 'ghost'}
        onClick={() => onChange(true)}
        className="h-7 text-xs"
      >
        ↕️ Вертик.
      </Button>
      <Button
        size="sm"
        variant={value === false ? 'default' : 'ghost'}
        onClick={() => onChange(false)}
        className="h-7 text-xs"
      >
        ↔️ Гориз.
      </Button>
    </div>
  )
}

