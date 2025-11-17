'use client'

import { useState } from 'react'
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
} from '@/types/domain'
import { ITEM_TYPE_LABELS, BUZZER_COLOR_LABELS } from '@/types/domain'

interface EditItemDialogProps {
  open: boolean
  onClose: () => void
  onSave: (id: number, data: UpdateItemRequest) => void
  item: TrayItem
  recipeLineOptions: RecipeLineOption[]
}

export function EditItemDialog({
  open,
  onClose,
  onSave,
  item,
  recipeLineOptions,
}: EditItemDialogProps) {
  const [quantity, setQuantity] = useState(item.quantity)
  const [selectedRecipeLineId, setSelectedRecipeLineId] = useState(
    item.recipe_line_id ? String(item.recipe_line_id) : ''
  )
  const [buzzerColor, setBuzzerColor] = useState<BuzzerColor>(
    (item.metadata?.color as BuzzerColor) || 'green'
  )

  const handleSave = () => {
    const updates: UpdateItemRequest = { quantity }

    // Для FOOD: можно изменить recipe_line_id (выбор другого блюда)
    if (item.type === 'FOOD' && selectedRecipeLineId) {
      updates.recipe_line_id = parseInt(selectedRecipeLineId)
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

          {/* Для FOOD: выбор recipe_line */}
          {item.type === 'FOOD' && item.recipe_line_id && (
            <div className="space-y-2">
              <Label>Блюдо из чека</Label>
              <Select
                value={selectedRecipeLineId}
                onValueChange={setSelectedRecipeLineId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {recipeLineOptions
                    .filter((opt) => opt && opt.recipe_line_id === item.recipe_line_id)
                    .map((option) => (
                      <SelectItem key={option.id} value={String(option.recipe_line_id)}>
                        {option.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Изменить выбор если была неопределенность
              </p>
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

