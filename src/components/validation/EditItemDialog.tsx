'use client'

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  TrayItem,
  RecipeLineOption,
  UpdateItemRequest,
  BuzzerColor,
  ActiveMenuItem,
} from '@/types/domain'
import { ITEM_TYPE_LABELS, BUZZER_COLOR_LABELS } from '@/types/domain'
import { Search } from 'lucide-react'

interface EditItemDialogProps {
  open: boolean
  onClose: () => void
  onSave: (id: number, data: UpdateItemRequest) => void
  item: TrayItem
  recipeLineOptions: RecipeLineOption[]
  activeMenu?: ActiveMenuItem[]
}

export function EditItemDialog({
  open,
  onClose,
  onSave,
  item,
  recipeLineOptions,
  activeMenu = [],
}: EditItemDialogProps) {
  const [quantity, setQuantity] = useState(item.quantity)
  const [selectedRecipeLineId, setSelectedRecipeLineId] = useState(
    item.recipe_line_id ? String(item.recipe_line_id) : ''
  )
  const [selectedMenuItem, setSelectedMenuItem] = useState<string>('')
  const [menuSearch, setMenuSearch] = useState('')
  const [buzzerColor, setBuzzerColor] = useState<BuzzerColor>(
    (item.metadata?.color as BuzzerColor) || 'green'
  )

  // Фильтрация блюд из меню по поисковому запросу
  const filteredActiveMenu = useMemo(() => {
    if (!menuSearch.trim()) {
      return activeMenu
    }
    const searchLower = menuSearch.toLowerCase()
    return activeMenu.filter(menuItem => 
      menuItem.name.toLowerCase().includes(searchLower) ||
      menuItem.external_id.toLowerCase().includes(searchLower)
    )
  }, [activeMenu, menuSearch])

  const handleSave = () => {
    const updates: UpdateItemRequest = { quantity }

    // Для FOOD: можно изменить на блюдо из активного меню
    if (item.type === 'FOOD' && selectedMenuItem) {
      const menuItem = activeMenu.find(m => m.external_id === selectedMenuItem)
      if (menuItem) {
        updates.recipe_line_id = null // Убираем привязку к чеку
        updates.metadata = {
          menu_item_external_id: menuItem.external_id,
          name: menuItem.name,
        }
      }
    }
    // Для FOOD: можно изменить recipe_line_id (выбор другого блюда из чека)
    else if (item.type === 'FOOD' && selectedRecipeLineId) {
      updates.recipe_line_id = parseInt(selectedRecipeLineId)
      updates.metadata = null // Убираем metadata.name если переключаемся на чек
    }

    // Для BUZZER: можно изменить цвет
    if (item.type === 'BUZZER') {
      updates.metadata = { color: buzzerColor }
    }

    onSave(item.id, updates)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редактировать {ITEM_TYPE_LABELS[item.type]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Quantity */}
          <div className="space-y-2">
            <Label>Количество</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            />
          </div>

          {/* Для FOOD: выбор из чека (показываем ВСЕ блюда) */}
          {item.type === 'FOOD' && recipeLineOptions.length > 0 && (
            <div className="space-y-2">
              <Label>Блюдо из чека</Label>
              <Select value={selectedRecipeLineId} onValueChange={setSelectedRecipeLineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите блюдо из чека" />
                </SelectTrigger>
                <SelectContent>
                  {recipeLineOptions
                    .filter(option => option && option.recipe_line_id)
                    .map((option) => (
                      <SelectItem key={option.id} value={String(option.recipe_line_id)}>
                        {option.name} ({option.external_id})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Можно выбрать другое блюдо из чека
              </p>
            </div>
          )}

          {/* Для FOOD: выбор из активного меню */}
          {item.type === 'FOOD' && activeMenu.length > 0 && (
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
                {filteredActiveMenu.filter(menuItem => menuItem && menuItem.external_id).length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">
                    Ничего не найдено
                  </div>
                ) : (
                  filteredActiveMenu.filter(menuItem => menuItem && menuItem.external_id).map((menuItem) => (
                    <button
                      key={menuItem.external_id}
                      type="button"
                      onClick={() => setSelectedMenuItem(menuItem.external_id)}
                      className={`w-full text-left px-4 py-2 hover:bg-gray-100 border-b last:border-b-0 transition-colors ${
                        selectedMenuItem === menuItem.external_id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                      }`}
                    >
                      <div className="font-medium">{menuItem.name}</div>
                      <div className="text-sm text-gray-500">EAN: {menuItem.external_id}</div>
                      {menuItem.category && (
                        <div className="text-xs text-gray-400 mt-1">{menuItem.category}</div>
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
                  Выбрано: {activeMenu.find(menuItem => menuItem.external_id === selectedMenuItem)?.name}
                </div>
              )}
            </div>
          )}

          {/* Для BUZZER: выбор цвета */}
          {item.type === 'BUZZER' && (
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSave}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

