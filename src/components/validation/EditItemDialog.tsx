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
  RecipeLine,
  RecipeLineOption,
  UpdateItemRequest,
  BuzzerColor,
  ActiveMenuItem,
} from '@/types/domain'
import { ITEM_TYPE_LABELS, BUZZER_COLOR_LABELS } from '@/types/domain'
import { Search, AlertCircle } from 'lucide-react'

interface EditItemDialogProps {
  open: boolean
  onClose: () => void
  onSave: (id: number, data: UpdateItemRequest) => void
  item: TrayItem
  recipeLines: RecipeLine[]
  recipeLineOptions: RecipeLineOption[]
  activeMenu?: ActiveMenuItem[]
}

export function EditItemDialog({
  open,
  onClose,
  onSave,
  item,
  recipeLines,
  recipeLineOptions,
  activeMenu = [],
}: EditItemDialogProps) {
  const [quantity, setQuantity] = useState(item.quantity)
  const [selectedRecipeLineId, setSelectedRecipeLineId] = useState(
    item.recipe_line_id ? String(item.recipe_line_id) : ''
  )
  const [selectedOptionId, setSelectedOptionId] = useState<string>('') // Для выбора конкретного option
  const [selectedMenuItem, setSelectedMenuItem] = useState<string>('')
  const [menuSearch, setMenuSearch] = useState('')
  const [buzzerColor, setBuzzerColor] = useState<BuzzerColor>(
    (item.metadata?.color as BuzzerColor) || 'green'
  )

  // Группируем options по recipe_line_id
  const optionsByRecipeLine = useMemo(() => {
    const map = new Map<number, RecipeLineOption[]>()
    recipeLineOptions.forEach(option => {
      if (!map.has(option.recipe_line_id)) {
        map.set(option.recipe_line_id, [])
      }
      map.get(option.recipe_line_id)!.push(option)
    })
    return map
  }, [recipeLineOptions])

  // Получить название для recipe_line
  const getRecipeLineName = (recipeLineId: number): string => {
    const recipeLine = recipeLines.find(rl => rl.id === recipeLineId)
    const options = optionsByRecipeLine.get(recipeLineId) || []
    
    // DEBUG
    if (options.length === 0) {
      console.warn(`[EditItemDialog] No options for recipe_line ${recipeLineId}. RecipeLine:`, recipeLine)
    }
    
    // Если есть выбранный option - берем его название
    const selectedOption = options.find(opt => opt.is_selected)
    if (selectedOption) return selectedOption.name
    // Иначе берем первый доступный
    if (options.length > 0) return options[0].name
    // Fallback на raw_name из recipe_line
    if (recipeLine?.raw_name) return recipeLine.raw_name
    
    return 'Без названия'
  }

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
      const recipeLineId = parseInt(selectedRecipeLineId)
      updates.recipe_line_id = recipeLineId
      updates.metadata = null // Убираем metadata.name если переключаемся на чек
      
      // Если выбран конкретный option (разрешение неопределенности)
      if (selectedOptionId) {
        updates.selected_option_id = parseInt(selectedOptionId)
      }
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

          {/* Для FOOD: выбор из чека (показываем строки чека) */}
          {item.type === 'FOOD' && (
            <div className="space-y-2">
              <Label>Блюдо из чека</Label>
              {recipeLines.length > 0 ? (
                <>
                  {/* Выбор строки чека */}
                  <Select value={selectedRecipeLineId} onValueChange={(value) => {
                    setSelectedRecipeLineId(value)
                    setSelectedOptionId('') // Сбросить выбор option при смене recipe_line
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите блюдо из чека" />
                    </SelectTrigger>
                    <SelectContent>
                      {recipeLines.map((recipeLine) => {
                        const options = optionsByRecipeLine.get(recipeLine.id) || []
                        const hasAmbiguity = options.length > 1
                        return (
                          <SelectItem key={recipeLine.id} value={String(recipeLine.id)}>
                            {getRecipeLineName(recipeLine.id)} (кол-во: {recipeLine.quantity})
                            {hasAmbiguity && <span className="ml-2 text-orange-600">⚠️ неопределенность</span>}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>

                  {/* Если у выбранного recipe_line есть несколько options - показываем выбор */}
                  {selectedRecipeLineId && (() => {
                    const options = optionsByRecipeLine.get(parseInt(selectedRecipeLineId)) || []
                    if (options.length > 1) {
                      const hasSelected = options.some(opt => opt.is_selected)
                      const selectedOption = options.find(opt => opt.is_selected)
                      
                      return (
                        <div className={`p-3 border rounded-md space-y-2 ${
                          hasSelected 
                            ? 'bg-yellow-50 border-yellow-200' 
                            : 'bg-orange-50 border-orange-200'
                        }`}>
                          <p className={`text-sm font-medium flex items-center gap-2 ${
                            hasSelected ? 'text-yellow-900' : 'text-orange-900'
                          }`}>
                            <AlertCircle className="w-4 h-4" />
                            {hasSelected 
                              ? 'Проверьте выбор: можно изменить вариант' 
                              : 'Неопределенность: выберите правильный вариант'
                            }
                          </p>
                          
                          {hasSelected && selectedOption && (
                            <div className="px-3 py-2 bg-white border-l-4 border-l-green-500 rounded">
                              <p className="text-xs text-gray-600 mb-1">Сейчас выбрано:</p>
                              <p className="text-sm font-medium text-gray-900">
                                ✓ {selectedOption.name} ({selectedOption.external_id})
                              </p>
                            </div>
                          )}
                          
                          <Select 
                            value={selectedOptionId} 
                            onValueChange={setSelectedOptionId}
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="Выберите вариант" />
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((option) => (
                                <SelectItem 
                                  key={option.id} 
                                  value={String(option.id)}
                                  className={option.is_selected ? 'bg-green-50 font-medium' : ''}
                                >
                                  {option.is_selected && '✓ '}
                                  {option.name} ({option.external_id})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          <p className="text-xs text-gray-500 italic">
                            {hasSelected 
                              ? 'Если текущий выбор неверный - выберите другой вариант'
                              : 'Выберите правильное название для продолжения'
                            }
                          </p>
                        </div>
                      )
                    }
                    return null
                  })()}

                  <p className="text-xs text-gray-500">
                    Можно выбрать другое блюдо из чека
                  </p>
                </>
              ) : (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <p className="text-sm text-gray-600">
                    Нет чека для этого распознавания
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Все блюда были добавлены вручную или из активного меню
                  </p>
                </div>
              )}
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

