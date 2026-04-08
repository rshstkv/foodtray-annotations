'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Check } from 'lucide-react'
import { apiFetch } from '@/lib/api-response'
import type { ProductCatalogItem, ActiveMenuItem } from '@/types/domain'

interface ProductSelectorProps {
  open: boolean
  onClose: () => void
  onSelect: (product: ProductCatalogItem) => void
  currentName?: string
  currentProductType?: string
  activeMenu?: ActiveMenuItem[]
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  Bebida: 'Напитки',
  Prato: 'Блюда',
  Acompanhamento: 'Гарниры',
  Sobremesa: 'Десерты',
  Sopa: 'Супы',
  Adicionais: 'Доп.',
  PLATE: 'Тарелки',
  BUZZER_WHITE: 'Баззер (бел.)',
  BUZZER_GREEN: 'Баззер (зел.)',
}

export function ProductSelector({
  open,
  onClose,
  onSelect,
  currentName,
  currentProductType,
  activeMenu,
}: ProductSelectorProps) {
  const [search, setSearch] = useState('')
  const [productType, setProductType] = useState<string>(currentProductType || '')
  const [products, setProducts] = useState<ProductCatalogItem[]>([])
  const [allTypes, setAllTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedMenuIdx, setSelectedMenuIdx] = useState<number | null>(null)

  const useActiveMenu = Boolean(activeMenu && activeMenu.length > 0)

  // Local filtering for activeMenu mode
  const filteredMenu = useMemo(() => {
    if (!useActiveMenu || !activeMenu) return []
    const q = search.toLowerCase().trim()
    if (!q) return activeMenu
    return activeMenu.filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.external_id && item.external_id.toLowerCase().includes(q))
    )
  }, [activeMenu, search, useActiveMenu])

  // Catalog mode: fetch products from API
  const fetchProducts = useCallback(async (q: string, pt: string) => {
    if (useActiveMenu) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('search', q)
      if (pt && pt !== 'all') params.set('product_type', pt)
      const response = await apiFetch<{ products: ProductCatalogItem[] }>(
        `/api/test-split/catalog?${params.toString()}`
      )
      if (response.success && response.data) {
        setProducts(response.data.products)
      }
    } finally {
      setLoading(false)
    }
  }, [useActiveMenu])

  const fetchTypes = useCallback(async () => {
    if (useActiveMenu) return
    const response = await apiFetch<{ types: string[] }>(
      '/api/test-split/catalog?types_only=1'
    )
    if (response.success && response.data) {
      setAllTypes(response.data.types)
    }
  }, [useActiveMenu])

  useEffect(() => {
    if (open) {
      setSearch('')
      setSelectedId(null)
      setSelectedMenuIdx(null)
      setProductType(currentProductType || '')
      if (!useActiveMenu) {
        fetchProducts('', currentProductType || '')
        fetchTypes()
      }
    }
  }, [open, currentProductType, fetchProducts, fetchTypes, useActiveMenu])

  useEffect(() => {
    if (!open || useActiveMenu) return
    const timer = setTimeout(() => {
      fetchProducts(search, productType)
    }, 200)
    return () => clearTimeout(timer)
  }, [search, productType, open, fetchProducts, useActiveMenu])

  const handleSelect = () => {
    if (useActiveMenu) {
      if (selectedMenuIdx === null) return
      const menuItem = filteredMenu[selectedMenuIdx]
      if (!menuItem) return
      const asCatalogItem: ProductCatalogItem = {
        id: selectedMenuIdx,
        name: menuItem.name,
        ean: menuItem.external_id || null,
        product_type: currentProductType || '',
        item_type: 'FOOD',
        is_dummy: false,
      }
      onSelect(asCatalogItem)
      onClose()
    } else {
      const product = products.find(p => p.id === selectedId)
      if (product) {
        onSelect(product)
        onClose()
      }
    }
  }

  const hasSelection = useActiveMenu ? selectedMenuIdx !== null : selectedId !== null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Сменить класс
            {currentName && (
              <span className="block text-sm font-normal text-gray-500 mt-1">
                Текущий: {currentName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Поиск по названию..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>

          {!useActiveMenu && (
            <div>
              <Label className="text-xs text-gray-500">Категория</Label>
              <Select value={productType || 'all'} onValueChange={(v) => setProductType(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Все категории" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все категории</SelectItem>
                  {allTypes.map(t => (
                    <SelectItem key={t} value={t}>
                      {PRODUCT_TYPE_LABELS[t] || t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {useActiveMenu && (
            <div className="text-xs text-gray-500 bg-blue-50 px-2 py-1.5 rounded">
              Меню дня — {activeMenu!.length} позиций
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto border rounded-md mt-2">
          {useActiveMenu ? (
            filteredMenu.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">Ничего не найдено</div>
            ) : (
              filteredMenu.map((menuItem, idx) => (
                <button
                  key={`${menuItem.external_id}-${idx}`}
                  type="button"
                  onClick={() => setSelectedMenuIdx(idx)}
                  className={`w-full text-left px-3 py-2 border-b last:border-b-0 transition-colors hover:bg-gray-50 ${
                    selectedMenuIdx === idx ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{menuItem.name}</div>
                      {menuItem.external_id && (
                        <div className="text-xs text-gray-400">ID: {menuItem.external_id}</div>
                      )}
                    </div>
                    {selectedMenuIdx === idx && (
                      <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))
            )
          ) : loading ? (
            <div className="p-4 text-center text-sm text-gray-500">Загрузка...</div>
          ) : products.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">Ничего не найдено</div>
          ) : (
            products.map(product => (
              <button
                key={product.id}
                type="button"
                onClick={() => setSelectedId(product.id)}
                className={`w-full text-left px-3 py-2 border-b last:border-b-0 transition-colors hover:bg-gray-50 ${
                  selectedId === product.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                } ${product.is_dummy ? 'bg-yellow-50/50' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate flex items-center gap-1.5">
                      {product.name}
                      {product.is_dummy && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-200 text-yellow-800 font-semibold flex-shrink-0">
                          DUMMY
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 flex gap-2">
                      <span>{PRODUCT_TYPE_LABELS[product.product_type] || product.product_type}</span>
                      {product.ean && <span>EAN: {product.ean}</span>}
                    </div>
                  </div>
                  {selectedId === product.id && (
                    <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={handleSelect} disabled={!hasSelection}>
            Применить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
