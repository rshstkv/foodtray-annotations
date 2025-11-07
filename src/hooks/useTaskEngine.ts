/**
 * Main Task Engine Hook
 * Управляет жизненным циклом задачи: fetch, complete, skip, error handling
 * Используется во всех task pages для унификации логики
 */

import { useReducer, useEffect, useCallback, useRef } from 'react'
import { annotationClient } from '@/lib/api/AnnotationClient'
import { useTaskNavigation } from './useTaskNavigation'
import type {
  TaskData,
  TaskEngineState,
  TaskEngineAction,
  TaskResult,
} from '@/types/annotations'

// Reducer для управления состоянием
function taskEngineReducer(
  state: TaskEngineState,
  action: TaskEngineAction
): TaskEngineState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS':
      return {
        ...state,
        loading: false,
        taskData: action.payload,
        error: null,
      }
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.payload }
    case 'COMPLETE_START':
      return { ...state, completing: true }
    case 'COMPLETE_SUCCESS':
      return { ...state, completing: false, taskData: null }
    case 'COMPLETE_ERROR':
      return { ...state, completing: false, error: action.payload }
    case 'RESET':
      return {
        taskData: null,
        loading: false,
        error: null,
        completing: false,
      }
    default:
      return state
  }
}

const initialState: TaskEngineState = {
  taskData: null,
  loading: false,
  error: null,
  completing: false,
}

interface UseTaskEngineOptions {
  taskType: string
  tier?: number
  queue?: 'pending' | 'requires_correction'
  minTier?: number // Минимальный tier (для фильтрации, например Edit Mode)
  maxTier?: number // Максимальный tier (для фильтрации, например Quick Mode)
  onTaskComplete?: () => void
  onTaskSkip?: () => void
  autoFetch?: boolean
}

export function useTaskEngine({
  taskType,
  tier,
  queue,
  minTier,
  maxTier,
  onTaskComplete,
  onTaskSkip,
  autoFetch = true,
}: UseTaskEngineOptions) {
  const [state, dispatch] = useReducer(taskEngineReducer, initialState)
  const {
    processing,
    error: navError,
    skipTask: skipTaskAPI,
    completeTask: completeTaskAPI,
    flagTask: flagTaskAPI,
  } = useTaskNavigation()

  // Track if component is mounted
  const isMountedRef = useRef(true)
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  /**
   * Fetch next task
   */
  const fetchNextTask = useCallback(async () => {
    try {
      console.log('[useTaskEngine] Fetching task:', { taskType, tier, queue, minTier, maxTier })
      dispatch({ type: 'FETCH_START' })

      const response = await annotationClient.getNextTask(taskType, tier, queue, minTier, maxTier)
      console.log('[useTaskEngine] Response:', response.error ? `Error: ${response.error}` : `Success: ${response.data?.recognition?.recognition_id}`)

      if (!isMountedRef.current) return

      if (response.error) {
        // 404 means no tasks available - not an error
        if (response.error.includes('404') || response.error.includes('No tasks')) {
          dispatch({ type: 'FETCH_SUCCESS', payload: null as any })
        } else {
          dispatch({ type: 'FETCH_ERROR', payload: response.error })
        }
        return
      }

      if (!response.data) {
        dispatch({ type: 'FETCH_SUCCESS', payload: null as any })
        return
      }

      dispatch({ type: 'FETCH_SUCCESS', payload: response.data })
    } catch (err) {
      if (!isMountedRef.current) return
      const message = err instanceof Error ? err.message : 'Unknown error'
      dispatch({ type: 'FETCH_ERROR', payload: message })
    }
  }, [taskType, tier, queue, minTier, maxTier])

  /**
   * Complete current task and fetch next
   */
  const completeTask = useCallback(
    async (result?: TaskResult) => {
      if (!state.taskData) return

      dispatch({ type: 'COMPLETE_START' })

      const success = await completeTaskAPI(
        state.taskData.recognition.recognition_id,
        state.taskData.stage.id,
        result
      )

      if (!isMountedRef.current) return

      if (!success) {
        dispatch({
          type: 'COMPLETE_ERROR',
          payload: navError || 'Failed to complete task',
        })
        return
      }

      dispatch({ type: 'COMPLETE_SUCCESS' })
      onTaskComplete?.()

      // Fetch next task
      await fetchNextTask()
    },
    [state.taskData, completeTaskAPI, navError, onTaskComplete, fetchNextTask]
  )

  /**
   * Skip current task and fetch next
   */
  const skipTask = useCallback(async () => {
    if (!state.taskData) return

    const success = await skipTaskAPI(state.taskData.recognition.recognition_id)

    if (!isMountedRef.current) return

    if (!success) {
      dispatch({
        type: 'FETCH_ERROR',
        payload: navError || 'Failed to skip task',
      })
      return
    }

    onTaskSkip?.()

    // Fetch next task
    await fetchNextTask()
  }, [state.taskData, skipTaskAPI, navError, onTaskSkip, fetchNextTask])

  /**
   * Flag current task and fetch next
   */
  const flagTask = useCallback(
    async (
      flagType: 'dish_error' | 'check_error' | 'manual_review',
      reason?: string
    ) => {
      if (!state.taskData) return

      const success = await flagTaskAPI(
        state.taskData.recognition.recognition_id,
        flagType,
        reason
      )

      if (!isMountedRef.current) return

      if (!success) {
        dispatch({
          type: 'FETCH_ERROR',
          payload: navError || 'Failed to flag task',
        })
        return
      }

      // Fetch next task
      await fetchNextTask()
    },
    [state.taskData, flagTaskAPI, navError, fetchNextTask]
  )

  /**
   * Retry fetching task (in case of error)
   */
  const retry = useCallback(() => {
    dispatch({ type: 'RESET' })
    fetchNextTask()
  }, [fetchNextTask])

  // Auto-fetch on mount or when params change
  useEffect(() => {
    if (autoFetch) {
      console.log('[useTaskEngine] Auto-fetching due to params change')
      fetchNextTask()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch, taskType, tier, queue, minTier]) // Зависим от параметров, не от функции

  return {
    taskData: state.taskData,
    loading: state.loading,
    completing: state.completing || processing,
    error: state.error || navError,
    fetchNextTask,
    completeTask,
    skipTask,
    flagTask,
    retry,
  }
}

