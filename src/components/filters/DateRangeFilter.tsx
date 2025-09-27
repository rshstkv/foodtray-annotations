'use client'

import { useEffect, useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar, ChevronDown, X } from 'lucide-react'

interface DateRangeFilterProps {
  label: string
  fromValue: string
  toValue: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
}

type DateMode = 'single' | 'range'

export function DateRangeFilter({
  label,
  fromValue,
  toValue,
  onFromChange,
  onToChange
}: DateRangeFilterProps) {
  const initialMode: DateMode = useMemo(() => {
    if (fromValue && toValue && fromValue === toValue) return 'single'
    if (fromValue && !toValue) return 'single'
    return 'range'
  }, [fromValue, toValue])

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<DateMode>(initialMode)
  const [tempFrom, setTempFrom] = useState<string>(fromValue || '')
  const [tempTo, setTempTo] = useState<string>(toValue || '')

  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setTempFrom(fromValue || '')
      setTempTo(toValue || '')
    }
  }, [open, initialMode, fromValue, toValue])

  const apply = () => {
    if (mode === 'single') {
      onFromChange(tempFrom || '')
      onToChange(tempFrom || '')
    } else {
      onFromChange(tempFrom || '')
      onToChange(tempTo || '')
    }
    setOpen(false)
  }

  const clearAll = () => {
    setTempFrom('')
    setTempTo('')
    onFromChange('')
    onToChange('')
    setOpen(false)
  }

  const formatDate = (iso: string) => {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    if (!y || !m || !d) return iso
    return `${d}.${m}.${y}`
  }

  const buttonText = useMemo(() => {
    if (!fromValue && !toValue) return 'Любая дата'
    if (fromValue && toValue) {
      if (fromValue === toValue) return formatDate(fromValue)
      return `${formatDate(fromValue)} — ${formatDate(toValue)}`
    }
    if (fromValue) return `С ${formatDate(fromValue)}`
    if (toValue) return `До ${formatDate(toValue)}`
    return 'Любая дата'
  }, [fromValue, toValue])

  return (
    <div className="space-y-2">
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between"
          >
            <span className="inline-flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {buttonText}
            </span>
            <ChevronDown className="w-4 h-4 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-md border bg-background">
              <Button
                type="button"
                variant={mode === 'single' ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full"
                onClick={() => setMode('single')}
              >
                Один день
              </Button>
              <Button
                type="button"
                variant={mode === 'range' ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full"
                onClick={() => setMode('range')}
              >
                Период
              </Button>
            </div>

            {mode === 'single' ? (
              <div className="space-y-2">
                <Label htmlFor="date-single" className="text-xs text-gray-500">
                  Дата
                </Label>
                <Input
                  id="date-single"
                  type="date"
                  value={tempFrom}
                  onChange={(e) => {
                    setTempFrom(e.target.value)
                    setTempTo(e.target.value)
                  }}
                  className="w-full"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="date-from" className="text-xs text-gray-500">
                    От
                  </Label>
                  <Input
                    id="date-from"
                    type="date"
                    value={tempFrom}
                    onChange={(e) => setTempFrom(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="date-to" className="text-xs text-gray-500">
                    До
                  </Label>
                  <Input
                    id="date-to"
                    type="date"
                    value={tempTo}
                    onChange={(e) => setTempTo(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAll}
              >
                <X className="w-4 h-4 mr-1" /> Очистить
              </Button>
              <Button type="button" size="sm" onClick={apply}>
                Применить
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
