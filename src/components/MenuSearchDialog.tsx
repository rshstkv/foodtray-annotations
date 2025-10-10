'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MenuItem } from '@/hooks/useInfiniteClarifications'

interface MenuSearchDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (item: MenuItem) => void
}

export function MenuSearchDialog({ isOpen, onClose, onSelect }: MenuSearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<MenuItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load initial items when dialog opens
  useEffect(() => {
    if (!isOpen) return

    // Load all items as initial catalog
    const loadInitial = async () => {
      setIsSearching(true)
      try {
        const response = await fetch('/api/menu-items?search=a&limit=1000')
        if (response.ok) {
          const data = await response.json()
          setResults(data.items || [])
        }
      } catch (err) {
        console.error('Failed to load initial items:', err)
      } finally {
        setIsSearching(false)
      }
    }

    if (!searchQuery) {
      loadInitial()
    }
  }, [isOpen, searchQuery])

  // Debounced search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      return
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true)
      setError(null)

      try {
        const response = await fetch(
          `/api/menu-items?search=${encodeURIComponent(searchQuery)}&limit=1000`
        )

        if (!response.ok) {
          throw new Error('Failed to search menu items')
        }

        const data = await response.json()
        setResults(data.items || [])
      } catch (err) {
        console.error('Search error:', err)
        setError('Ошибка поиска. Попробуйте ещё раз.')
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  const handleSelect = useCallback((item: MenuItem) => {
    onSelect(item)
    onClose()
    setSearchQuery('')
    setResults([])
  }, [onSelect, onClose])

  const handleClose = useCallback(() => {
    onClose()
    setSearchQuery('')
    setResults([])
    setError(null)
  }, [onClose])

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">Поиск блюда</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search input */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Название блюда или EAN код..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 text-base"
              autoFocus
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Введите минимум 2 символа для поиска
          </p>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {isSearching && (
            <div className="text-center py-8 text-gray-500">
              Поиск...
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-red-600">
              {error}
            </div>
          )}

          {!isSearching && !error && searchQuery.length >= 2 && results.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Ничего не найдено
            </div>
          )}

          {!isSearching && !error && !searchQuery && results.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              Загрузка каталога...
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((item) => (
                <Card
                  key={item.id}
                  className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => handleSelect(item)}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 truncate">
                        {item.product_name}
                      </h3>
                      {item.english_name && (
                        <p className="text-sm text-gray-600 truncate">
                          {item.english_name}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2 text-xs">
                        {item.ean && (
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">
                            EAN: {item.ean}
                          </span>
                        )}
                        {item.super_class && (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                            {item.super_class}
                          </span>
                        )}
                        {item.proto_name && (
                          <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono">
                            {item.proto_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0 bg-green-600 hover:bg-green-700"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelect(item)
                      }}
                    >
                      Выбрать
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 text-center text-sm text-gray-500">
          Найдено: {results.length} блюд
        </div>
      </div>
    </div>
  )
}

