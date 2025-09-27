'use client'

import { useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

interface MultiSelectFilterProps {
  label: string
  value: string[]
  options: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  maxDisplayItems?: number
}

export function MultiSelectFilter({
  label,
  value,
  options,
  onChange,
  placeholder = "Выберите элементы",
  maxDisplayItems = 2
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (option: string) => {
    const newValue = value.includes(option)
      ? value.filter((item) => item !== option)
      : [...value, option]
    
    onChange(newValue)
  }

  const handleRemove = (option: string) => {
    onChange(value.filter((item) => item !== option))
  }

  const displayedItems = value.slice(0, maxDisplayItems)
  const remainingCount = Math.max(0, value.length - maxDisplayItems)

  return (
    <div className="space-y-2">
      {label && <Label className="text-sm font-medium">{label}</Label>}
      
      {/* Показанные выбранные элементы */}
      {value.length > 0 && label && (
        <div className="flex flex-wrap gap-1 mb-2">
          {displayedItems.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className="text-xs px-2 py-1 flex items-center gap-1"
            >
              <span className="truncate max-w-[100px]" title={item}>
                {item}
              </span>
              <button
                onClick={() => handleRemove(item)}
                className="text-gray-400 hover:text-gray-600 ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {remainingCount > 0 && (
            <Badge variant="outline" className="text-xs px-2 py-1">
              +{remainingCount}
            </Badge>
          )}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={`w-full justify-between text-left font-normal ${!label ? 'h-8 text-sm' : ''}`}
          >
            <span className="truncate">
              {value.length === 0
                ? placeholder
                : value.length === 1
                ? value[0]
                : `${value.length} выбрано`}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput 
              placeholder={`Поиск в ${label.toLowerCase()}...`} 
              className="h-9"
            />
            <CommandList>
              <CommandEmpty>Ничего не найдено.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => handleSelect(option)}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate flex-1" title={option}>
                      {option}
                    </span>
                    {value.includes(option) && (
                      <Check className="ml-2 h-4 w-4 text-blue-600" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
