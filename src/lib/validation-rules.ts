import type { TrayItem, AnnotationView, Image } from '@/types/domain'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

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
      (ann) => ann.tray_item_id === item.id && !ann.is_deleted
    )

    // Проверка: есть ли аннотации на обеих камерах
    images.forEach((image) => {
      const hasAnnotation = itemAnnotations.some((ann) => ann.image_id === image.id)
      if (!hasAnnotation) {
        errors.push(
          `Объект ${item.id} (${item.item_type}) отсутствует на камере ${image.camera_number}`
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
      (ann) => ann.tray_item_id === item.id && !ann.is_deleted
    )

    images.forEach((image) => {
      const imageAnnotations = itemAnnotations.filter((ann) => ann.image_id === image.id)

      // Для не-FOOD items должна быть максимум одна аннотация на камеру
      if (item.item_type !== 'FOOD' && imageAnnotations.length > 1) {
        errors.push(
          `Объект ${item.id} (${item.item_type}) имеет ${imageAnnotations.length} аннотаций на камере ${image.camera_number}, ожидается максимум 1`
        )
      }

      // Предупреждение: слишком много аннотаций для FOOD
      if (item.item_type === 'FOOD' && imageAnnotations.length > 5) {
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
    (ann) => ann.tray_item_id === item.id && !ann.is_deleted
  )

  if (itemAnnotations.length === 0) return 'missing'

  const camerasWithAnnotations = new Set(itemAnnotations.map((ann) => ann.image_id))
  const allCamerasHaveAnnotations = images.every((img) => camerasWithAnnotations.has(img.id))

  return allCamerasHaveAnnotations ? 'complete' : 'partial'
}

