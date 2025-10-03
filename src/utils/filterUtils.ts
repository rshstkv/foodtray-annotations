import { FilterValues } from '@/hooks/useFilters'

/**
 * Создает стабильный ключ для фильтров
 * Используется для сравнения и мемоизации
 */
export function createFilterKey(filters: FilterValues): string {
  return JSON.stringify({
    device_canteen_name: [...filters.device_canteen_name].sort(),
    start_dtts_from: filters.start_dtts_from,
    start_dtts_to: filters.start_dtts_to,
    has_assistant_events: filters.has_assistant_events,
    ean_search: filters.ean_search,
    pos_search: filters.pos_search,
    freq_bucket: filters.freq_bucket,
    state: [...filters.state].sort()
  })
}

/**
 * Сравнивает два объекта фильтров
 */
export function areFiltersEqual(filters1: FilterValues, filters2: FilterValues): boolean {
  return createFilterKey(filters1) === createFilterKey(filters2)
}
