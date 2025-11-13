/**
 * Step Guards - гварды для валидации завершения этапов
 * 
 * Каждый guard проверяет специфичные условия для своего типа этапа
 * и возвращает результат валидации.
 */

import type { Annotation, Item, Image, ValidationResult, ValidationCheck } from '@/types/annotations'

/**
 * Guard для этапа dishes
 * Проверяет что для каждого блюда количество аннотаций совпадает с expected_count на обеих фотографиях
 */
export function dishesGuard(
  items: Item[],
  annotations: Annotation[],
  images: Image[]
): ValidationResult {
  const checks: ValidationCheck[] = []
  const dishItems = items.filter(i => i.type === 'dish')

  const mainImage = images.find(img => img.image_type === 'main')
  const qualityImage = images.find(img => img.image_type === 'quality')

  if (!mainImage || !qualityImage) {
    checks.push({
      type: 'error',
      message: 'Не найдены Main или Quality изображения',
    })
    return { canComplete: false, checks }
  }

  for (const item of dishItems) {
    if (!item.expected_count) {
      checks.push({
        type: 'warning',
        message: `Блюдо "${item.name}": не указано ожидаемое количество`,
      })
      continue
    }

    const mainAnns = annotations.filter(
      a => a.item_id === item.id && a.image_id === mainImage.id && !a.is_deleted
    )
    const qualityAnns = annotations.filter(
      a => a.item_id === item.id && a.image_id === qualityImage.id && !a.is_deleted
    )

    const mainCount = mainAnns.length
    const qualityCount = qualityAnns.length

    if (mainCount !== item.expected_count) {
      checks.push({
        type: 'error',
        message: `Блюдо "${item.name}": на Main ${mainCount} шт., ожидается ${item.expected_count}`,
        action: mainCount < item.expected_count 
          ? 'Добавьте недостающие bbox' 
          : 'Удалите лишние bbox',
        field: `item_${item.id}_main`,
      })
    }

    if (qualityCount !== item.expected_count) {
      checks.push({
        type: 'error',
        message: `Блюдо "${item.name}": на Quality ${qualityCount} шт., ожидается ${item.expected_count}`,
        action: qualityCount < item.expected_count 
          ? 'Добавьте недостающие bbox' 
          : 'Удалите лишние bbox',
        field: `item_${item.id}_quality`,
      })
    }
  }

  return {
    canComplete: checks.filter(c => c.type === 'error').length === 0,
    checks,
  }
}

/**
 * Guard для plates/buzzers
 * Проверяет парность: количество на Main = количество на Quality
 */
export function parityGuard(
  objectType: 'plate' | 'buzzer',
  annotations: Annotation[],
  images: Image[]
): ValidationResult {
  const checks: ValidationCheck[] = []

  const mainImage = images.find(img => img.image_type === 'main')
  const qualityImage = images.find(img => img.image_type === 'quality')

  if (!mainImage || !qualityImage) {
    checks.push({
      type: 'error',
      message: 'Не найдены Main или Quality изображения',
    })
    return { canComplete: false, checks }
  }

  const mainAnns = annotations.filter(
    a => a.object_type === objectType && a.image_id === mainImage.id && !a.is_deleted
  )
  const qualityAnns = annotations.filter(
    a => a.object_type === objectType && a.image_id === qualityImage.id && !a.is_deleted
  )

  const mainCount = mainAnns.length
  const qualityCount = qualityAnns.length

  const label = objectType === 'plate' ? 'Тарелки' : 'Баззеры'

  if (mainCount === 0 && qualityCount === 0) {
    checks.push({
      type: 'error',
      message: `${label} не найдены`,
      action: 'Нарисуйте bbox на обеих фотографиях',
    })
  } else if (mainCount !== qualityCount) {
    checks.push({
      type: 'error',
      message: `Количество ${objectType === 'plate' ? 'тарелок' : 'баззеров'} различается: Main=${mainCount}, Quality=${qualityCount}`,
      action: 'Убедитесь что количество одинаковое на обеих фотографиях',
    })
  } else if (mainCount > 0 && qualityCount > 0) {
    checks.push({
      type: 'info',
      message: `${label}: найдено ${mainCount} на каждой фотографии`,
    })
  }

  return {
    canComplete: checks.filter(c => c.type === 'error').length === 0,
    checks,
  }
}

/**
 * Guard для overlaps
 * Проверяет что координаты bbox не изменились (только флаги)
 */
export function overlapsGuard(
  annotations: Annotation[],
  originalSnapshot: Annotation[]
): ValidationResult {
  const checks: ValidationCheck[] = []
  const dishAnnotations = annotations.filter(a => a.object_type === 'dish' && !a.is_deleted)

  for (const ann of dishAnnotations) {
    const original = originalSnapshot.find(o => o.id === ann.id && !o.is_deleted)
    
    if (!original) {
      // Новая аннотация - это нормально
      continue
    }

    // Проверяем что координаты не изменились
    const coordsChanged = 
      ann.bbox_x1 !== original.bbox_x1 ||
      ann.bbox_y1 !== original.bbox_y1 ||
      ann.bbox_x2 !== original.bbox_x2 ||
      ann.bbox_y2 !== original.bbox_y2

    if (coordsChanged) {
      checks.push({
        type: 'error',
        message: `Аннотация ${ann.id.substring(0, 8)}: координаты изменены`,
        action: 'На этапе overlaps можно изменять только флаги is_overlapped, не координаты bbox',
        field: `annotation_${ann.id}`,
      })
    }
  }

  return {
    canComplete: checks.filter(c => c.type === 'error').length === 0,
    checks,
  }
}

/**
 * Guard для bottles
 * Проверяет что все бутылки имеют ориентацию (vertical/horizontal)
 */
export function bottlesGuard(
  annotations: Annotation[],
  images: Image[]
): ValidationResult {
  const checks: ValidationCheck[] = []

  const bottleAnnotations = annotations.filter(a => a.object_type === 'bottle' && !a.is_deleted)

  if (bottleAnnotations.length === 0) {
    checks.push({
      type: 'info',
      message: 'Бутылки не найдены',
    })
    return { canComplete: true, checks }
  }

  for (const ann of bottleAnnotations) {
    if (!ann.object_subtype || (ann.object_subtype !== 'vertical' && ann.object_subtype !== 'horizontal')) {
      checks.push({
        type: 'error',
        message: `Бутылка ${ann.id.substring(0, 8)}: не указана ориентация`,
        action: 'Выберите вертикально или горизонтально',
        field: `annotation_${ann.id}`,
      })
    }
  }

  // Проверяем парность между Main и Quality
  const mainImage = images.find(img => img.image_type === 'main')
  const qualityImage = images.find(img => img.image_type === 'quality')

  if (mainImage && qualityImage) {
    const mainCount = bottleAnnotations.filter(a => a.image_id === mainImage.id).length
    const qualityCount = bottleAnnotations.filter(a => a.image_id === qualityImage.id).length

    if (mainCount !== qualityCount) {
      checks.push({
        type: 'warning',
        message: `Количество бутылок различается: Main=${mainCount}, Quality=${qualityCount}`,
        action: 'Проверьте что бутылки отмечены на обеих фотографиях',
      })
    }
  }

  return {
    canComplete: checks.filter(c => c.type === 'error').length === 0,
    checks,
  }
}

/**
 * Guard для nonfood
 * Проверяет парность между Main и Quality
 */
export function nonfoodGuard(
  annotations: Annotation[],
  images: Image[]
): ValidationResult {
  const checks: ValidationCheck[] = []

  const nonfoodAnnotations = annotations.filter(a => a.object_type === 'nonfood' && !a.is_deleted)

  if (nonfoodAnnotations.length === 0) {
    checks.push({
      type: 'info',
      message: 'Другие предметы не найдены',
    })
    return { canComplete: true, checks }
  }

  const mainImage = images.find(img => img.image_type === 'main')
  const qualityImage = images.find(img => img.image_type === 'quality')

  if (mainImage && qualityImage) {
    const mainCount = nonfoodAnnotations.filter(a => a.image_id === mainImage.id).length
    const qualityCount = nonfoodAnnotations.filter(a => a.image_id === qualityImage.id).length

    if (mainCount !== qualityCount) {
      checks.push({
        type: 'error',
        message: `Количество предметов различается: Main=${mainCount}, Quality=${qualityCount}`,
        action: 'Убедитесь что количество одинаковое на обеих фотографиях',
      })
    }
  }

  return {
    canComplete: checks.filter(c => c.type === 'error').length === 0,
    checks,
  }
}

/**
 * Универсальный guard-маршрутизатор
 * Выбирает нужный guard на основе step_id
 */
export function validateStep(
  stepId: string,
  items: Item[],
  annotations: Annotation[],
  images: Image[],
  originalSnapshot?: Annotation[]
): ValidationResult {
  switch (stepId) {
    case 'validate_dishes':
      return dishesGuard(items, annotations, images)
    
    case 'validate_plates':
      return parityGuard('plate', annotations, images)
    
    case 'validate_buzzers':
      return parityGuard('buzzer', annotations, images)
    
    case 'check_overlaps':
      if (!originalSnapshot) {
        return {
          canComplete: false,
          checks: [{
            type: 'error',
            message: 'Нет snapshot для проверки изменений координат',
          }],
        }
      }
      return overlapsGuard(annotations, originalSnapshot)
    
    case 'validate_bottles':
      return bottlesGuard(annotations, images)
    
    case 'validate_nonfood':
      return nonfoodGuard(annotations, images)
    
    default:
      return {
        canComplete: true,
        checks: [{
          type: 'info',
          message: `Нет специального guard для этапа ${stepId}`,
        }],
      }
  }
}

