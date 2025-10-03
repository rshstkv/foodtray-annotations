 'use client'
export const dynamic = 'force-dynamic'

import { Suspense, useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import RecognitionImageWithBBox from '@/components/RecognitionImageWithBBox'
import { Button } from '@/components/ui/button'
import { AdditionalStatesDropdown } from '@/components/AdditionalStatesDropdown'
import { Card } from '@/components/ui/card'
import { useFilters } from '@/hooks/useFilters'
import { useInfiniteClarifications, ClarificationData } from '@/hooks/useInfiniteClarifications'
import { FilterHeader } from '@/components/FilterHeader'
import { InfiniteScroll } from '@/components/InfiniteScroll'
import { LoadingIndicator, EmptyState } from '@/components/LoadingIndicator'

type RowStates = Record<string, 'yes' | 'no'>

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}> 
      <HomeContent />
    </Suspense>
  )
}

function HomeContent() {
  const [rowStates, setRowStates] = useState<RowStates>({})
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

  // Загрузка сохраненных состояний при инициализации
  useEffect(() => {
    const loadSavedStates = async () => {
      try {
        const response = await fetch('/api/states')
        if (response.ok) {
          const states = await response.json()
          setRowStates(states)
        }
      } catch (err) {
        console.warn('Failed to load saved states:', err)
      }
    }

    loadSavedStates()
  }, [])

  // Сохранение состояния
  const saveState = async (clarificationId: string, state: 'yes' | 'no' | 'bbox_error' | 'unknown' | 'clear') => {
    try {
      // Найдем db_id для данной кларификации
      const clarificationItem = clarificationsData.find(item => item.clarification_id === clarificationId)
      const db_id = clarificationItem?.db_id

      if (state === 'clear') {
        // Удаляем состояние
        const response = await fetch('/api/states', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clarification_id: clarificationId })
        })

        if (response.ok) {
          setRowStates(prev => {
            const updated = { ...prev }
            delete updated[clarificationId]
            return updated
          })
        }
      } else {
        // Сохраняем состояние
        const response = await fetch('/api/states', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            clarification_id: clarificationId, 
            state,
            db_id // Передаем внутренний ID
          })
        })

        if (response.ok) {
          setRowStates(prev => ({ 
            ...prev, 
            [clarificationId]: state 
          }))
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
              {clarificationsData.map((clarification) => (
                <ClarificationCard
                  key={clarification.db_id ?? `${clarification.clarification_id}-${clarification.start_dtts}`}
                  clarification={clarification}
                  state={rowStates[clarification.clarification_id]}
                  onStateChange={(state) => saveState(clarification.clarification_id, state)}
                />
              ))}
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
}

function ClarificationCard({ clarification, state, onStateChange }: ClarificationCardProps) {
  const matchedProduct = clarification.ean_matched?.[0] as { external_id?: string } | undefined

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
              return (
                <Card 
                  key={product.external_id}
                  className={`!px-2 !py-1 !gap-0 text-[10px] md:text-xs rounded-md ${
                    isSelected
                      ? 'bg-black border-black text-white'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className={`font-semibold text-[11px] md:text-sm leading-tight line-clamp-2 ${isSelected ? 'text-white' : 'text-gray-800'}`}>
                    {product.description}
                  </div>
                  <div className={`font-semibold text-[11px] md:text-sm ${isSelected ? 'text-white' : 'text-green-600'}`}>
                    €{product.price}
                  </div>
                  <div
                    className={`${isSelected ? 'text-white' : 'text-gray-500'} font-mono text-[10px] md:text-[11px] overflow-hidden text-ellipsis whitespace-nowrap`}
                    title={`EAN: ${product.external_id}`}
                  >
                    EAN: {product.external_id}
                  </div>
                </Card>
              )
            })}
          </div>
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
                  {/* Dropdown с дополнительными состояниями */}
                  <AdditionalStatesDropdown 
                    onStateChange={(newState) => onStateChange(newState)}
                  />
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
          onClick={() => setIsModalOpen(false)}
        >
          <div className="relative w-[90vw] h-[80vh]">
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