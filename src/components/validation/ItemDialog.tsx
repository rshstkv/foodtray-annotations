'use client'

import { useState } from 'react'
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
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Добавить {ITEM_TYPE_LABELS[itemType].toLowerCase()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
              <Select value={selectedMenuItem} onValueChange={setSelectedMenuItem}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите блюдо" />
                </SelectTrigger>
                <SelectContent>
                  {activeMenu.filter(item => item && item.external_id).map((item) => (
                    <SelectItem key={item.external_id} value={item.external_id}>
                      {item.name} ({item.external_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSave}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

