import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export interface FilterValues {
  // Заказы
  device_canteen_name: string[]
  start_dtts_from: string
  start_dtts_to: string
  has_assistant_events: boolean | null

  // Поиск по EAN
  ean_search: string

  // Поиск по POS_TXN
  pos_search: string

  // Состояния
  state: string[]
}

const defaultFilters: FilterValues = {
  device_canteen_name: [],
  start_dtts_from: '',
  start_dtts_to: '',
  has_assistant_events: null,
  ean_search: '',
  pos_search: '',
  state: []
}

export function useFilters() {
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<FilterValues>(defaultFilters)
  const [isInitialized, setIsInitialized] = useState(false)

  // Загрузка фильтров из URL при инициализации
  useEffect(() => {
    if (!isInitialized) {
      const urlFilters = parseFiltersFromUrl(searchParams)
      setFilters(urlFilters)
      setIsInitialized(true)
    }
  }, [searchParams, isInitialized])

  // Обновление URL при изменении фильтров
  useEffect(() => {
    if (isInitialized) {
      const urlParams = buildUrlParams(filters)
      const currentUrl = new URL(window.location.href)
      currentUrl.search = urlParams.toString()
      
      // Используем replaceState чтобы не создавать новую запись в истории
      window.history.replaceState({}, '', currentUrl.toString())
    }
  }, [filters, isInitialized])

  const updateFilter = useCallback(<K extends keyof FilterValues>(
    key: K, 
    value: FilterValues[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(defaultFilters)
  }, [])

  const hasActiveFilters = useCallback(() => {
    return JSON.stringify(filters) !== JSON.stringify(defaultFilters)
  }, [filters])

  return {
    filters,
    updateFilter,
    resetFilters,
    hasActiveFilters: hasActiveFilters(),
    isInitialized
  }
}

function parseFiltersFromUrl(searchParams: URLSearchParams): FilterValues {
  const filters: FilterValues = { ...defaultFilters }

  // Парсинг строковых массивов
  const arrayKeys: (keyof FilterValues)[] = ['device_canteen_name', 'state']
  
  arrayKeys.forEach(key => {
    const value = searchParams.get(key as string)
    if (value) {
      ;(filters[key] as string[]) = value.split(',').filter(Boolean)
    }
  })

  // Парсинг строк
  const stringKeys: (keyof FilterValues)[] = ['start_dtts_from', 'start_dtts_to', 'ean_search', 'pos_search']
  
  stringKeys.forEach(key => {
    const value = searchParams.get(key as string)
    if (value) {
      ;(filters[key] as string) = value
    }
  })

  // Парсинг boolean или null
  const booleanKeys: (keyof FilterValues)[] = ['has_assistant_events']
  
  booleanKeys.forEach(key => {
    const value = searchParams.get(key as string)
    if (value === 'true') {
      ;(filters[key] as boolean | null) = true
    } else if (value === 'false') {
      ;(filters[key] as boolean | null) = false
    }
  })

  return filters
}

function buildUrlParams(filters: FilterValues): URLSearchParams {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return
    
    if (Array.isArray(value)) {
      if (value.length > 0) {
        params.set(key, value.join(','))
      }
    } else {
      params.set(key, value.toString())
    }
  })

  return params
}
