/**
 * Skip Condition Evaluator
 * Проверяет, должна ли задача быть автоматически пропущена
 */

import type { Recognition, Image } from '@/types/annotations'

export interface SkipCondition {
  field: string
  equals_field?: string
  equals?: any
  not_equals?: any
  greater_than?: number
  less_than?: number
}

/**
 * Оценивает skip_condition для recognition
 * 
 * @param recognition - Recognition object
 * @param images - Images with annotations
 * @param skipCondition - Условие для проп уска
 * @returns true если задачу нужно пропустить
 */
export function evaluateSkipCondition(
  recognition: Recognition,
  images: Image[],
  skipCondition: SkipCondition | null
): boolean {
  if (!skipCondition) {
    return false
  }

  const { field, equals_field, equals, not_equals, greater_than, less_than } = skipCondition

  // Вычисляем значение field
  const fieldValue = getFieldValue(field, recognition, images)

  // equals_field: сравнение двух полей
  if (equals_field) {
    const equalsFieldValue = getFieldValue(equals_field, recognition, images)
    return fieldValue === equalsFieldValue
  }

  // equals: точное совпадение
  if (equals !== undefined) {
    return fieldValue === equals
  }

  // not_equals: не равно
  if (not_equals !== undefined) {
    return fieldValue !== not_equals
  }

  // greater_than: больше чем
  if (greater_than !== undefined) {
    return typeof fieldValue === 'number' && fieldValue > greater_than
  }

  // less_than: меньше чем
  if (less_than !== undefined) {
    return typeof fieldValue === 'number' && fieldValue < less_than
  }

  return false
}

/**
 * Получает значение поля из recognition или вычисляет его
 */
function getFieldValue(field: string, recognition: Recognition, images: Image[]): any {
  // Специальные вычисляемые поля
  switch (field) {
    case 'main_count':
      return images.find(img => img.photo_type === 'Main')?.annotations.filter(
        ann => ann.dish_index !== null
      ).length || 0

    case 'qualifying_count':
      return images.find(img => img.photo_type === 'Qualifying')?.annotations.filter(
        ann => ann.dish_index !== null
      ).length || 0

    case 'expected_count':
      return recognition.correct_dishes?.reduce((sum, dish) => sum + dish.Count, 0) || 0

    case 'all_dishes_single_variant':
      return recognition.correct_dishes?.every(
        dish => Array.isArray(dish.Dishes) && dish.Dishes.length === 1
      ) || false

    case 'has_multiple_dish_variants':
      return recognition.correct_dishes?.some(
        dish => Array.isArray(dish.Dishes) && dish.Dishes.length > 1
      ) || false

    default:
      // Прямой доступ к полю recognition
      return (recognition as any)[field]
  }
}

/**
 * Проверяет, совпадают ли counts на обоих изображениях и с ожидаемым
 */
export function countsAreAligned(recognition: Recognition, images: Image[]): boolean {
  const mainCount = images.find(img => img.photo_type === 'Main')?.annotations.filter(
    ann => ann.dish_index !== null
  ).length || 0

  const qualCount = images.find(img => img.photo_type === 'Qualifying')?.annotations.filter(
    ann => ann.dish_index !== null
  ).length || 0

  const expectedCount = recognition.correct_dishes?.reduce((sum, dish) => sum + dish.Count, 0) || 0

  return mainCount === qualCount && mainCount === expectedCount
}

