'use client'

import { useMemo } from 'react'

type Mode = 'single' | 'range'

export interface SimpleCalendarProps {
  month: Date
  mode: Mode
  selectedFrom?: string
  selectedTo?: string
  availableDates?: string[]
  onSelect: (iso: string) => void
}

// YYYY-MM-DD helpers
function toIsoUTC(d: Date): string {
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function endOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
}

function addDaysUTC(d: Date, days: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days))
}

function isBetween(iso: string, from?: string, to?: string) {
  if (!from || !to) return false
  return iso >= from && iso <= to
}

export function SimpleCalendar({
  month,
  mode,
  selectedFrom,
  selectedTo,
  availableDates,
  onSelect
}: SimpleCalendarProps) {
  const available = useMemo(() => new Set(availableDates || []), [availableDates])

  const days = useMemo(() => {
    const first = startOfMonthUTC(month)
    const last = endOfMonthUTC(month)
    const startWeekday = (first.getUTCDay() + 6) % 7 // Mon=0 ... Sun=6
    const gridStart = addDaysUTC(first, -startWeekday)
    const totalCells = 42 // 6 weeks
    const arr: { date: Date; iso: string; inMonth: boolean }[] = []
    for (let i = 0; i < totalCells; i++) {
      const d = addDaysUTC(gridStart, i)
      const iso = toIsoUTC(d)
      const inMonth = d.getUTCMonth() === month.getUTCMonth()
      arr.push({ date: d, iso, inMonth })
    }
    return arr
  }, [month])

  const monthName = useMemo(() => {
    return month.toLocaleString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }, [month])

  return (
    <div className="w-full">
      <div className="text-sm font-medium mb-2 capitalize">{monthName}</div>
      <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground mb-1">
        {['П','В','С','Ч','П','С','В'].map((w) => (
          <div key={w} className="text-center">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(({ date, iso, inMonth }) => {
          const isSelected = mode === 'single'
            ? selectedFrom && iso === selectedFrom
            : (selectedFrom && iso === selectedFrom) || (selectedTo && iso === selectedTo)
          const inRange = mode === 'range' && isBetween(iso, selectedFrom, selectedTo)
          const isAvailable = available.has(iso)
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              className={
                `h-8 rounded text-sm text-center transition-colors border ` +
                `${inMonth ? '' : 'opacity-40 '} ` +
                `${inRange ? 'bg-primary/10 ' : ''}` +
                `${isSelected ? 'bg-primary text-primary-foreground border-primary ' : 'bg-background '} ` +
                `${!isSelected && isAvailable ? 'ring-1 ring-primary/40 ' : ''} ` +
                `hover:bg-accent`
              }
            >
              {date.getUTCDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}


