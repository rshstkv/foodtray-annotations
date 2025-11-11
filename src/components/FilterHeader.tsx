'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { FilterValues } from '@/hooks/useFilters'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { MultiSelectFilter } from './filters/MultiSelectFilter'
import { DateRangeFilter } from './filters/DateRangeFilter'
import { Filter, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader as UIDialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserNav } from '@/components/UserNav'

interface FilterOptions {
  device_canteen_names: string[]
  states: string[]
  freq_buckets?: string[]
}

interface FilterHeaderProps {
  filters: FilterValues
  onUpdateFilter: <K extends keyof FilterValues>(key: K, value: FilterValues[K]) => void
  onResetFilters: () => void
  hasActiveFilters: boolean
  totalCount: number
}

export function FilterHeader({
  filters,
  onUpdateFilter,
  onResetFilters,
  hasActiveFilters,
  totalCount
}: FilterHeaderProps) {
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const pathname = usePathname()

  // Локальное состояние для EAN поиска (дебаунс обновляет фильтр)
  const [eanInput, setEanInput] = useState(filters.ean_search)
  const [mode, setMode] = useState<'ean' | 'pos'>('ean')
  const isResettingRef = useRef(false)
  // Специальное значение для "Все частоты"
  const ALL_FREQ_VALUE = '__all__'
  const freqSelectValue = filters.freq_bucket && filters.freq_bucket.length > 0 ? filters.freq_bucket : ALL_FREQ_VALUE
  useEffect(() => {
    setEanInput(mode === 'ean' ? filters.ean_search : filters.pos_search)
  }, [filters.ean_search, filters.pos_search, mode])
  const debouncedInput = useDebouncedValue(eanInput, 300)
  useEffect(() => {
    if (isResettingRef.current) {
      return
    }
    if (mode === 'ean') {
      if (debouncedInput !== filters.ean_search) onUpdateFilter('ean_search', debouncedInput)
    } else {
      if (debouncedInput !== filters.pos_search) onUpdateFilter('pos_search', debouncedInput)
    }
  }, [debouncedInput, mode, filters.ean_search, filters.pos_search, onUpdateFilter])

  // Единая функция сброса, очищает локальное поле поиска
  const handleResetFilters = () => {
    // Явно очищаем оба параметра поиска, чтобы они ушли из URL немедленно
    isResettingRef.current = true
    onUpdateFilter('ean_search', '')
    onUpdateFilter('pos_search', '')
    setEanInput('')
    onResetFilters()
    // Снимаем флаг после завершения цикла рендера
    setTimeout(() => {
      isResettingRef.current = false
    }, 0)
  }

  // Загрузка опций
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/filter-options')
        if (res.ok) {
          const data = await res.json()
          setFilterOptions(data)
        }
      } catch (e) {
        console.error('Failed to load filter options:', e)
      }
    }
    load()
  }, [])

  const getActiveFiltersCount = () => {
    let count = 0
    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'ean_search' && value) count++
      else if (Array.isArray(value) && value.length > 0) count++
      else if (typeof value === 'boolean' && value !== null) count++
      else if (typeof value === 'string' && value !== '') count++
    })
    return count
  }

  return (
    <div className="sticky top-0 z-40">
      {/* Первая полоса (хедер) */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between">
          {/* Левая часть: логотип/название */}
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-base md:text-xl font-semibold whitespace-nowrap">RRS data labeling</h1>
            <nav className="flex items-center gap-3">
              <Link
                href="/"
                className={`text-xs md:text-sm font-medium pb-0.5 border-b-2 transition-colors ${
                  pathname === '/' ? 'border-blue-600 text-blue-600' : 'border-transparent opacity-80 hover:opacity-100'
                }`}
              >
                Clarifications
              </Link>
              <Link
                href="/annotations"
                className={`text-xs md:text-sm font-medium pb-0.5 border-b-2 transition-colors ${
                  pathname?.startsWith('/annotations') ? 'border-blue-600 text-blue-600' : 'border-transparent opacity-80 hover:opacity-100'
                }`}
              >
                BBox Annotations
              </Link>
              <span
                className="text-xs md:text-sm opacity-50 cursor-not-allowed select-none"
                aria-disabled
              >
                Orders
              </span>
            </nav>
          </div>

          {/* Правая часть: быстрые ссылки и пользователь */}
          <div className="flex items-center gap-3">
            <UserNav />
          </div>
        </div>
      </div>

      {/* Вторая полоса (фильтры) */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-5 py-2 md:py-3">
          {/* Мобильная компактная панель */}
          <div className="md:hidden flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Filter className="w-4 h-4 text-gray-500" />
              {getActiveFiltersCount() > 0 && (
                <Badge variant="secondary" className="text-[11px]">
                  {getActiveFiltersCount()}
                </Badge>
              )}
            </div>

            <div className="text-xs text-gray-600 whitespace-nowrap">
              {totalCount.toLocaleString()} записей
            </div>

            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="text-red-600 hover:bg-red-50 h-8 px-2"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFilterModalOpen(true)}
                className="h-8 px-3"
              >
                <Filter className="w-4 h-4 mr-1" />
                Фильтры
                {getActiveFiltersCount() > 0 && (
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {getActiveFiltersCount()}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {/* Десктопная панель с детальными фильтрами */}
          <div className="hidden md:flex items-center justify-between gap-4">
            {/* Левая часть: счетчик */}
            <div className="flex items-center gap-2 min-w-0">
              <Filter className="w-4 h-4 text-gray-500" />
              {getActiveFiltersCount() > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {getActiveFiltersCount()}
                </Badge>
              )}
              <span className="text-sm text-gray-600 whitespace-nowrap">
                {totalCount.toLocaleString()} записей
              </span>
            </div>

            {/* Центр: фильтры */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-48">
                <MultiSelectFilter
                  label=""
                  value={filters.device_canteen_name}
                  options={filterOptions?.device_canteen_names || []}
                  onChange={(value) => onUpdateFilter('device_canteen_name', value)}
                  placeholder="Столовые"
                  maxDisplayItems={1}
                />
              </div>

              <div className="w-64">
                <DateRangeFilter
                  label=""
                  fromValue={filters.start_dtts_from}
                  toValue={filters.start_dtts_to}
                  onFromChange={(value) => onUpdateFilter('start_dtts_from', value)}
                  onToChange={(value) => onUpdateFilter('start_dtts_to', value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs text-gray-600 whitespace-nowrap">Ассистент:</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="assistant_yes"
                    checked={filters.has_assistant_events === true}
                    onCheckedChange={(checked) => onUpdateFilter('has_assistant_events', checked ? true : null)}
                  />
                  <Label htmlFor="assistant_yes" className="text-xs">Да</Label>
                  <Checkbox
                    id="assistant_no"
                    checked={filters.has_assistant_events === false}
                    onCheckedChange={(checked) => onUpdateFilter('has_assistant_events', checked ? false : null)}
                  />
                  <Label htmlFor="assistant_no" className="text-xs">Нет</Label>
                </div>
              </div>

              {/* Поиск + режим */}
              <div className="flex items-center gap-2 w-[520px] max-w-full">
                <Input
                  value={eanInput}
                  onChange={(e) => setEanInput(e.target.value)}
                  placeholder={mode === 'ean' ? 'Поиск по EAN' : 'Поиск по POS_TXN'}
                  className="h-9 text-sm flex-1"
                />
                <Select value={mode} onValueChange={(v) => setMode(v as 'ean' | 'pos')}>
                  <SelectTrigger size="sm" className="h-9 min-w-24">
                    <SelectValue aria-label="search-mode">{mode.toUpperCase()}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ean">EAN</SelectItem>
                    <SelectItem value="pos">POS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-32">
                <MultiSelectFilter
                  label=""
                  value={filters.state}
                  options={filterOptions?.states || []}
                  onChange={(value) => onUpdateFilter('state', value)}
                  placeholder="Состояние"
                  maxDisplayItems={1}
                />
              </div>

              {/* Частотный бакет */}
              <div className="w-40">
                <Select value={freqSelectValue} onValueChange={(v) => onUpdateFilter('freq_bucket', v === ALL_FREQ_VALUE ? '' : v)}>
                  <SelectTrigger size="sm" className="h-9">
                    <SelectValue placeholder="Частота" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FREQ_VALUE}>Все частоты</SelectItem>
                    {(filterOptions?.freq_buckets || ['очень частые','частые','средние','редкие']).map(b => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Правая часть: действия */}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="text-red-600 hover:bg-red-50 h-8 px-2"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Полноэкранный попап фильтров (мобильный) */}
      <Dialog open={isFilterModalOpen} onOpenChange={setIsFilterModalOpen}>
        <DialogContent className="p-0 w-screen h-[100dvh] max-w-none rounded-none">
          <div className="flex flex-col h-full">
            <UIDialogHeader className="px-4 py-3 border-b">
              <DialogTitle className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-600" />
                  <span>Фильтры</span>
                  {getActiveFiltersCount() > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {getActiveFiltersCount()}
                    </Badge>
                  )}
                </div>
                {/* Крестик оставляем только для закрытия (дефолтный от диалога) */}
              </DialogTitle>
            </UIDialogHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <MultiSelectFilter
                label="Столовая"
                value={filters.device_canteen_name}
                options={filterOptions?.device_canteen_names || []}
                onChange={(value) => onUpdateFilter('device_canteen_name', value)}
                placeholder="Выберите столовые"
              />

              <DateRangeFilter
                label="Дата заказа"
                fromValue={filters.start_dtts_from}
                toValue={filters.start_dtts_to}
                onFromChange={(value) => onUpdateFilter('start_dtts_from', value)}
                onToChange={(value) => onUpdateFilter('start_dtts_to', value)}
              />

              <div className="space-y-2">
                <Label className="text-sm font-medium">Есть события ассистента</Label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="assistant_yes_modal"
                      checked={filters.has_assistant_events === true}
                      onCheckedChange={(checked) => onUpdateFilter('has_assistant_events', checked ? true : null)}
                    />
                    <Label htmlFor="assistant_yes_modal" className="text-sm">Да</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="assistant_no_modal"
                      checked={filters.has_assistant_events === false}
                      onCheckedChange={(checked) => onUpdateFilter('has_assistant_events', checked ? false : null)}
                    />
                    <Label htmlFor="assistant_no_modal" className="text-sm">Нет</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Поиск</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={eanInput}
                    onChange={(e) => setEanInput(e.target.value)}
                    placeholder={mode === 'ean' ? 'Поиск по EAN' : 'Поиск по POS_TXN'}
                    className="h-10 text-sm flex-1"
                  />
                  <Select value={mode} onValueChange={(v) => setMode(v as 'ean' | 'pos')}>
                    <SelectTrigger className="h-10 min-w-24">
                      <SelectValue aria-label="search-mode">{mode.toUpperCase()}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ean">EAN</SelectItem>
                      <SelectItem value="pos">POS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <MultiSelectFilter
                label="Состояние"
                value={filters.state}
                options={filterOptions?.states || []}
                onChange={(value) => onUpdateFilter('state', value)}
                placeholder="Выберите состояния"
              />

              {/* Частота (мобильный попап) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Частота</Label>
                <Select
                  value={(filters.freq_bucket && filters.freq_bucket.length > 0) ? filters.freq_bucket : '__all__'}
                  onValueChange={(v) => onUpdateFilter('freq_bucket', v === '__all__' ? '' : v)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Частота" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Все частоты</SelectItem>
                    {(filterOptions?.freq_buckets || ['очень частые','частые','средние','редкие']).map(b => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="px-4 py-3 border-t flex gap-3">
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetFilters}
                  className="text-red-600 border-red-200 hover:bg-red-50 w-full"
                >
                  Сбросить
                </Button>
              )}
              <Button onClick={() => setIsFilterModalOpen(false)} className="w-full">Готово</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
