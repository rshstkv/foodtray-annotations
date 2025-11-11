/**
 * Hook для CRUD операций с аннотациями
 * Управляет локальным состоянием images с синхронизацией с API
 */

import { useState, useCallback } from 'react'
import { annotationClient } from '@/lib/api/AnnotationClient'
import type {
  Annotation,
  Image,
  CreateAnnotationPayload,
  UpdateAnnotationPayload,
} from '@/types/annotations'

export function useAnnotations(initialImages: Image[] = []) {
  const [images, setImages] = useState<Image[]>(initialImages)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Создать новую аннотацию
   */
  const createAnnotation = useCallback(
    async (payload: CreateAnnotationPayload): Promise<Annotation | null> => {
      try {
        setLoading(true)
        setError(null)

        const response = await annotationClient.createAnnotation(payload)

        if (response.error || !response.data) {
          setError(response.error || 'Failed to create annotation')
          return null
        }

        const newAnnotation = response.data

        // Обновляем локальное состояние
        setImages((prev) =>
          prev.map((img) =>
            img.id === payload.image_id
              ? { ...img, annotations: [...img.annotations, newAnnotation] }
              : img
          )
        )

        return newAnnotation
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
        return null
      } finally {
        setLoading(false)
      }
    },
    []
  )

  /**
   * Обновить аннотацию
   */
  const updateAnnotation = useCallback(
    async (
      id: number,
      updates: UpdateAnnotationPayload
    ): Promise<Annotation | null> => {
      if (id === -1) return null // Pending annotation

      try {
        setLoading(true)
        setError(null)

        // Находим текущую аннотацию для отправки current_ координат
        const currentAnnotation = images
          .flatMap((img) => img.annotations)
          .find((a) => a.id === id)

        if (!currentAnnotation) {
          setError('Annotation not found')
          return null
        }

        const payload: UpdateAnnotationPayload = {
          ...updates,
          current_bbox_x1: currentAnnotation.bbox_x1,
          current_bbox_y1: currentAnnotation.bbox_y1,
          current_bbox_x2: currentAnnotation.bbox_x2,
          current_bbox_y2: currentAnnotation.bbox_y2,
        }

        console.log('[useAnnotations] Sending update to server:', { id, payload })

        const response = await annotationClient.updateAnnotation(id, payload)

        if (response.error || !response.data) {
          console.error('[useAnnotations] Server error:', response.error)
          setError(response.error || 'Failed to update annotation')
          return null
        }

        const updatedAnnotation = response.data
        console.log('[useAnnotations] Server response:', updatedAnnotation)

        // НЕ ОБНОВЛЯЕМ состояние из сервера, т.к. оптимистичное обновление уже применено
        // Сервер нужен только для сохранения в БД
        console.log('[useAnnotations] Skipping state update - relying on optimistic update')

        return updatedAnnotation
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[useAnnotations] Exception:', message)
        setError(message)
        return null
      } finally {
        setLoading(false)
      }
    },
    [images]
  )

  /**
   * Удалить аннотацию
   */
  const deleteAnnotation = useCallback(async (id: number): Promise<boolean> => {
    if (id === -1) return false // Pending annotation

    try {
      setLoading(true)
      setError(null)

      const response = await annotationClient.deleteAnnotation(id)

      if (response.error) {
        setError(response.error)
        return false
      }

      // Обновляем локальное состояние
      setImages((prev) =>
        prev.map((img) => ({
          ...img,
          annotations: img.annotations.filter((ann) => ann.id !== id),
        }))
      )

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Обновить локальное состояние images (без API call)
   * Полезно для оптимистичных обновлений
   */
  const setLocalImages = useCallback((newImages: Image[]) => {
    setImages(newImages)
  }, [])

  /**
   * Обновить одну аннотацию локально (без API call)
   */
  const updateAnnotationLocally = useCallback(
    (id: number, updates: Partial<Annotation>) => {
      console.log('[useAnnotations] updateAnnotationLocally called:', id, updates)
      setImages((prev) => {
        console.log('[useAnnotations] Current images before update:', prev.flatMap(img => img.annotations).find(a => a.id === id))
        const newImages = prev.map((img) => ({
          ...img,
          annotations: img.annotations.map((ann) =>
            ann.id === id ? { ...ann, ...updates } : ann
          ),
        }))
        console.log('[useAnnotations] New images after update:', newImages.flatMap(img => img.annotations).find(a => a.id === id))
        return newImages
      })
    },
    []
  )

  /**
   * Установить images напрямую (для инициализации)
   */
  const setImages = useCallback((newImages: Image[]) => {
    setImages(newImages)
  }, [])

  return {
    images,
    loading,
    error,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    setLocalImages,
    updateAnnotationLocally,
    setImages,
  }
}

