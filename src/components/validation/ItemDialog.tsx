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
  TrayItemSource,
  RecipeLineOption,
  ActiveMenuItem,
} from '@/types/domain'
import { ITEM_TYPE_LABELS, BUZZER_COLOR_LABELS } from '@/types/domain'

interface ItemDialogProps {
  open: boolean
  onClose: () => void
  onSave: (data: {
    item_type: ItemType
    source: TrayItemSource
    recipe_line_option_id?: number
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
  const [source, setSource] = useState<TrayItemSource>('MANUAL')
  const [selectedRecipeOption, setSelectedRecipeOption] = useState<string>('')
  const [selectedMenuItem, setSelectedMenuItem] = useState<string>('')
  const [buzzerColor, setBuzzerColor] = useState<BuzzerColor>('green')
  const [customLabel, setCustomLabel] = useState('')

  const handleSave = () => {
    const data: {
      item_type: ItemType
      source: TrayItemSource
      recipe_line_option_id?: number
      menu_item_external_id?: string
      metadata?: Record<string, unknown>
    } = {
      item_type: itemType,
      source,
    }

    if (source === 'RECIPE_LINE_OPTION' && selectedRecipeOption) {
      data.recipe_line_option_id = parseInt(selectedRecipeOption, 10)
    } else if (source === 'MENU_ITEM' && selectedMenuItem) {
      data.menu_item_external_id = selectedMenuItem
    } else if (source === 'MANUAL') {
      if (itemType === 'BUZZER') {
        data.metadata = { color: buzzerColor }
      } else if (customLabel) {
        data.metadata = { label: customLabel }
      }
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
          {/* Source */}
          <div className="space-y-2">
            <Label>Источник</Label>
            <Select value={source} onValueChange={(v) => setSource(v as TrayItemSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {itemType === 'FOOD' && recipeLineOptions.length > 0 && (
                  <SelectItem value="RECIPE_LINE_OPTION">Из чека</SelectItem>
                )}
                {itemType === 'FOOD' && activeMenu.length > 0 && (
                  <SelectItem value="MENU_ITEM">Из меню</SelectItem>
                )}
                <SelectItem value="MANUAL">Вручную</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Recipe option */}
          {source === 'RECIPE_LINE_OPTION' && recipeLineOptions.length > 0 && (
            <div className="space-y-2">
              <Label>Блюдо из чека</Label>
              <Select value={selectedRecipeOption} onValueChange={setSelectedRecipeOption}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите блюдо" />
                </SelectTrigger>
                <SelectContent>
                  {recipeLineOptions.map((option) => (
                    <SelectItem key={option.id} value={String(option.id)}>
                      {option.name} ({option.external_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Menu item */}
          {source === 'MENU_ITEM' && activeMenu.length > 0 && (
            <div className="space-y-2">
              <Label>Блюдо из меню</Label>
              <Select value={selectedMenuItem} onValueChange={setSelectedMenuItem}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите блюдо" />
                </SelectTrigger>
                <SelectContent>
                  {activeMenu.map((item) => (
                    <SelectItem key={item.external_id} value={item.external_id}>
                      {item.name} ({item.external_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Manual input */}
          {source === 'MANUAL' && (
            <>
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
              {itemType !== 'BUZZER' && itemType !== 'FOOD' && (
                <div className="space-y-2">
                  <Label>Название</Label>
                  <Input
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="Введите название"
                  />
                </div>
              )}
            </>
          )}
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

