'use client'

import { useEffect, useRef, useCallback } from 'react'

interface InfiniteScrollProps {
  hasMore: boolean
  isLoading: boolean
  onLoadMore: () => void
  children: React.ReactNode
  threshold?: number
  rootMargin?: string
}

export function InfiniteScroll({
  hasMore,
  isLoading,
  onLoadMore,
  children,
  threshold = 0.1,
  rootMargin = '100px'
}: InfiniteScrollProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && hasMore && !isLoading) {
        onLoadMore()
      }
    },
    [hasMore, isLoading, onLoadMore]
  )

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    // Очищаем предыдущий observer
    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    // Создаем новый observer
    observerRef.current = new IntersectionObserver(handleIntersection, {
      threshold,
      rootMargin
    })

    observerRef.current.observe(sentinel)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [handleIntersection, threshold, rootMargin])

  return (
    <div>
      {children}
      
      {/* Sentinel элемент для отслеживания скролла */}
      <div
        ref={sentinelRef}
        className="h-1 w-full"
        aria-hidden="true"
      />
    </div>
  )
}
