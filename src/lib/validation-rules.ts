import type { TrayItem, AnnotationView, Image, RecipeLine, ValidationType, ItemType } from '@/types/domain'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Новая система валидации с визуальными индикаторами
 */

export interface SessionValidationResult {
  canComplete: boolean
  itemErrors: Map<number, string[]> // itemId -> errors
  globalErrors: string[]
}

/**
 * Определение ожидаемого количества аннотаций для item
 * 
 * Логика:
 * 1. Если есть recipe_line_id (блюдо из чека):
 *    - Если пользователь изменил quantity -> верим ему (item.quantity)
 *    - Иначе -> берём из чека (recipeLine.quantity)
 * 2. Если нет recipe_line_id (вручную добавленное):
 *    - Всегда item.quantity
 */
export function getExpectedQuantity(
  item: TrayItem,
  recipeLines: RecipeLine[]
): number {
  // Если есть recipe_line_id - сравниваем с чеком
  if (item.recipe_line_id) {
    const recipeLine = recipeLines.find(rl => rl.id === item.recipe_line_id)
    if (recipeLine) {
      // Если пользователь изменил quantity - верим ему
      // Иначе используем quantity из чека как источник правды
      return item.quantity !== recipeLine.quantity 
        ? item.quantity 
        : recipeLine.quantity
    }
  }
  // Для items без чека - всегда используем item.quantity
  return item.quantity
}

/**
 * Валидация аннотаций для конкретного item
 * Проверяет количество на каждой камере
 */
export function validateItemAnnotations(
  item: TrayItem,
  annotations: AnnotationView[],
  images: Image[],
  expectedQuantity: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Пропускаем удалённые items
  if (item.is_deleted) {
    return { valid: true, errors: [] }
  }

  // Получаем аннотации для этого item
  const itemAnnotations = annotations.filter(
    (ann) => ann.work_item_id === item.id && !ann.is_deleted
  )

  // КРИТИЧНО: Если у item нет аннотаций вообще - это ОШИБКА!
  // Пользователь должен либо добавить аннотации, либо удалить item из списка
  if (itemAnnotations.length === 0) {
    errors.push('Объект в списке, но нет ни одной аннотации. Удалите объект или добавьте аннотации.')
    return { valid: false, errors }
  }

  // Подсчитываем количество на каждой камере
  const countsByCamera = new Map<number, number>()
  images.forEach(image => {
    const count = itemAnnotations.filter(ann => ann.image_id === image.id).length
    countsByCamera.set(image.camera_number, count)
  })

  // Для PLATE и BUZZER: проверяем только соответствие между камерами
  // Не проверяем соответствие ожидаемому количеству, т.к. его нет в чеке
  if (item.type === 'PLATE' || item.type === 'BUZZER') {
    const counts = Array.from(countsByCamera.values())
    if (counts.length > 1) {
      const allEqual = counts.every(c => c === counts[0])
      if (!allEqual) {
        const countStr = images.map(img => 
          `камера ${img.camera_number} = ${countsByCamera.get(img.camera_number) || 0}`
        ).join(', ')
        errors.push(`Количество не совпадает между камерами: ${countStr}`)
      }
    }
  } else {
    // Для FOOD: проверяем соответствие ожидаемому количеству на каждой камере
    images.forEach(image => {
      const count = countsByCamera.get(image.camera_number) || 0
      if (count !== expectedQuantity) {
        errors.push(
          `На камере ${image.camera_number}: ${count} ${count === 1 ? 'аннотация' : count > 1 && count < 5 ? 'аннотации' : 'аннотаций'}, ожидается ${expectedQuantity}`
        )
      }
    })

    // И также проверяем что количество совпадает между камерами
    const counts = Array.from(countsByCamera.values())
    if (counts.length > 1) {
      const allEqual = counts.every(c => c === counts[0])
      if (!allEqual) {
        const countStr = images.map(img => 
          `камера ${img.camera_number} = ${countsByCamera.get(img.camera_number) || 0}`
        ).join(', ')
        errors.push(`Количество не совпадает между камерами: ${countStr}`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Главная функция валидации для всей сессии
 * Используется для реактивного обновления UI
 */
export function validateSession(
  items: TrayItem[],
  annotations: AnnotationView[],
  images: Image[],
  recipeLines: RecipeLine[],
  validationType: ValidationType
): SessionValidationResult {
  // Для OCCLUSION и BOTTLE_ORIENTATION валидация не требуется
  if (validationType === 'OCCLUSION_VALIDATION' || validationType === 'BOTTLE_ORIENTATION_VALIDATION') {
    return {
      canComplete: true,
      itemErrors: new Map(),
      globalErrors: []
    }
  }

  const itemErrors = new Map<number, string[]>()
  const globalErrors: string[] = []

  // Определяем какие типы items проверять для данного типа валидации
  const relevantItemTypes: ItemType[] = []
  switch (validationType) {
    case 'FOOD_VALIDATION':
      relevantItemTypes.push('FOOD')
      break
    case 'PLATE_VALIDATION':
      relevantItemTypes.push('PLATE')
      break
    case 'BUZZER_VALIDATION':
      relevantItemTypes.push('BUZZER')
      break
  }

  // Проверяем только релевантные items
  items.forEach(item => {
    if (item.is_deleted) return
    
    // Пропускаем items не относящиеся к данному типу валидации
    if (relevantItemTypes.length > 0 && !relevantItemTypes.includes(item.type)) {
      return
    }

    const expectedQuantity = getExpectedQuantity(item, recipeLines)
    const result = validateItemAnnotations(item, annotations, images, expectedQuantity)

    if (!result.valid) {
      itemErrors.set(item.id, result.errors)
    }
  })

  // Можем завершить только если нет ошибок
  const canComplete = itemErrors.size === 0 && globalErrors.length === 0

  return {
    canComplete,
    itemErrors,
    globalErrors
  }
}

// ============================================================================
// Старые функции валидации (оставлены для совместимости)
// ============================================================================

/**
 * Валидация полноты аннотаций
 * Проверяет что каждый item (кроме удаленных) имеет аннотации на всех камерах
 */
export function validateAnnotationCompleteness(
  items: TrayItem[],
  annotations: AnnotationView[],
  images: Image[]
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  items.forEach((item) => {
    // Пропускаем удаленные items
    if (item.is_deleted) return

    const itemAnnotations = annotations.filter(
      (ann) => ann.work_item_id === item.id && !ann.is_deleted
    )

    // Проверка: есть ли аннотации на обеих камерах
    images.forEach((image) => {
      const hasAnnotation = itemAnnotations.some((ann) => ann.image_id === image.id)
      if (!hasAnnotation) {
        errors.push(
          `Объект ${item.id} (${item.type}) отсутствует на камере ${image.camera_number}`
        )
      }
    })

    // Предупреждение: есть временные (несохраненные) аннотации
    const tempAnnotations = itemAnnotations.filter((ann) => ann.is_temp)
    if (tempAnnotations.length > 0) {
      warnings.push(
        `Объект ${item.id} имеет ${tempAnnotations.length} несохраненных аннотаций`
      )
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Валидация количества аннотаций
 * Для FOOD items может быть несколько аннотаций на одной камере (несколько порций)
 * Для других типов - только одна аннотация на камеру
 */
export function validateAnnotationCount(
  items: TrayItem[],
  annotations: AnnotationView[],
  images: Image[]
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  items.forEach((item) => {
    if (item.is_deleted) return

    const itemAnnotations = annotations.filter(
      (ann) => ann.work_item_id === item.id && !ann.is_deleted
    )

    images.forEach((image) => {
      const imageAnnotations = itemAnnotations.filter((ann) => ann.image_id === image.id)

      // Для не-FOOD items должна быть максимум одна аннотация на камеру
      if (item.type !== 'FOOD' && imageAnnotations.length > 1) {
        errors.push(
          `Объект ${item.id} (${item.type}) имеет ${imageAnnotations.length} аннотаций на камере ${image.camera_number}, ожидается максимум 1`
        )
      }

      // Предупреждение: слишком много аннотаций для FOOD
      if (item.type === 'FOOD' && imageAnnotations.length > 5) {
        warnings.push(
          `Объект ${item.id} (FOOD) имеет ${imageAnnotations.length} аннотаций на камере ${image.camera_number}, это кажется много`
        )
      }
    })
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Валидация размеров bbox
 * Проверяет что bbox имеют разумные размеры
 */
export function validateBBoxSizes(
  annotations: AnnotationView[],
  images: Image[]
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  annotations.forEach((ann) => {
    if (ann.is_deleted) return

    const image = images.find((img) => img.id === ann.image_id)
    if (!image) return

    const { x, y, w, h } = ann.bbox

    // Проверка: bbox внутри границ изображения
    if (image.width && image.height) {
      if (x < 0 || y < 0) {
        errors.push(`Аннотация ${ann.id} имеет отрицательные координаты`)
      }
      if (x + w > image.width || y + h > image.height) {
        errors.push(`Аннотация ${ann.id} выходит за границы изображения`)
      }
    }

    // Проверка: минимальный размер bbox
    const MIN_SIZE = 10
    if (w < MIN_SIZE || h < MIN_SIZE) {
      warnings.push(
        `Аннотация ${ann.id} слишком маленькая (${Math.round(w)}×${Math.round(h)}), минимум ${MIN_SIZE}px`
      )
    }

    // Предупреждение: очень большой bbox
    if (image.width && image.height) {
      const areaPercent = (w * h) / (image.width * image.height) * 100
      if (areaPercent > 50) {
        warnings.push(
          `Аннотация ${ann.id} занимает ${Math.round(areaPercent)}% изображения, это кажется много`
        )
      }
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Комплексная валидация
 * Выполняет все проверки
 */
export function validateAll(
  items: TrayItem[],
  annotations: AnnotationView[],
  images: Image[]
): ValidationResult {
  const completeness = validateAnnotationCompleteness(items, annotations, images)
  const count = validateAnnotationCount(items, annotations, images)
  const sizes = validateBBoxSizes(annotations, images)

  return {
    valid: completeness.valid && count.valid && sizes.valid,
    errors: [...completeness.errors, ...count.errors, ...sizes.errors],
    warnings: [...completeness.warnings, ...count.warnings, ...sizes.warnings],
  }
}

/**
 * Проверка несохраненных изменений
 */
export function hasUnsavedChanges(annotations: AnnotationView[]): boolean {
  return annotations.some((ann) => ann.is_temp || ann.is_modified)
}

/**
 * Получить статус полноты аннотаций для item
 * Возвращает: 'complete' | 'partial' | 'missing'
 */
export function getItemAnnotationStatus(
  item: TrayItem,
  annotations: AnnotationView[],
  images: Image[]
): 'complete' | 'partial' | 'missing' {
  if (item.is_deleted) return 'complete'

  const itemAnnotations = annotations.filter(
    (ann) => ann.work_item_id === item.id && !ann.is_deleted
  )

  if (itemAnnotations.length === 0) return 'missing'

  const camerasWithAnnotations = new Set(itemAnnotations.map((ann) => ann.image_id))
  const allCamerasHaveAnnotations = images.every((img) => camerasWithAnnotations.has(img.id))

  return allCamerasHaveAnnotations ? 'complete' : 'partial'
}

