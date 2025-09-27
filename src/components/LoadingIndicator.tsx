'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

interface LoadingIndicatorProps {
  type?: 'skeleton' | 'spinner'
  count?: number
}

export function LoadingIndicator({ type = 'skeleton', count = 3 }: LoadingIndicatorProps) {
  if (type === 'spinner') {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Загрузка...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {[...Array(count)].map((_, index) => (
        <Card key={index} className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Основная информация - слева */}
            <div className="flex-[2] space-y-3">
              {/* Заголовок */}
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-5 w-24" />
              </div>
              
              {/* Детали */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-36" />
              </div>
              
              {/* Продукты */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="p-2">
                    <Skeleton className="h-4 w-full mb-1" />
                    <Skeleton className="h-3 w-16 mb-1" />
                    <Skeleton className="h-3 w-24" />
                  </Card>
                ))}
              </div>
            </div>
            
            {/* Изображения - справа */}
            <div className="flex-[3] space-y-3">
              <Skeleton className="w-full aspect-[1810/1080] rounded-lg" />
              <div className="self-end w-[105px]">
                <Skeleton className="w-full aspect-[1810/1080] rounded-lg" />
              </div>
            </div>
          </div>
          
          {/* Кнопки */}
          <div className="mt-4 flex justify-end gap-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </Card>
      ))}
    </div>
  )
}

export function EmptyState({ message = 'Данные не найдены' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 014 12H2.05A7.963 7.963 0 014.636 4.636L6.05 6.05A5.98 5.98 0 0012 4a5.98 5.98 0 005.95 2.05l1.414-1.414A7.963 7.963 0 0121.95 12H20a7.962 7.962 0 01-2.636 5.364L16 16"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {message}
      </h3>
      <p className="text-gray-600 max-w-sm">
        Попробуйте изменить параметры фильтрации или сбросить все фильтры
      </p>
    </div>
  )
}
