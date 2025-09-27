'use client'

import { useEffect, useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar, ChevronDown, X } from 'lucide-react'
import { SimpleCalendar } from '@/components/ui/simple-calendar'

interface DateRangeFilterProps {
  label: string
  fromValue: string
  toValue: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  availableDates?: string[]
}

type DateMode = 'single' | 'range'

export function DateRangeFilter({
  label,
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  availableDates
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

            <div className="space-y-2">
              <Label className="text-xs text-gray-500">{mode === 'single' ? 'Дата' : 'Период'}</Label>
              <div className={mode === 'range' ? 'grid grid-cols-2 gap-3' : ''}>
                <SimpleCalendar
                  month={tempFrom ? new Date(`${tempFrom}T00:00:00Z`) : new Date()}
                  mode={mode}
                  selectedFrom={tempFrom}
                  selectedTo={tempTo}
                  availableDates={availableDates}
                  onSelect={(iso) => {
                    if (mode === 'single') {
                      setTempFrom(iso)
                      setTempTo(iso)
                    } else {
                      if (!tempFrom || (tempFrom && tempTo)) {
                        setTempFrom(iso)
                        setTempTo('')
                      } else if (iso < tempFrom) {
                        setTempTo(tempFrom)
                        setTempFrom(iso)
                      } else {
                        setTempTo(iso)
                      }
                    }
                  }}
                />
                {mode === 'range' && (
                  <SimpleCalendar
                    month={(() => {
                      const base = tempFrom ? new Date(`${tempFrom}T00:00:00Z`) : new Date()
                      return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1))
                    })()}
                    mode={mode}
                    selectedFrom={tempFrom}
                    selectedTo={tempTo}
                    availableDates={availableDates}
                    onSelect={(iso) => {
                      if (!tempFrom || (tempFrom && tempTo)) {
                        setTempFrom(iso)
                        setTempTo('')
                      } else if (iso < tempFrom) {
                        setTempTo(tempFrom)
                        setTempFrom(iso)
                      } else {
                        setTempTo(iso)
                      }
                    }}
                  />
                )}
              </div>
            </div>

            {availableDates && availableDates.length > 0 && (
              <div className="pt-1 text-[10px] text-gray-500">Подсветка на календаре показывает доступные даты</div>
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
