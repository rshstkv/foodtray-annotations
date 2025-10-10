import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { FilterValues } from './useFilters'
import { createFilterKey } from '@/utils/filterUtils'

export interface ClarificationData {
  db_id?: number
  clarification_id: string
  device_canteen_name: string
  pos_transaction_id: string
  start_dtts: string
  rectangle: string
  clarification_type: string
  image_url_main?: string
  image_url_qualifying?: string
  ean_matched: unknown[]
  product_name: string
  sign: string
  superclass?: string
  hyperclass?: string
  image_found?: boolean
  ean_matched_count?: number
  d: {
    details: Array<{
      price: number
      description: string
      external_id: string
    }>
  }
  // Информация о состоянии
  state?: 'yes' | 'no' | 'bbox_error' | 'unknown'
  state_created_at?: string
  state_updated_at?: string
  // Информация о правильном блюде (заполняется когда state='no')
  correct_dish_ean?: string
  correct_dish_name?: string
  correct_dish_source?: 'available' | 'menu'
  actual_correct_ean?: string
}

export interface MenuItem {
  id: number
  proto_name: string
  ean: string | null
  super_class: string | null
  product_name: string
  english_name: string | null
  reference_image_url: string | null
}

export interface CorrectDish {
  id: number
  clarification_id: string
  selected_ean: string
  selected_product_name: string
  source: 'available' | 'menu'
  created_at: string
  updated_at: string
}

interface UseInfiniteClarificationsState {
  data: ClarificationData[]
  count: number
  isLoading: boolean
  isFetching: boolean
  error: string | null
  hasMore: boolean
  stats?: { checked: number; total: number; yes: number; no: number }
}

const PAGE_SIZE = 25

export function useInfiniteClarifications(
  filters: FilterValues,
  enabled: boolean = true
) {
  const [state, setState] = useState<UseInfiniteClarificationsState>({
    data: [],
    count: 0,
    isLoading: false,
    isFetching: false,
    error: null,
    hasMore: true,
    stats: undefined
  })

  const abortControllerRef = useRef<AbortController | null>(null)
  const filtersRef = useRef(filters)
  const currentPageRef = useRef(0)
  const lastFilterKeyRef = useRef<string>('')

  // Объявляем fetchPageStable перед использованием
  const fetchPageStable = useCallback(async (page: number, currentFilters: FilterValues, isInitial = false) => {
    // Отменяем предыдущий запрос
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    setState(prev => ({
      ...prev,
      isLoading: isInitial,
      isFetching: true,
      error: null
    }))

    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: PAGE_SIZE.toString(),
        ...buildApiFilters(currentFilters)
      })

      const response = await fetch(`/api/clarifications?${queryParams}`, {
        signal: controller.signal,
        cache: 'no-store'
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      
      if (controller.signal.aborted) return

      setState(prev => {
        const newData = isInitial ? result.data : [...prev.data, ...result.data]
        
        return {
          ...prev,
          data: newData,
          count: result.count,
          hasMore: newData.length < result.count,
          isLoading: false,
          isFetching: false,
          error: null,
          stats: result.stats || { checked: 0, total: result.count || 0, yes: 0, no: 0 }
        }
      })

      currentPageRef.current = page + 1

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        isFetching: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }))
    }
  }, [setState])

  const filterKey = useMemo(() => createFilterKey(filters), [filters])

  // Отслеживание изменения фильтров для сброса данных
  useEffect(() => {
    if (!enabled) return

    const filtersChanged = lastFilterKeyRef.current !== filterKey
    if (!filtersChanged) return

    lastFilterKeyRef.current = filterKey
    filtersRef.current = filters
    currentPageRef.current = 0
    setState(prev => ({ 
      ...prev, 
      data: [], 
      count: 0, 
      hasMore: true, 
      error: null 
    }))
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    fetchPageStable(0, filters, true)
  }, [filterKey, enabled, fetchPageStable, filters])

  // Убрали эффект первоначальной загрузки: первый запрос делает filters-эффект


  const fetchPage = useCallback(async (page: number, currentFilters: FilterValues, isInitial = false) => {
    return fetchPageStable(page, currentFilters, isInitial)
  }, [fetchPageStable])

  const fetchNextPage = useCallback(async () => {
    if (state.isFetching || !state.hasMore) return
    
    await fetchPage(currentPageRef.current, filtersRef.current, false)
  }, [fetchPage, state.isFetching, state.hasMore])

  const refetch = useCallback(() => {
    currentPageRef.current = 0
    setState(prev => ({ 
      ...prev, 
      data: [], 
      count: 0, 
      hasMore: true, 
      error: null 
    }))
    fetchPageStable(0, filtersRef.current, true)
  }, [fetchPageStable])

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return {
    ...state,
    fetchNextPage,
    refetch
  }
}

function buildApiFilters(filters: FilterValues): Record<string, string> {
  const apiFilters: Record<string, string> = {}

  // Преобразуем фильтры в формат для API
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return
    
    if (Array.isArray(value)) {
      if (value.length > 0) {
        apiFilters[key] = value.join(',')
      }
    } else {
      apiFilters[key] = value.toString()
    }
  })

  return apiFilters
}
