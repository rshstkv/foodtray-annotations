'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'

interface MenuSearchPanelProps {
  menuItems: string[]
  onSelectDish: (dishName: string) => void
  onClose: () => void
}

export function MenuSearchPanel({
  menuItems,
  onSelectDish,
  onClose,
}: MenuSearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // Filter menu items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return menuItems

    const query = searchQuery.toLowerCase()
    return menuItems.filter(item => 
      item.toLowerCase().includes(query)
    )
  }, [menuItems, searchQuery])

  return (
    <div className="fixed right-0 top-0 bottom-0 w-96 bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">
            Активное меню
          </h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Поиск блюд..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Menu items list */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, index) => (
              <button
                key={index}
                onClick={() => onSelectDish(item)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 text-sm transition-colors"
              >
                {item}
              </button>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              Ничего не найдено
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 text-xs text-gray-500">
        {filteredItems.length} блюд из {menuItems.length}
      </div>
    </div>
  )
}

