/**
 * Hook для навигации между задачами
 * Skip, Complete, Flag operations
 */

import { useCallback, useState } from 'react'
import { annotationClient } from '@/lib/api/AnnotationClient'
import type { TaskResult } from '@/types/annotations'

export function useTaskNavigation() {
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Пропустить текущую задачу
   */
  const skipTask = useCallback(
    async (recognitionId: string): Promise<boolean> => {
      try {
        setProcessing(true)
        setError(null)

        const response = await annotationClient.skipTask(recognitionId)

        if (response.error) {
          setError(response.error)
          return false
        }

        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
        return false
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  /**
   * Завершить текущую задачу
   */
  const completeTask = useCallback(
    async (
      recognitionId: string,
      stageId: number,
      result?: TaskResult
    ): Promise<boolean> => {
      try {
        setProcessing(true)
        setError(null)

        const response = await annotationClient.completeTask(
          recognitionId,
          stageId,
          result
        )

        if (response.error) {
          setError(response.error)
          return false
        }

        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
        return false
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  /**
   * Отметить задачу флагом
   */
  const flagTask = useCallback(
    async (
      recognitionId: string,
      flagType: 'dish_error' | 'check_error' | 'manual_review',
      reason?: string
    ): Promise<boolean> => {
      try {
        setProcessing(true)
        setError(null)

        const response = await annotationClient.flagTask(
          recognitionId,
          flagType,
          reason
        )

        if (response.error) {
          setError(response.error)
          return false
        }

        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
        return false
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  /**
   * Освободить задачу
   */
  const releaseTask = useCallback(
    async (recognitionId: string): Promise<boolean> => {
      try {
        setProcessing(true)
        setError(null)

        const response = await annotationClient.releaseTask(recognitionId)

        if (response.error) {
          setError(response.error)
          return false
        }

        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
        return false
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  return {
    processing,
    error,
    skipTask,
    completeTask,
    flagTask,
    releaseTask,
  }
}

