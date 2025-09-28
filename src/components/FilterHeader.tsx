'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { FilterValues } from '@/hooks/useFilters'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { MultiSelectFilter } from './filters/MultiSelectFilter'
import { DateRangeFilter } from './filters/DateRangeFilter'
import { X, Filter, Download } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface FilterOptions {
  device_canteen_names: string[]
  states: string[]
}

interface FilterHeaderProps {
  filters: FilterValues
  onUpdateFilter: <K extends keyof FilterValues>(key: K, value: FilterValues[K]) => void
  onResetFilters: () => void
  hasActiveFilters: boolean
  totalCount: number
  onExport?: () => void
}

export function FilterHeader({ 
  filters, 
  onUpdateFilter, 
  onResetFilters, 
  hasActiveFilters,
  totalCount,
  onExport
}: FilterHeaderProps) {
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)

  // Локальное состояние поля EAN + дебаунс для обновления фильтра
  const [eanInput, setEanInput] = useState(filters.ean_search)
  useEffect(() => {
    setEanInput(filters.ean_search)
  }, [filters.ean_search])
  const debouncedEanInput = useDebouncedValue(eanInput, 300)
  useEffect(() => {
    if (debouncedEanInput !== filters.ean_search) {
      onUpdateFilter('ean_search', debouncedEanInput)
    }
  }, [debouncedEanInput, filters.ean_search, onUpdateFilter])

  // Загрузка опций для фильтров
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const response = await fetch('/api/filter-options')
        if (response.ok) {
          const options = await response.json()
          setFilterOptions(options)
        }
      } catch (error) {
        console.error('Failed to load filter options:', error)
      }
    }

    loadFilterOptions()
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
    <div className="sticky top-0 z-50">
      {/* Верхняя полоса: тёмный фон, тайтл и вкладки */}
      <div className="bg-black text-white">
        <div className="max-w-7xl mx-auto px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-semibold whitespace-nowrap">RRS data labeling</h1>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium border-b-2 border-white pb-0.5">Clarifications</span>
              <span className="text-sm opacity-50 cursor-not-allowed select-none">Orders</span>
            </div>
          </div>
        </div>
      </div>

      {/* Вторая полоса: фильтры на светлом фоне */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Левая часть - счетчик и фильтр-иконка */}
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

            {/* Средняя часть - компактные фильтры */}
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
                  onCheckedChange={(checked) => 
                    onUpdateFilter('has_assistant_events', checked ? true : null)
                  }
                />
                <Label htmlFor="assistant_yes" className="text-xs">Да</Label>
                
                <Checkbox
                  id="assistant_no"
                  checked={filters.has_assistant_events === false}
                  onCheckedChange={(checked) => 
                    onUpdateFilter('has_assistant_events', checked ? false : null)
                  }
                />
                <Label htmlFor="assistant_no" className="text-xs">Нет</Label>
              </div>
            </div>

            {/* Поиск + режим */}
            <div className="flex items-center gap-2 w-[420px] max-w-full">
              <Input
                value={eanInput}
                onChange={(e) => setEanInput(e.target.value)}
                placeholder="Поиск по EAN"
                className="h-9 text-sm flex-1"
              />
              <Select defaultValue="ean" disabled>
                <SelectTrigger size="sm" className="h-9">
                  <SelectValue aria-label="search-mode">EAN</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ean">EAN</SelectItem>
                  <SelectItem value="pos" disabled>POS</SelectItem>
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
            {/* Правая часть - действия */}
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onResetFilters}
                  className="text-red-600 hover:bg-red-50 h-8 px-2"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
              
              <Button 
                className="bg-green-600 hover:bg-green-700 h-8 px-3 text-sm"
                disabled={totalCount === 0}
                onClick={onExport}
                title="Download"
              >
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
