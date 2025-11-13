import { Annotation, TaskStep, ValidationResult, Dish, ValidationCheck } from '@/types/annotations'

export function validateStep(
  step: TaskStep,
  annotations: Annotation[],
  dishes: Dish[],
  images: { id: string; image_type: 'main' | 'quality' }[]
): ValidationResult {
  const checks: ValidationCheck[] = []
  
  switch (step.id) {
    case 'validate_dishes':
      return validateDishes(annotations, dishes, images)
    
    case 'check_overlaps':
      return validateOverlaps(annotations)
    
    case 'validate_buzzers':
      return validateBuzzers(annotations, images)
    
    case 'validate_bottles':
      return validateBottles(annotations)
    
    case 'validate_nonfood':
      return validateNonfood(annotations)
    
    case 'validate_plates':
      return validatePlates(annotations, images)
    
    default:
      return { canComplete: true, checks: [] }
  }
}

function validateDishes(
  annotations: Annotation[],
  dishes: Dish[],
  images: { id: string; image_type: 'main' | 'quality' }[]
): ValidationResult {
  const checks: ValidationCheck[] = []
  
  for (let i = 0; i < dishes.length; i++) {
    const dish = dishes[i]
    const expectedCount = dish.count
    
    // Подсчёт на main
    const mainImage = images.find(img => img.image_type === 'main')
    const mainCount = mainImage ? annotations.filter(a => 
      a.object_type === 'dish' && 
      a.dish_index === i && 
      a.image_id === mainImage.id
    ).length : 0
    
    // Подсчёт на quality
    const qualityImage = images.find(img => img.image_type === 'quality')
    const qualityCount = qualityImage ? annotations.filter(a => 
      a.object_type === 'dish' && 
      a.dish_index === i && 
      a.image_id === qualityImage.id
    ).length : 0
    
    if (mainCount !== expectedCount) {
      checks.push({
        type: 'error',
        message: `Блюдо "${dish.name}": на Main фото ${mainCount} шт., ожидается ${expectedCount}`,
        action: 'Добавьте или удалите bbox на Main фото',
        field: `dish_${i}_main`
      })
    }
    
    if (qualityCount !== expectedCount) {
      checks.push({
        type: 'error',
        message: `Блюдо "${dish.name}": на Quality фото ${qualityCount} шт., ожидается ${expectedCount}`,
        action: 'Добавьте или удалите bbox на Quality фото',
        field: `dish_${i}_quality`
      })
    }
    
    if (mainCount !== qualityCount && mainCount === expectedCount && qualityCount === expectedCount) {
      checks.push({
        type: 'warning',
        message: `Блюдо "${dish.name}": количество на Main и Quality отличается`,
        action: 'Проверьте обе фотографии',
        field: `dish_${i}`
      })
    }
  }
  
  return {
    canComplete: checks.filter(c => c.type === 'error').length === 0,
    checks
  }
}

function validateOverlaps(annotations: Annotation[]): ValidationResult {
  // Проверяем что хотя бы одно блюдо отмечено как перекрытое
  // (это мягкая валидация, т.к. иногда перекрытий может не быть)
  const overlappedCount = annotations.filter(a => 
    a.object_type === 'dish' && a.is_overlapped
  ).length
  
  if (overlappedCount === 0) {
    return {
      canComplete: true,
      checks: [{
        type: 'info' as const,
        message: 'Не найдено перекрытых блюд',
        action: 'Убедитесь что все блюда видны полностью'
      }]
    }
  }
  
  return { canComplete: true, checks: [] }
}

function validateBuzzers(
  annotations: Annotation[],
  images: { id: string; image_type: 'main' | 'quality' }[]
): ValidationResult {
  const buzzerCount = annotations.filter(a => a.object_type === 'buzzer').length
  
  if (buzzerCount === 0) {
    return {
      canComplete: false,
      checks: [{
        type: 'error' as const,
        message: 'Buzzer не найден',
        action: 'Обычно на подносах есть buzzer. Нарисуйте bbox или пропустите задачу если уверены что его нет.'
      }]
    }
  }
  
  // Проверяем что buzzer есть на обеих фотографиях
  const mainImage = images.find(img => img.image_type === 'main')
  const qualityImage = images.find(img => img.image_type === 'quality')
  
  const mainBuzzers = mainImage ? annotations.filter(a => 
    a.object_type === 'buzzer' && a.image_id === mainImage.id
  ).length : 0
  
  const qualityBuzzers = qualityImage ? annotations.filter(a => 
    a.object_type === 'buzzer' && a.image_id === qualityImage.id
  ).length : 0
  
  if (mainBuzzers === 0 || qualityBuzzers === 0) {
    return {
      canComplete: false,
      checks: [{
        type: 'error' as const,
        message: 'Buzzer должен быть отмечен на обеих фотографиях',
        action: `Добавьте buzzer на ${mainBuzzers === 0 ? 'Main' : 'Quality'} фото`
      }]
    }
  }
  
  return { canComplete: true, checks: [] }
}

function validateBottles(annotations: Annotation[]): ValidationResult {
  const bottles = annotations.filter(a => a.object_type === 'bottle')
  
  const withoutOrientation = bottles.filter(b => !b.object_subtype)
  
  if (withoutOrientation.length > 0) {
    return {
      canComplete: false,
      checks: [{
        type: 'error' as const,
        message: `${withoutOrientation.length} бутылок без ориентации`,
        action: 'Укажите ориентацию для каждой бутылки (vertical/horizontal)'
      }]
    }
  }
  
  return { canComplete: true, checks: [] }
}

function validateNonfood(annotations: Annotation[]): ValidationResult {
  // Мягкая валидация - nonfood опциональны
  const nonfoodCount = annotations.filter(a => a.object_type === 'nonfood').length
  
  if (nonfoodCount === 0) {
    return {
      canComplete: true,
      checks: [{
        type: 'info' as const,
        message: 'Другие предметы не найдены',
        action: 'Если на фото есть приборы, салфетки и т.п., отметьте их'
      }]
    }
  }
  
  return { canComplete: true, checks: [] }
}

function validatePlates(
  annotations: Annotation[],
  images: { id: string; image_type: 'main' | 'quality' }[]
): ValidationResult {
  const mainImage = images.find(img => img.image_type === 'main')
  const qualityImage = images.find(img => img.image_type === 'quality')
  
  const mainPlates = mainImage ? annotations.filter(a => 
    a.object_type === 'plate' && a.image_id === mainImage.id
  ).length : 0
  
  const qualityPlates = qualityImage ? annotations.filter(a => 
    a.object_type === 'plate' && a.image_id === qualityImage.id
  ).length : 0
  
  if (mainPlates !== qualityPlates) {
    return {
      canComplete: true,
      checks: [{
        type: 'warning' as const,
        message: `Количество тарелок различается: Main=${mainPlates}, Quality=${qualityPlates}`,
        action: 'Проверьте что все тарелки отмечены на обеих фотографиях'
      }]
    }
  }
  
  return { canComplete: true, checks: [] }
}

