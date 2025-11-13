/**
 * useMenuModal - унифицированный хук для Add/Edit операций через меню
 * 
 * Поддерживает два режима:
 * - 'add' - создание нового Item + пустых аннотаций
 * - 'edit' - изменение существующего Item
 */

'use client'

import { useState, useCallback } from 'react'
import type { Item } from '@/types/annotations'

export type MenuModalMode = 'add' | 'edit'

export interface UseMenuModalReturn {
  isOpen: boolean
  mode: MenuModalMode
  selectedItem: Item | null
  
  // Actions
  openForAdd: () => void
  openForEdit: (item: Item) => void
  close: () => void
  handleSelect: (dishName: string, externalId?: string) => void
}

interface UseMenuModalOptions {
  onAdd: (dishName: string, externalId?: string) => void | Promise<void>
  onEdit: (item: Item, newDishName: string, externalId?: string) => void | Promise<void>
}

export function useMenuModal(options: UseMenuModalOptions): UseMenuModalReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<MenuModalMode>('add')
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)

  const openForAdd = useCallback(() => {
    setMode('add')
    setSelectedItem(null)
    setIsOpen(true)
  }, [])

  const openForEdit = useCallback((item: Item) => {
    setMode('edit')
    setSelectedItem(item)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setSelectedItem(null)
  }, [])

  const handleSelect = useCallback(async (dishName: string, externalId?: string) => {
    if (mode === 'add') {
      await options.onAdd(dishName, externalId)
    } else if (mode === 'edit' && selectedItem) {
      await options.onEdit(selectedItem, dishName, externalId)
    }
    
    close()
  }, [mode, selectedItem, options, close])

  return {
    isOpen,
    mode,
    selectedItem,
    openForAdd,
    openForEdit,
    close,
    handleSelect,
  }
}

/**
 * Пример использования:
 * 
 * const menuModal = useMenuModal({
 *   onAdd: async (dishName, externalId) => {
 *     // Создаем новый Item
 *     const newItem = engine.createItem({
 *       type: 'dish',
 *       name: dishName,
 *       source: 'menu',
 *       is_manual: true,
 *       expected_count: 1,
 *       metadata: { external_id: externalId },
 *     })
 *     
 *     // Создаем пустые аннотации на обеих картинках
 *     images.forEach(img => {
 *       engine.createAnnotation({
 *         item_id: newItem.id,
 *         image_id: img.id,
 *         bbox: { x1: 0.4, y1: 0.4, x2: 0.6, y2: 0.6 },
 *         source: 'manual',
 *         created_by: userId,
 *       })
 *     })
 *     
 *     // Обновляем UI
 *     setSelectedItemId(newItem.id)
 *   },
 *   
 *   onEdit: async (item, newDishName, externalId) => {
 *     // Обновляем только название Item
 *     engine.updateItem(item.id, {
 *       name: newDishName,
 *       is_manual: true,
 *       metadata: {
 *         ...item.metadata,
 *         external_id: externalId,
 *       },
 *     })
 *   },
 * })
 * 
 * // В UI:
 * <Button onClick={menuModal.openForAdd}>Добавить из меню</Button>
 * <Button onClick={() => menuModal.openForEdit(item)}>Изменить</Button>
 * 
 * <MenuSearchModal
 *   isOpen={menuModal.isOpen}
 *   onClose={menuModal.close}
 *   onSelect={menuModal.handleSelect}
 *   mode={menuModal.mode}
 *   currentItemName={menuModal.selectedItem?.name}
 * />
 */

