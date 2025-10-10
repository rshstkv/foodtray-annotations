 'use client'
export const dynamic = 'force-dynamic'

import { Suspense, useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { AlertTriangle, HelpCircle, Check } from 'lucide-react'
import RecognitionImageWithBBox from '@/components/RecognitionImageWithBBox'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useFilters } from '@/hooks/useFilters'
import { useInfiniteClarifications, ClarificationData, MenuItem } from '@/hooks/useInfiniteClarifications'
import { FilterHeader } from '@/components/FilterHeader'
import { InfiniteScroll } from '@/components/InfiniteScroll'
import { LoadingIndicator, EmptyState } from '@/components/LoadingIndicator'
import { MenuSearchDialog } from '@/components/MenuSearchDialog'

// Локальные изменения состояний для оптимистичного UI (undefined = очищено)
type LocalStateChanges = Record<string, 'yes' | 'no' | 'bbox_error' | 'unknown' | undefined>

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}> 
      <HomeContent />
    </Suspense>
  )
}

function HomeContent() {
  const [localStateChanges, setLocalStateChanges] = useState<LocalStateChanges>({})
  const { filters, updateFilter, resetFilters, hasActiveFilters, isInitialized } = useFilters()
  
  const {
    data: clarificationsData,
    count,
    isLoading,
    isFetching,
    error,
    hasMore,
    fetchNextPage,
    stats
  } = useInfiniteClarifications(filters, isInitialized)

  // Сохранение состояния
  const saveState = async (
    clarificationId: string,
    state: 'yes' | 'no' | 'bbox_error' | 'unknown' | 'clear',
    dbId?: number
  ) => {
    try {
      const effectiveDbId = dbId ?? clarificationsData.find(item => item.clarification_id === clarificationId)?.db_id

      if (effectiveDbId === undefined) {
        console.error('saveState: missing db_id for clarification', {
          clarificationId,
          state,
        })
        return
      }

      if (state === 'clear') {
        // Оптимистично очищаем локально (мгновенный фидбэк)
        setLocalStateChanges(prev => ({ 
          ...prev, 
          [String(effectiveDbId)]: undefined 
        }))

        // Удаляем состояние в фоне
        const response = await fetch('/api/states', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ db_id: effectiveDbId })
        })

        if (!response.ok) {
          try {
            const err = await response.json()
            console.error('DELETE /api/states failed', err)
          } catch {}
        }
      } else {
        // Оптимистично обновляем локально (мгновенный фидбэк)
        setLocalStateChanges(prev => ({ 
          ...prev, 
          [String(effectiveDbId)]: state 
        }))

        // Сохраняем состояние в фоне
        const response = await fetch('/api/states', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            clarification_id: clarificationId, 
            state,
            db_id: effectiveDbId
          })
        })

        if (!response.ok) {
          try {
            const err = await response.json()
            console.error('POST /api/states failed', err)
          } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to save state:', err)
    }
  }

  // Экспорт удалён. Логика была в exportResults

  // Показываем начальный лоадер только при первой загрузке
  if (isLoading && clarificationsData.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <FilterHeader
          filters={filters}
          onUpdateFilter={updateFilter}
          onResetFilters={resetFilters}
          hasActiveFilters={hasActiveFilters}
          totalCount={0}
        />
        <div className="pt-20 px-5">
          <div className="max-w-7xl mx-auto">
            <LoadingIndicator type="spinner" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <FilterHeader
          filters={filters}
          onUpdateFilter={updateFilter}
          onResetFilters={resetFilters}
          hasActiveFilters={hasActiveFilters}
          totalCount={0}
        />
        <div className="pt-20 px-5 flex items-center justify-center">
          <div className="text-red-600 text-xl">Ошибка: {error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Фиксированный хедер с фильтрами */}
      {isInitialized && (
        <FilterHeader
          filters={filters}
          onUpdateFilter={updateFilter}
          onResetFilters={resetFilters}
          hasActiveFilters={hasActiveFilters}
          totalCount={count}
        />
      )}

      <div className="pt-20 px-5">
        <div className="max-w-7xl mx-auto">
          {/* Бесконечный скролл с данными */}
          <InfiniteScroll
            hasMore={hasMore}
            isLoading={isFetching}
            onLoadMore={fetchNextPage}
          >
            <div className="space-y-3">
              {clarificationsData.map((clarification) => {
                const dbIdKey = String(clarification.db_id ?? '')
                // Приоритет локальному изменению (оптимистичный UI), иначе из API
                const effectiveState = dbIdKey in localStateChanges 
                  ? localStateChanges[dbIdKey] 
                  : clarification.state
                
                return (
                  <ClarificationCard
                    key={clarification.db_id ?? `${clarification.clarification_id}-${clarification.start_dtts}`}
                    clarification={clarification}
                    state={effectiveState}
                    onStateChange={(state) => saveState(clarification.clarification_id, state, clarification.db_id)}
                    onCorrectDishSelect={async (ean, name, source) => {
                      try {
                        await fetch('/api/correct-dishes', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            clarification_id: clarification.clarification_id,
                            selected_ean: ean,
                            selected_product_name: name,
                            source
                          })
                        })
                        // Refetch данных чтобы получить обновлённую информацию
                        fetchNextPage()
                      } catch (err) {
                        console.error('Failed to save correct dish:', err)
                      }
                    }}
                  />
                )
              })}
            </div>

            {/* Индикатор загрузки */}
            {isFetching && clarificationsData.length > 0 && (
              <div className="mt-6">
                <LoadingIndicator count={2} />
              </div>
            )}

            {/* Сообщение об окончании списка */}
            {!hasMore && clarificationsData.length > 0 && (
              <div className="text-center py-6">
                <div className="bg-white rounded-lg p-4 text-gray-600 shadow-sm">
                  Все записи загружены ({clarificationsData.length} из {count})
                  {stats && (
                    <span className="ml-2">• проверено {stats.checked} из {stats.total}</span>
                  )}
                </div>
              </div>
            )}
          </InfiniteScroll>

          {/* Пустое состояние */}
          {clarificationsData.length === 0 && !isLoading && (
            <div className="bg-white rounded-lg p-8 shadow-sm">
              <EmptyState message="Кларификации не найдены" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ClarificationCardProps {
  clarification: ClarificationData
  state?: 'yes' | 'no' | 'bbox_error' | 'unknown'
  onStateChange: (state: 'yes' | 'no' | 'bbox_error' | 'unknown' | 'clear') => void
  onCorrectDishSelect: (ean: string, name: string, source: 'available' | 'menu') => void
}

function ClarificationCard({ clarification, state, onStateChange, onCorrectDishSelect }: ClarificationCardProps) {
  const matchedProduct = clarification.ean_matched?.[0] as { external_id?: string } | undefined
  const [isMenuDialogOpen, setIsMenuDialogOpen] = useState(false)
  const [selectedCorrectDish, setSelectedCorrectDish] = useState<{
    ean: string
    name: string
    source: 'available' | 'menu'
  } | null>(
    clarification.correct_dish_ean && clarification.correct_dish_name
      ? {
          ean: clarification.correct_dish_ean,
          name: clarification.correct_dish_name,
          source: clarification.correct_dish_source || 'available'
        }
      : null
  )

  const handleCorrectDishSelect = async (ean: string, name: string, source: 'available' | 'menu') => {
    setSelectedCorrectDish({ ean, name, source })
    await onCorrectDishSelect(ean, name, source)
  }

  const handleMenuItemSelect = (item: MenuItem) => {
    if (item.ean && item.product_name) {
      handleCorrectDishSelect(item.ean, item.product_name, 'menu')
    }
  }

  const cardClassName = state 
    ? state === 'yes' 
      ? 'bg-green-100 border-l-4 border-l-green-500' 
      : state === 'no'
      ? 'bg-red-100 border-l-4 border-l-red-500'
      : state === 'bbox_error'
      ? 'bg-orange-100 border-l-4 border-l-orange-500'
      : state === 'unknown'
      ? 'bg-gray-100 border-l-4 border-l-gray-500'
      : 'bg-white'
    : 'bg-white'


  return (
    <>
    <Card className={`${cardClassName} p-4 shadow-lg hover:shadow-xl transition-shadow`}>
      <div className="flex flex-col md:flex-row gap-4 items-stretch">
        {/* Основная информация */}
        <div className="flex-[2] min-w-0">
          {/* POS_TXN сверху и название в одну строку */}
          <div className="mb-2">
            <div className="text-[11px] md:text-xs font-mono bg-gray-100 rounded px-2 py-1 text-gray-700 break-all">
              POS_TXN: {clarification.pos_transaction_id}
            </div>
          </div>
          <div className="mb-3">
            <h3 className="text-base md:text-lg font-semibold text-gray-800 truncate whitespace-nowrap">
              {clarification.product_name}
            </h3>
          </div>

          {/* Детали (компактный столбец) */}
          <div className="flex flex-col gap-1 mb-3 text-xs md:text-sm text-gray-600">
            <div><span className="font-medium">Локация:</span> {clarification.device_canteen_name}</div>
            <div><span className="font-medium">Дата:</span> {clarification.start_dtts?.split(' ')[0] ?? ''}</div>
            <div><span className="font-medium">Тип:</span> {clarification.clarification_type}</div>
          </div>

          {/* Доступные продукты (компактные карточки) */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
            {clarification.d.details.map((product: { price: number; description: string; external_id: string }) => {
              const isSelected = product.external_id === matchedProduct?.external_id
              const isCorrectDish = selectedCorrectDish?.ean === product.external_id
              return (
                <Card 
                  key={product.external_id}
                  className={`!px-2 !py-1 !gap-0 text-[10px] md:text-xs rounded-md relative ${
                    isCorrectDish
                      ? 'bg-green-600 border-green-600 text-white ring-2 ring-green-400'
                      : isSelected
                      ? 'bg-black border-black text-white'
                      : 'bg-gray-50 border-gray-200'
                  } ${state === 'no' && !isSelected ? 'cursor-pointer hover:ring-2 hover:ring-blue-300' : ''}`}
                  onClick={() => {
                    if (state === 'no' && !isSelected) {
                      handleCorrectDishSelect(product.external_id, product.description, 'available')
                    }
                  }}
                >
                  {isCorrectDish && (
                    <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <div className={`font-semibold text-[11px] md:text-sm leading-tight line-clamp-2 ${(isSelected || isCorrectDish) ? 'text-white' : 'text-gray-800'}`}>
                    {product.description}
                  </div>
                  <div className={`font-semibold text-[11px] md:text-sm ${(isSelected || isCorrectDish) ? 'text-white' : 'text-green-600'}`}>
                    €{product.price}
                  </div>
                  <div
                    className={`${(isSelected || isCorrectDish) ? 'text-white' : 'text-gray-500'} font-mono text-[10px] md:text-[11px] overflow-hidden text-ellipsis whitespace-nowrap`}
                    title={`EAN: ${product.external_id}`}
                  >
                    EAN: {product.external_id}
                  </div>
                </Card>
              )
            })}
          </div>

          {/* Секция выбора правильного блюда (показывается только при state='no') */}
          {state === 'no' && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex flex-col gap-3">
                <h4 className="text-sm font-semibold text-gray-700">
                  Выберите правильное блюдо:
                </h4>
                
                {selectedCorrectDish ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Check className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-semibold text-green-800">
                            Выбранное правильное блюдо:
                          </span>
                        </div>
                        <p className="text-sm text-gray-800 font-medium">{selectedCorrectDish.name}</p>
                        <p className="text-xs text-gray-600 mt-1">EAN: {selectedCorrectDish.ean}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Источник: {selectedCorrectDish.source === 'available' ? 'Доступные варианты' : 'Меню'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedCorrectDish(null)}
                        className="shrink-0"
                      >
                        Изменить
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-gray-600">
                      Кликните на один из вариантов выше или найдите другое блюдо в меню:
                    </p>
                    <Button
                      onClick={() => setIsMenuDialogOpen(true)}
                      variant="outline"
                      className="w-full md:w-auto border-blue-300 text-blue-700 hover:bg-blue-50"
                    >
                      🔍 Найти в меню
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Изображения */}
        <div className="flex flex-col gap-3 flex-[3] min-w-0">
          {clarification.sign === 'main' ? (
            <>
              <div className="order-1 w-full min-w-0">
                <ImageContainer
                  src={clarification.image_url_main}
                  alt="Main image (Recognition)"
                  label="MAIN"
                  type="recognition"
                  rectangle={clarification.rectangle}
                />
              </div>
              <div className="order-2 self-end w-[60px] md:w-[105px]">
                <ImageContainer
                  src={clarification.image_url_qualifying}
                  alt="Qualifying image"
                  label="QUALIFYING"
                  type="alternative"
                  rectangle={clarification.rectangle}
                  isSmall={true}
                />
              </div>
            </>
          ) : (
            <>
              <div className="order-1 w-full min-w-0">
                <ImageContainer
                  src={clarification.image_url_qualifying}
                  alt="Qualifying image (Recognition)"
                  label="QUALIFYING"
                  type="recognition"
                  rectangle={clarification.rectangle}
                />
              </div>
              <div className="order-2 self-end w-[60px] md:w-[105px]">
                <ImageContainer
                  src={clarification.image_url_main}
                  alt="Main image"
                  label="MAIN"
                  type="alternative"
                  rectangle={clarification.rectangle}
                  isSmall={true}
                />
              </div>
            </>
          )}
        </div>
      </div>
          {/* Кнопки действий внутри карточки: мобильные полноширинные, на десктопе справа, не перекрывают контент */}
          <div className="mt-4 flex">
            <div className="flex gap-3 md:ml-auto w-full md:w-auto items-center">
              {!state ? (
                <>
                  <Button 
                    onClick={() => onStateChange('yes')}
                    className="bg-green-600 hover:bg-green-700 text-white flex-1 h-12 text-base font-semibold md:flex-none md:h-auto md:w-[140px]"
                  >
                    YES
                  </Button>
                  <Button 
                    onClick={() => onStateChange('no')}
                    className="bg-red-600 hover:bg-red-700 text-white flex-1 h-12 text-base font-semibold md:flex-none md:h-auto md:w-[140px]"
                  >
                    NO
                  </Button>
                  {/* Кнопки дополнительных состояний с иконками */}
                  <Button 
                    onClick={() => onStateChange('bbox_error')}
                    className="bg-orange-500 hover:bg-orange-600 text-white h-12 w-12 p-0 md:h-10 md:w-10"
                    title="Ошибка границ"
                  >
                    <AlertTriangle className="h-6 w-6 md:h-5 md:w-5" />
                  </Button>
                  <Button 
                    onClick={() => onStateChange('unknown')}
                    className="bg-gray-500 hover:bg-gray-600 text-white h-12 w-12 p-0 md:h-10 md:w-10"
                    title="Неизвестно"
                  >
                    <HelpCircle className="h-6 w-6 md:h-5 md:w-5" />
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    onClick={() => onStateChange('clear')}
                    variant="outline"
                    className="text-sm px-6 py-3 md:w-[140px]"
                  >
                    Clear
                  </Button>
                  {/* Показываем текущее состояние для дополнительных состояний */}
                  {(state === 'bbox_error' || state === 'unknown') && (
                    <div className="text-sm text-gray-600 ml-2">
                      {state === 'bbox_error' ? '⚠️ Ошибка границ' : '❓ Неизвестно'}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
    </Card>

    {/* Menu search dialog */}
    <MenuSearchDialog
      isOpen={isMenuDialogOpen}
      onClose={() => setIsMenuDialogOpen(false)}
      onSelect={handleMenuItemSelect}
    />
    </>
  )
}

interface ImageContainerProps {
  src?: string
  alt: string
  label: string
  type: 'recognition' | 'alternative'
  rectangle?: string
}

function ImageContainer({ src, alt, label, type, rectangle, isSmall }: ImageContainerProps & { isSmall?: boolean }) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const containerClass = type === 'recognition'
    ? 'border-3 border-red-500 bg-white shadow-lg'
    : 'border-2 border-gray-300 bg-white shadow-md'
  
  const referenceSize = useMemo(() => {
    if (type !== 'recognition') return null
    const normalizedLabel = label.toUpperCase()
    if (normalizedLabel === 'MAIN') {
      return { width: 1810, height: 1080 }
    }
    if (normalizedLabel === 'QUALIFYING') {
      return { width: 1410, height: 1080 }
    }
    return null
  }, [type, label])

  // Android back/edge-swipe: регистрируем хук всегда (до любых ранних return)
  useEffect(() => {
    if (!isModalOpen) return

    let pushed = false
    try {
      window.history.pushState({ __imageModal__: true } as const, '')
      pushed = true
    } catch {}

    const onPopState = () => setIsModalOpen(false)
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      try {
        const state = window.history.state as unknown as { __imageModal__?: boolean } | null
        if (pushed && state && state.__imageModal__) {
          window.history.back()
        }
      } catch {}
    }
  }, [isModalOpen])


  if (!src) {
    return (
      <div className={`${containerClass} w-full aspect-[1810/1080] rounded-lg flex items-center justify-center relative`}>
        <span className="text-gray-400">No image</span>
        <div className={`absolute top-1 left-1 bg-gray-600 text-white rounded font-bold ${isSmall ? 'px-1 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'}`}>
          {label}
        </div>
      </div>
    )
  }

  // (старый эффект перенесён выше, чтобы не нарушать порядок хуков)

  return (
    <>
      <div 
        className={`${containerClass} w-full aspect-[1810/1080] rounded-lg overflow-hidden cursor-pointer hover:shadow-xl transition-shadow relative`}
        onClick={() => setIsModalOpen(true)}
      >
        {type === 'recognition' ? (
          <RecognitionImageWithBBox
            src={src}
            alt={alt}
            rectangle={rectangle ?? ''}
            mirrored={true}
            className="w-full h-full"
            referenceWidth={referenceSize?.width}
            referenceHeight={referenceSize?.height}
            sizes={isSmall ? "(max-width: 768px) 120px, 120px" : "(max-width: 768px) 100vw, (max-width: 1280px) 70vw, 60vw"}
            priority={!isSmall}
          />
        ) : (
          <Image
            src={src}
            alt={alt}
            fill
            sizes={isSmall ? "(max-width: 768px) 120px, 120px" : "(max-width: 768px) 100vw, (max-width: 1280px) 70vw, 60vw"}
            className="object-contain"
          />
        )}
        
        <div className={`absolute top-1 left-1 bg-blue-600 text-white rounded font-bold ${isSmall ? 'px-1 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'}`}>
          {label}
        </div>
        {type === 'recognition' && (
          <div className={`absolute top-1 right-1 bg-red-600 text-white rounded font-bold ${isSmall ? 'px-1 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'}`}>
            RECOGNITION
          </div>
        )}
      </div>

      {/* Модальное окно */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 cursor-zoom-out"
          // Блокируем жесты браузера/системы в пределах оверлея, особенно на Android
          style={{ overscrollBehavior: 'none', touchAction: 'none' }}
          onClick={() => setIsModalOpen(false)}
        >
          <div className="relative w-[90vw] h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <button 
              className="absolute -top-10 right-0 text-white text-2xl font-bold bg-black bg-opacity-50 px-3 py-1 rounded"
              onClick={() => setIsModalOpen(false)}
            >
              ×
            </button>
            {type === 'recognition' ? (
              <RecognitionImageWithBBox
                src={src}
                alt={alt}
                rectangle={rectangle ?? ''}
                mirrored={true}
                className="w-full h-full"
                referenceWidth={referenceSize?.width}
                referenceHeight={referenceSize?.height}
              />
            ) : (
              <Image
                src={src}
                alt={alt}
                fill
                sizes="90vw"
                className="object-contain"
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}