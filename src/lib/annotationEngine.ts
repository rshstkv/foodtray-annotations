/**
 * AnnotationEngine - единый сервис для работы с аннотациями
 * 
 * Ответственность:
 * - CRUD операции над аннотациями с версионностью
 * - Snapshot/Restore для Reset (откат к Qwen)
 * - Валидация по типам (dishes, plates, buzzers)
 * - Синхронизация аннотаций между Main/Quality (проверка парности)
 * - Бидирекционная связь Item ↔ Annotations
 */

import type { Annotation, Item, AnnotationSnapshot, ValidationResult, Image } from '@/types/annotations'

export class AnnotationEngine {
  private annotations: Annotation[] = []
  private items: Item[] = []
  private snapshots: Map<string, AnnotationSnapshot> = new Map()

  constructor(initialAnnotations: Annotation[] = [], initialItems: Item[] = []) {
    this.annotations = initialAnnotations
    this.items = initialItems
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * Создать новую аннотацию
   */
  createAnnotation(params: {
    item_id: string | null
    image_id: string
    bbox: { x1: number; y1: number; x2: number; y2: number }
    object_type: Annotation['object_type']
    object_subtype?: string | null
    source: 'manual' | 'qwen_auto'
    created_by: string
  }): Annotation {
    const newAnnotation: Annotation = {
      id: `temp_${Date.now()}_${Math.random()}`,
      image_id: params.image_id,
      bbox_x1: params.bbox.x1,
      bbox_y1: params.bbox.y1,
      bbox_x2: params.bbox.x2,
      bbox_y2: params.bbox.y2,
      object_type: params.object_type,
      object_subtype: params.object_subtype || null,
      item_id: params.item_id,
      dish_index: null, // Заполняется из item.metadata.dish_index если нужно
      custom_dish_name: null,
      is_overlapped: false,
      is_bottle_up: null,
      is_error: false,
      is_manual: params.source === 'manual',
      is_locked: false,
      source: params.source,
      version: 1,
      created_by: params.created_by,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
    }

    this.annotations.push(newAnnotation)
    return newAnnotation
  }

  /**
   * Обновить аннотацию (инкрементирует version)
   */
  updateAnnotation(id: string, updates: Partial<Annotation>, updatedBy: string): Annotation | null {
    const index = this.annotations.findIndex(a => a.id === id)
    if (index === -1) return null

    const annotation = this.annotations[index]
    const updatedAnnotation: Annotation = {
      ...annotation,
      ...updates,
      version: annotation.version + 1,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    }

    this.annotations[index] = updatedAnnotation
    return updatedAnnotation
  }

  /**
   * Удалить аннотацию (soft delete)
   */
  deleteAnnotation(id: string): void {
    const index = this.annotations.findIndex(a => a.id === id)
    if (index !== -1) {
      this.annotations[index] = {
        ...this.annotations[index],
        is_deleted: true,
        updated_at: new Date().toISOString(),
      }
    }
  }

  /**
   * Получить все активные аннотации (is_deleted === false)
   */
  getActiveAnnotations(): Annotation[] {
    return this.annotations.filter(a => !a.is_deleted)
  }

  // ============================================================================
  // Snapshot/Restore для Reset
  // ============================================================================

  /**
   * Создать snapshot текущего состояния (для Reset)
   */
  createSnapshot(stepId: string, taskId: string, createdBy: string): AnnotationSnapshot {
    const snapshot: AnnotationSnapshot = {
      id: `snapshot_${stepId}_${Date.now()}`,
      step_id: stepId,
      task_id: taskId,
      items: JSON.parse(JSON.stringify(this.items)),
      annotations: JSON.parse(JSON.stringify(this.annotations.filter(a => !a.is_deleted))),
      created_at: new Date().toISOString(),
      created_by: createdBy,
    }

    this.snapshots.set(stepId, snapshot)
    return snapshot
  }

  /**
   * Восстановить состояние из snapshot (откат к Qwen)
   */
  restoreSnapshot(stepId: string): boolean {
    const snapshot = this.snapshots.get(stepId)
    if (!snapshot) return false

    // Откатываем к сохраненному состоянию
    this.items = JSON.parse(JSON.stringify(snapshot.items))
    this.annotations = JSON.parse(JSON.stringify(snapshot.annotations))

    return true
  }

  /**
   * Получить snapshot по step_id
   */
  getSnapshot(stepId: string): AnnotationSnapshot | null {
    return this.snapshots.get(stepId) || null
  }

  // ============================================================================
  // Бидирекционная связь Item ↔ Annotations
  // ============================================================================

  /**
   * Получить все аннотации для item
   */
  getAnnotationsByItemId(itemId: string): Annotation[] {
    return this.annotations.filter(a => a.item_id === itemId && !a.is_deleted)
  }

  /**
   * Получить item по annotation_id
   */
  getItemByAnnotationId(annotationId: string): Item | null {
    const annotation = this.annotations.find(a => a.id === annotationId)
    if (!annotation || !annotation.item_id) return null

    return this.items.find(i => i.id === annotation.item_id) || null
  }

  // ============================================================================
  // Валидация
  // ============================================================================

  /**
   * Проверить парность аннотаций между Main и Quality
   */
  checkParity(
    itemId: string,
    images: Image[]
  ): { main: number; quality: number; isValid: boolean } {
    const mainImage = images.find(img => img.image_type === 'main')
    const qualityImage = images.find(img => img.image_type === 'quality')

    const mainCount = mainImage
      ? this.annotations.filter(a => a.item_id === itemId && a.image_id === mainImage.id && !a.is_deleted).length
      : 0

    const qualityCount = qualityImage
      ? this.annotations.filter(a => a.item_id === itemId && a.image_id === qualityImage.id && !a.is_deleted).length
      : 0

    const item = this.items.find(i => i.id === itemId)
    const expectedCount = item?.expected_count

    // Валидация: если есть expected_count, то оба изображения должны иметь это количество
    const isValid = expectedCount !== undefined
      ? mainCount === expectedCount && qualityCount === expectedCount
      : mainCount === qualityCount && mainCount > 0

    return { main: mainCount, quality: qualityCount, isValid }
  }

  /**
   * Валидация этапа dishes
   */
  validateDishesStep(images: Image[]): ValidationResult {
    const checks: ValidationResult['checks'] = []
    const dishItems = this.items.filter(i => i.type === 'dish')

    for (const item of dishItems) {
      if (!item.expected_count) continue

      const parity = this.checkParity(item.id, images)

      if (parity.main !== item.expected_count) {
        checks.push({
          type: 'error',
          message: `Блюдо "${item.name}": на Main фото ${parity.main} шт., ожидается ${item.expected_count}`,
          action: 'Добавьте или удалите bbox на Main фото',
          field: `item_${item.id}_main`,
        })
      }

      if (parity.quality !== item.expected_count) {
        checks.push({
          type: 'error',
          message: `Блюдо "${item.name}": на Quality фото ${parity.quality} шт., ожидается ${item.expected_count}`,
          action: 'Добавьте или удалите bbox на Quality фото',
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
   * Валидация этапа plates/buzzers (парность без expected_count)
   */
  validateParityStep(objectType: 'plate' | 'buzzer', images: Image[]): ValidationResult {
    const mainImage = images.find(img => img.image_type === 'main')
    const qualityImage = images.find(img => img.image_type === 'quality')

    const mainCount = mainImage
      ? this.annotations.filter(a => a.object_type === objectType && a.image_id === mainImage.id && !a.is_deleted).length
      : 0

    const qualityCount = qualityImage
      ? this.annotations.filter(a => a.object_type === objectType && a.image_id === qualityImage.id && !a.is_deleted).length
      : 0

    const checks: ValidationResult['checks'] = []

    if (mainCount === 0 && qualityCount === 0) {
      checks.push({
        type: 'error',
        message: `${objectType === 'plate' ? 'Тарелки' : 'Баззеры'} не найдены`,
        action: 'Нарисуйте bbox на обеих фотографиях',
      })
    } else if (mainCount !== qualityCount) {
      checks.push({
        type: 'error',
        message: `Количество ${objectType === 'plate' ? 'тарелок' : 'баззеров'} различается: Main=${mainCount}, Quality=${qualityCount}`,
        action: 'Убедитесь что количество одинаковое на обеих фотографиях',
      })
    }

    return {
      canComplete: checks.filter(c => c.type === 'error').length === 0,
      checks,
    }
  }

  // ============================================================================
  // Item Management
  // ============================================================================

  /**
   * Создать новый Item
   */
  createItem(params: {
    type: Item['type']
    name: string
    expected_count?: number
    source: Item['source']
    is_manual: boolean
    pairing_required: boolean
    metadata?: Item['metadata']
  }): Item {
    const newItem: Item = {
      id: `item_${Date.now()}_${Math.random()}`,
      type: params.type,
      name: params.name,
      expected_count: params.expected_count,
      source: params.source,
      is_manual: params.is_manual,
      pairing_required: params.pairing_required,
      metadata: params.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    this.items.push(newItem)
    return newItem
  }

  /**
   * Обновить Item
   */
  updateItem(id: string, updates: Partial<Item>): Item | null {
    const index = this.items.findIndex(i => i.id === id)
    if (index === -1) return null

    this.items[index] = {
      ...this.items[index],
      ...updates,
      updated_at: new Date().toISOString(),
    }

    return this.items[index]
  }

  /**
   * Получить все Items
   */
  getItems(): Item[] {
    return this.items
  }

  /**
   * Получить Items по типу
   */
  getItemsByType(type: Item['type']): Item[] {
    return this.items.filter(i => i.type === type)
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Получить все аннотации (включая удаленные)
   */
  getAllAnnotations(): Annotation[] {
    return this.annotations
  }

  /**
   * Установить аннотации (для синхронизации с сервером)
   */
  setAnnotations(annotations: Annotation[]): void {
    this.annotations = annotations
  }

  /**
   * Установить Items
   */
  setItems(items: Item[]): void {
    this.items = items
  }
}

/**
 * Singleton instance (опционально)
 */
let engineInstance: AnnotationEngine | null = null

export function getAnnotationEngine(): AnnotationEngine {
  if (!engineInstance) {
    engineInstance = new AnnotationEngine()
  }
  return engineInstance
}

export function resetAnnotationEngine(): void {
  engineInstance = null
}

