/**
 * Migration Helpers - утилиты для конвертации между старой и новой архитектурой
 * 
 * Помогает постепенно мигрировать с:
 * - Dish[] → Item[]
 * - dish_index → item_id
 * - старый validation.ts → новый stepGuards.ts
 */

import type { Dish, Item, Annotation, DishFromReceipt } from '@/types/annotations'

/**
 * Конвертировать массив Dish в Item[]
 */
export function dishesToItems(dishes: Dish[]): Item[] {
  return dishes.map((dish, index) => ({
    id: `dish_${index}_${dish.externalId || Date.now()}`,
    type: 'dish' as const,
    name: dish.name,
    expected_count: dish.count,
    source: 'receipt' as const,
    is_manual: false,
    pairing_required: true,
    metadata: {
      external_id: dish.externalId,
      dish_index: index,
      price: dish.price,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))
}

/**
 * Конвертировать DishFromReceipt[] (raw format) в Item[]
 */
export function dishFromReceiptToItems(dishesFromReceipt: DishFromReceipt[]): Item[] {
  const items: Item[] = []
  
  dishesFromReceipt.forEach((dishGroup, groupIndex) => {
    const count = dishGroup.Count
    const dishes = dishGroup.Dishes || []
    
    // Если вариантов несколько - создаем один item с variants в metadata
    if (dishes.length > 1) {
      const variants = dishes.map(d => d.Name)
      items.push({
        id: `dish_${groupIndex}_${dishes[0].ExternalId || Date.now()}`,
        type: 'dish',
        name: dishes[0].Name, // По умолчанию первый вариант
        expected_count: count,
        source: 'receipt',
        is_manual: false,
        pairing_required: true,
        metadata: {
          external_id: dishes[0].ExternalId,
          dish_index: groupIndex,
          variants,
          needs_resolution: true, // Флаг что нужно выбрать из вариантов
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    } else if (dishes.length === 1) {
      // Один вариант - просто создаем item
      items.push({
        id: `dish_${groupIndex}_${dishes[0].ExternalId || Date.now()}`,
        type: 'dish',
        name: dishes[0].Name,
        expected_count: count,
        source: 'receipt',
        is_manual: false,
        pairing_required: true,
        metadata: {
          external_id: dishes[0].ExternalId,
          dish_index: groupIndex,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  })
  
  return items
}

/**
 * Обновить аннотации: установить item_id на основе dish_index
 * (для обратной совместимости со старыми аннотациями)
 */
export function linkAnnotationsToItems(
  annotations: Annotation[],
  items: Item[]
): Annotation[] {
  return annotations.map(ann => {
    // Если уже есть item_id, оставляем как есть
    if (ann.item_id) return ann
    
    // Ищем item по dish_index
    if (ann.dish_index !== null) {
      const item = items.find(i => i.metadata?.dish_index === ann.dish_index)
      if (item) {
        return {
          ...ann,
          item_id: item.id,
        }
      }
    }
    
    return ann
  })
}

/**
 * Обновить аннотации: установить is_manual на основе source
 */
export function migrateAnnotationFlags(annotations: Annotation[]): Annotation[] {
  return annotations.map(ann => ({
    ...ann,
    is_manual: ann.is_manual ?? (ann.source === 'manual'),
    is_locked: ann.is_locked ?? false,
    version: ann.version ?? 1,
  }))
}

/**
 * Получить Dish[] из Item[] (для обратной совместимости)
 */
export function itemsToDishes(items: Item[]): Dish[] {
  return items
    .filter(i => i.type === 'dish')
    .map(item => ({
      name: item.name,
      count: item.expected_count || 1,
      externalId: item.metadata?.external_id || '',
      price: item.metadata?.price,
    }))
}

/**
 * Создать Items из аннотаций (автоматическая группировка)
 * Используется для plates/buzzers/bottles где нет явного списка items
 */
export function createItemsFromAnnotations(
  annotations: Annotation[],
  objectType: 'plate' | 'buzzer' | 'bottle' | 'nonfood'
): Item[] {
  const filteredAnnotations = annotations.filter(
    a => a.object_type === objectType && !a.is_deleted
  )
  
  if (filteredAnnotations.length === 0) return []
  
  // Группируем по object_subtype для баззеров (по цвету)
  if (objectType === 'buzzer') {
    const grouped = new Map<string, Annotation[]>()
    
    filteredAnnotations.forEach(ann => {
      const key = ann.object_subtype || 'unknown'
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(ann)
    })
    
    return Array.from(grouped.entries()).map(([color, anns], index) => ({
      id: `buzzer_${color}_${index}`,
      type: 'buzzer',
      name: `Баззер ${color}`,
      source: 'qwen',
      is_manual: false,
      pairing_required: true,
      metadata: {
        color,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
  }
  
  // Для остальных типов создаем один общий item
  return [{
    id: `${objectType}_group`,
    type: objectType,
    name: `${objectType.charAt(0).toUpperCase() + objectType.slice(1)}`,
    source: 'qwen',
    is_manual: false,
    pairing_required: objectType !== 'nonfood',
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }]
}

/**
 * Полная миграция task data в новую архитектуру
 */
export interface MigratedTaskData {
  items: Item[]
  annotations: Annotation[]
}

export function migrateTaskData(
  dishesFromReceipt: DishFromReceipt[],
  annotations: Annotation[]
): MigratedTaskData {
  // 1. Конвертируем dishes в items
  let items = dishFromReceiptToItems(dishesFromReceipt)
  
  // 2. Обновляем флаги в аннотациях
  let migratedAnnotations = migrateAnnotationFlags(annotations)
  
  // 3. Связываем аннотации с items
  migratedAnnotations = linkAnnotationsToItems(migratedAnnotations, items)
  
  // 4. Создаем items для plates/buzzers/bottles из аннотаций
  const plateItems = createItemsFromAnnotations(migratedAnnotations, 'plate')
  const buzzerItems = createItemsFromAnnotations(migratedAnnotations, 'buzzer')
  const bottleItems = createItemsFromAnnotations(migratedAnnotations, 'bottle')
  const nonfoodItems = createItemsFromAnnotations(migratedAnnotations, 'nonfood')
  
  // 5. Связываем эти аннотации с созданными items
  migratedAnnotations = migratedAnnotations.map(ann => {
    if (ann.item_id) return ann // Уже связано
    
    if (ann.object_type === 'plate' && plateItems[0]) {
      return { ...ann, item_id: plateItems[0].id }
    }
    if (ann.object_type === 'bottle' && bottleItems[0]) {
      return { ...ann, item_id: bottleItems[0].id }
    }
    if (ann.object_type === 'nonfood' && nonfoodItems[0]) {
      return { ...ann, item_id: nonfoodItems[0].id }
    }
    if (ann.object_type === 'buzzer') {
      const buzzerItem = buzzerItems.find(i => i.metadata?.color === ann.object_subtype)
      if (buzzerItem) {
        return { ...ann, item_id: buzzerItem.id }
      }
    }
    
    return ann
  })
  
  return {
    items: [...items, ...plateItems, ...buzzerItems, ...bottleItems, ...nonfoodItems],
    annotations: migratedAnnotations,
  }
}

