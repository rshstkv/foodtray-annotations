/**
 * useTaskEngine - простой хук для загрузки задач
 */

import { useState, useEffect } from 'react'
import { annotationClient } from '@/lib/api/AnnotationClient'
import type { TaskData } from '@/types/annotations'

interface UseTaskEngineOptions {
  taskType: string
  taskQueue?: 'dish_validation' | 'check_error' | 'buzzer' | 'other_items'
  mode?: 'quick' | 'edit'
  autoFetch?: boolean
}

export function useTaskEngine({
  taskType,
  taskQueue = 'dish_validation',
  mode,
  autoFetch = true,
}: UseTaskEngineOptions) {
  const [taskData, setTaskData] = useState<TaskData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch task
  const fetchNextTask = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await annotationClient.getNextTask(taskType, taskQueue, mode)
      
      if (response.error) {
        if (response.error.includes('404') || response.error.includes('No tasks')) {
          setTaskData(null)
        } else {
          setError(response.error)
        }
      } else {
        setTaskData(response.data || null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // Complete task
  const completeTask = async () => {
    if (!taskData) return
    
    try {
      const response = await fetch(
        `/api/annotations/tasks/${taskData.recognition.recognition_id}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes: {} }),
        }
      )
      
      if (response.ok) {
        await fetchNextTask()
      }
    } catch (err) {
      console.error('Error completing task:', err)
    }
  }

  // Skip task
  const skipTask = async () => {
    if (!taskData) return
    
    try {
      const response = await fetch(
        `/api/annotations/tasks/${taskData.recognition.recognition_id}/skip`,
        { method: 'POST' }
      )
      
      if (response.ok) {
        await fetchNextTask()
      }
    } catch (err) {
      console.error('Error skipping task:', err)
    }
  }

  // Flag task
  const flagTask = async (
    flagType: 'dish_error' | 'check_error' | 'manual_review' | 'bbox_error' | 'buzzer_present',
    reason?: string
  ) => {
    if (!taskData) return
    
    try {
      const response = await fetch(
        `/api/annotations/tasks/${taskData.recognition.recognition_id}/flag`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flag_type: flagType, reason }),
        }
      )
      
      if (response.ok) {
        await fetchNextTask()
      }
    } catch (err) {
      console.error('Error flagging task:', err)
    }
  }

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchNextTask()
    }
  }, []) // Только при монтировании

  return {
    taskData,
    loading,
    error,
    fetchNextTask,
    completeTask,
    skipTask,
    flagTask,
    completing: false,
    retry: fetchNextTask,
  }
}
