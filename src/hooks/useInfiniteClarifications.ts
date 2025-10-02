import { useEffect, useRef, useState } from 'react'
import { FilterValues } from './useFilters'

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
  state?: 'yes' | 'no'
  state_created_at?: string
  state_updated_at?: string
}

interface UseInfiniteClarificationsState {
  data: ClarificationData[]
  count: number
  isLoading: boolean
  isFetching: boolean
  error: string | null
  hasMore: boolean
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
    hasMore: true
  })

  const abortControllerRef = useRef<AbortController | null>(null)
  const filtersRef = useRef(filters)
  const currentPageRef = useRef(0)

  // Отслеживание изменения фильтров для сброса данных
  useEffect(() => {
    const filtersChanged = JSON.stringify(filtersRef.current) !== JSON.stringify(filters)
    
    if (filtersChanged && enabled) {
      filtersRef.current = filters
      currentPageRef.current = 0
      setState(prev => ({ 
        ...prev, 
        data: [], 
        count: 0, 
        hasMore: true, 
        error: null 
      }))
      
      // Отменяем предыдущие запросы
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      
      fetchPage(0, filters, true)
    }
  }, [filters, enabled])

  // Первоначальная загрузка
  useEffect(() => {
    if (enabled && state.data.length === 0 && !state.isLoading && !state.isFetching) {
      fetchPage(0, filters, true)
    }
  }, [enabled])

  const fetchPage = async (page: number, currentFilters: FilterValues, isInitial = false) => {
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
        signal: controller.signal
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
          error: null
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
  }

  const fetchNextPage = async () => {
    if (state.isFetching || !state.hasMore) return
    
    await fetchPage(currentPageRef.current, filtersRef.current, false)
  }

  const refetch = () => {
    currentPageRef.current = 0
    setState(prev => ({ 
      ...prev, 
      data: [], 
      count: 0, 
      hasMore: true, 
      error: null 
    }))
    fetchPage(0, filtersRef.current, true)
  }

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
