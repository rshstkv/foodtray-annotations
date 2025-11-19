'use client'

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  ItemType,
  BuzzerColor,
  RecipeLineOption,
  ActiveMenuItem,
} from '@/types/domain'
import { ITEM_TYPE_LABELS, BUZZER_COLOR_LABELS } from '@/types/domain'
import { Search } from 'lucide-react'

interface ItemDialogProps {
  open: boolean
  onClose: () => void
  onSave: (data: {
    type: ItemType
    recipe_line_id?: number
    menu_item_external_id?: string
    metadata?: Record<string, unknown>
  }) => void
  itemType: ItemType
  recipeLineOptions?: RecipeLineOption[]
  activeMenu?: ActiveMenuItem[]
}

export function ItemDialog({
  open,
  onClose,
  onSave,
  itemType,
  recipeLineOptions = [],
  activeMenu = [],
}: ItemDialogProps) {
  const [selectedRecipeOption, setSelectedRecipeOption] = useState<string>('')
  const [selectedMenuItem, setSelectedMenuItem] = useState<string>('')
  const [buzzerColor, setBuzzerColor] = useState<BuzzerColor>('green')
  const [customLabel, setCustomLabel] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [menuSearch, setMenuSearch] = useState('')

  // Фильтрация блюд из меню по поисковому запросу
  const filteredActiveMenu = useMemo(() => {
    if (!menuSearch.trim()) {
      return activeMenu
    }
    const searchLower = menuSearch.toLowerCase()
    return activeMenu.filter(item => 
      item.name.toLowerCase().includes(searchLower) ||
      item.external_id.toLowerCase().includes(searchLower)
    )
  }, [activeMenu, menuSearch])

  const handleSave = () => {
    const data: {
      type: ItemType
      recipe_line_id?: number
      menu_item_external_id?: string
      quantity?: number
      metadata?: Record<string, unknown>
    } = {
      type: itemType,
      quantity,
    }

    // Для FOOD с выбором из чека
    if (itemType === 'FOOD' && selectedRecipeOption) {
      data.recipe_line_id = parseInt(selectedRecipeOption, 10)
    }
    // Для FOOD с выбором из меню
    else if (itemType === 'FOOD' && selectedMenuItem) {
      data.menu_item_external_id = selectedMenuItem
    }
    // Для BUZZER - сохраняем цвет
    else if (itemType === 'BUZZER') {
      data.metadata = { color: buzzerColor }
    }
    // Для других типов с кастомным лейблом
    else if (customLabel) {
      data.metadata = { label: customLabel }
    }

    onSave(data)
    handleClose()
  }

  const handleClose = () => {
    // Сбросить состояние поиска и выбора при закрытии
    setMenuSearch('')
    setSelectedMenuItem('')
    setSelectedRecipeOption('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Добавить {ITEM_TYPE_LABELS[itemType].toLowerCase()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1">
          {/* Для FOOD: выбор из чека или меню */}
          {itemType === 'FOOD' && recipeLineOptions.length > 0 && (
            <div className="space-y-2">
              <Label>Блюдо из чека</Label>
              <Select value={selectedRecipeOption} onValueChange={setSelectedRecipeOption}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите блюдо" />
                </SelectTrigger>
                <SelectContent>
                  {recipeLineOptions.filter(option => option && option.id).map((option) => (
                    <SelectItem key={option.id} value={String(option.id)}>
                      {option.name} ({option.external_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {itemType === 'FOOD' && activeMenu.length > 0 && (
            <div className="space-y-2">
              <Label>Блюдо из меню</Label>
              
              {/* Поле поиска */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Поиск по названию или EAN..."
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Список блюд */}
              <div className="border rounded-md max-h-60 overflow-y-auto">
                {filteredActiveMenu.filter(item => item && item.external_id).length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">
                    Ничего не найдено
                  </div>
                ) : (
                  filteredActiveMenu.filter(item => item && item.external_id).map((item) => (
                    <button
                      key={item.external_id}
                      type="button"
                      onClick={() => setSelectedMenuItem(item.external_id)}
                      className={`w-full text-left px-4 py-2 hover:bg-gray-100 border-b last:border-b-0 transition-colors ${
                        selectedMenuItem === item.external_id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                      }`}
                    >
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-gray-500">EAN: {item.external_id}</div>
                      {item.category && (
                        <div className="text-xs text-gray-400 mt-1">{item.category}</div>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Показать выбранное блюдо */}
              {selectedMenuItem && (
                <div className="text-sm text-green-600 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Выбрано: {activeMenu.find(item => item.external_id === selectedMenuItem)?.name}
                </div>
              )}
            </div>
          )}

          {/* Для BUZZER: выбор цвета */}
          {itemType === 'BUZZER' && (
            <div className="space-y-2">
              <Label>Цвет пейджера</Label>
              <Select
                value={buzzerColor}
                onValueChange={(v) => setBuzzerColor(v as BuzzerColor)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BUZZER_COLOR_LABELS) as BuzzerColor[]).map((color) => (
                    <SelectItem key={color} value={color}>
                      {BUZZER_COLOR_LABELS[color]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Для других типов: название (если нужно) */}
          {itemType !== 'BUZZER' && itemType !== 'FOOD' && itemType !== 'PLATE' && itemType !== 'BOTTLE' && (
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Введите название"
              />
            </div>
          )}

          {/* Количество (для всех типов) */}
          <div className="space-y-2">
            <Label>Количество</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Отмена
          </Button>
          <Button onClick={handleSave}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

