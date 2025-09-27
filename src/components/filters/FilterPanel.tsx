'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { FilterValues } from '@/hooks/useFilters'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { MultiSelectFilter } from './MultiSelectFilter'
import { DateRangeFilter } from './DateRangeFilter'
import { ChevronDown, ChevronUp, X, Filter } from 'lucide-react'

interface FilterOptions {
  device_canteen_names: string[]
  states: string[]
}

interface FilterPanelProps {
  filters: FilterValues
  onUpdateFilter: <K extends keyof FilterValues>(key: K, value: FilterValues[K]) => void
  onResetFilters: () => void
  hasActiveFilters: boolean
  totalCount: number
}

export function FilterPanel({ 
  filters, 
  onUpdateFilter, 
  onResetFilters, 
  hasActiveFilters,
  totalCount 
}: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [availableDates, setAvailableDates] = useState<string[] | null>(null)
  const [isLoadingDates, setIsLoadingDates] = useState(false)

  // Debounced поиск по EAN
  const debouncedEanSearch = useDebouncedValue(filters.ean_search, 300)

  useEffect(() => {
    if (debouncedEanSearch !== filters.ean_search) {
      onUpdateFilter('ean_search', debouncedEanSearch)
    }
  }, [debouncedEanSearch, filters.ean_search, onUpdateFilter])

  // Загрузка опций для фильтров
  useEffect(() => {
    const loadFilterOptions = async () => {
      setIsLoadingOptions(true)
      try {
        const response = await fetch('/api/filter-options')
        if (response.ok) {
          const options = await response.json()
          setFilterOptions(options)
        }
      } catch (error) {
        console.error('Failed to load filter options:', error)
      } finally {
        setIsLoadingOptions(false)
      }
    }

    loadFilterOptions()
  }, [])

  // Построение query-параметров для available-dates
  const availableDatesQuery = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value === null || value === undefined) return
      if (Array.isArray(value)) {
        if (value.length > 0) params.set(key, value.join(','))
      } else if (typeof value === 'boolean') {
        params.set(key, String(value))
      } else if (typeof value === 'string' && value !== '') {
        params.set(key, value)
      }
    })
    return params.toString()
  }, [filters])

  // Загрузка доступных дат при изменении фильтров
  useEffect(() => {
    let cancelled = false
    const loadDates = async () => {
      setIsLoadingDates(true)
      try {
        const url = availableDatesQuery
          ? `/api/available-dates?${availableDatesQuery}`
          : '/api/available-dates'
        const response = await fetch(url)
        if (!response.ok) return
        const json = await response.json()
        if (!cancelled) setAvailableDates(Array.isArray(json.dates) ? json.dates : [])
      } catch (e) {
        if (!cancelled) setAvailableDates([])
      } finally {
        if (!cancelled) setIsLoadingDates(false)
      }
    }
    loadDates()
    return () => {
      cancelled = true
    }
  }, [availableDatesQuery])

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
    <Card className="mb-6">
      {/* Заголовок панели фильтров */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <h3 className="text-lg font-semibold">Фильтры</h3>
              {getActiveFiltersCount() > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {getActiveFiltersCount()}
                </Badge>
              )}
            </div>
            <div className="text-sm text-gray-600">
              Найдено записей: <span className="font-medium">{totalCount.toLocaleString()}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={onResetFilters}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <X className="w-4 h-4 mr-1" />
                Сбросить
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="md:hidden"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-1" />
                  Скрыть
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 mr-1" />
                  Показать
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Содержимое фильтров */}
      <div className={`${isExpanded ? 'block' : 'hidden'} md:block transition-all duration-200`}>
        <div className="p-4 space-y-6">
          {isLoadingOptions ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  <div className="h-8 bg-gray-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                availableDates={availableDates || undefined}
              />

              <div className="space-y-2">
                <Label className="text-sm font-medium">Есть события ассистента</Label>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="has_assistant_events_true"
                      checked={filters.has_assistant_events === true}
                      onCheckedChange={(checked) => 
                        onUpdateFilter('has_assistant_events', checked ? true : null)
                      }
                    />
                    <Label htmlFor="has_assistant_events_true" className="text-sm">Да</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="has_assistant_events_false"
                      checked={filters.has_assistant_events === false}
                      onCheckedChange={(checked) => 
                        onUpdateFilter('has_assistant_events', checked ? false : null)
                      }
                    />
                    <Label htmlFor="has_assistant_events_false" className="text-sm">Нет</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ean_search" className="text-sm font-medium">
                  Поиск по EAN
                </Label>
                <Input
                  id="ean_search"
                  value={filters.ean_search}
                  onChange={(e) => onUpdateFilter('ean_search', e.target.value)}
                  placeholder="Введите EAN код"
                  className="w-full"
                />
              </div>

              <MultiSelectFilter
                label="Состояние"
                value={filters.state}
                options={filterOptions?.states || []}
                onChange={(value) => onUpdateFilter('state', value)}
                placeholder="Выберите состояния"
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
