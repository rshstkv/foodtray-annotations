/**
 * Константы приложения
 */

export const API_ENDPOINTS = {
  CLARIFICATIONS: '/api/clarifications',
  FILTER_OPTIONS: '/api/filter-options',
  STATES: '/api/states'
} as const

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100
} as const

export const DEBOUNCE_DELAYS = {
  SEARCH: 300,
  FILTER: 150
} as const

export const STORAGE_KEYS = {
  FILTER_PREFERENCES: 'clarifications_filter_preferences',
  EXPORT_SETTINGS: 'clarifications_export_settings',
  UI_PREFERENCES: 'clarifications_ui_preferences'
} as const

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Ошибка сети. Проверьте соединение с интернетом.',
  SERVER_ERROR: 'Ошибка сервера. Попробуйте еще раз.',
  TIMEOUT_ERROR: 'Превышено время ожидания. Попробуйте еще раз.',
  UNKNOWN_ERROR: 'Произошла неизвестная ошибка.'
} as const

export const UI_CONFIG = {
  MOBILE_BREAKPOINT: 768,
  SKELETON_ITEMS_COUNT: 3,
  MAX_FILTER_DISPLAY_ITEMS: 2,
  INTERSECTION_THRESHOLD: 0.1,
  INTERSECTION_ROOT_MARGIN: '100px'
} as const
