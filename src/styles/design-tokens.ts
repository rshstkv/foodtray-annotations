/**
 * Design System Tokens
 * Clean, minimal, focused design language
 */

// Object type colors
export const objectColors = {
  dish: '#3B82F6',      // blue-600
  plate: '#10B981',     // green-600
  buzzer: '#F59E0B',    // amber-600
  bottle: '#8B5CF6',    // violet-600
  nonfood: '#6B7280',   // gray-500
} as const

// Buzzer colors (только цвета из Приложения B)
export const buzzerColors = {
  red: '#EF4444',       // red-500
  green: '#10B981',     // green-500
  blue: '#3B82F6',      // blue-500
  white: '#F3F4F6',     // gray-100
} as const

// Status colors
export const statusColors = {
  success: '#10B981',   // green-500
  warning: '#F59E0B',   // amber-500
  error: '#EF4444',     // red-500
  info: '#3B82F6',      // blue-500
  neutral: '#6B7280',   // gray-500
} as const

// Spacing scale (8px grid)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const

// Typography
export const fontSize = {
  xs: '0.75rem',      // 12px
  sm: '0.875rem',     // 14px
  base: '1rem',       // 16px
  lg: '1.125rem',     // 18px
  xl: '1.25rem',      // 20px
  '2xl': '1.5rem',    // 24px
  '3xl': '1.875rem',  // 30px
  '4xl': '2.25rem',   // 36px
} as const

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const

// Border radius
export const borderRadius = {
  none: '0',
  sm: '0.125rem',   // 2px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  full: '9999px',
} as const

// Transitions
export const transition = {
  fast: '150ms ease',
  normal: '200ms ease',
  slow: '300ms ease',
} as const

// Shadows
export const shadow = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
} as const

// Z-index layers
export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  overlay: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
} as const

// Object type labels
export const objectTypeLabels = {
  dish: 'Блюдо',
  plate: 'Тарелка',
  buzzer: 'Баззер',
  bottle: 'Бутылка',
  nonfood: 'Не еда',
} as const

// Non-food subtypes
export const nonfoodSubtypes = {
  hand: '✋ Рука',
  phone: '📱 Телефон',
  wallet: '👛 Кошелек',
  bag: '👜 Сумка',
  utensils: '🍴 Приборы',
  napkin: '🧻 Салфетка',
  menu: '📋 Меню',
  other: '❓ Другое',
} as const

// Bottle orientations
export const bottleOrientations = {
  vertical: '↕️ Вертикально',
  horizontal: '↔️ Горизонтально',
} as const

// Task step labels
export const taskStepLabels = {
  validate_dishes: 'Валидация блюд',
  check_overlaps: 'Отметка перекрытий',
  validate_buzzers: 'Валидация баззеров',
  check_buzzer_positions: 'Позиции баззеров',
  validate_bottles: 'Валидация бутылок',
  validate_nonfood: 'Валидация не-еды',
  validate_plates: 'Валидация тарелок',
} as const

// Task priority colors
export const priorityColors = {
  high: '#EF4444',      // red-500
  medium: '#F59E0B',    // amber-500
  low: '#10B981',       // green-500
} as const

// Animation durations
export const duration = {
  instant: 0,
  fast: 150,
  normal: 200,
  slow: 300,
  verySlow: 500,
} as const

