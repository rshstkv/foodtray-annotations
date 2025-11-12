'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TaskData, StepContext } from '@/types/annotations'
import { validateStep } from '@/lib/validation'

export interface UseTaskManagerReturn {
  task: TaskData | null
  loading: boolean
  currentStepIndex: number
  currentStep: StepContext
  allSteps: StepContext[]
  canGoNext: boolean
  canGoPrev: boolean
  isSaving: boolean
  
  // Actions
  loadTask: () => Promise<void>
  goToStep: (stepIndex: number) => void
  completeStep: () => Promise<void>
  skipStep: () => Promise<void>
  skipTask: (reason?: string) => Promise<void>
  saveProgress: () => Promise<void>
}

export function useTaskManager(taskId: string): UseTaskManagerReturn {
  const router = useRouter()
  const [task, setTask] = useState<TaskData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isSaving, setIsSaving] = useState(false)

  const loadTask = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/tasks/${taskId}`)
      if (!res.ok) throw new Error('Failed to load task')
      const data = await res.json()
      
      // Привязываем аннотации к изображениям
      const imagesWithAnnotations = (data.images || []).map((image: any) => ({
        ...image,
        annotations: (data.annotations || []).filter((ann: any) => ann.image_id === image.id)
      }))
      
      const taskData: TaskData = {
        ...data.task,
        recognition: data.recognition,
        images: imagesWithAnnotations
      }
      
      setTask(taskData)
      
      const progress = data.task.progress || { current_step_index: 0 }
      setCurrentStepIndex(progress.current_step_index)
    } catch (err) {
      console.error('Error loading task:', err)
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    loadTask()
  }, [loadTask])

  const allSteps: StepContext[] = task?.task_scope?.steps?.map((step, index) => {
    const stepProgress = task.progress?.steps?.[index] || { id: step.id, status: 'pending' }
    return {
      step,
      stepIndex: index,
      stepProgress,
      isActive: index === currentStepIndex,
      isCompleted: stepProgress.status === 'completed',
      isPending: stepProgress.status === 'pending',
    }
  }) || []

  const currentStep: StepContext = allSteps[currentStepIndex] || {
    step: {
      id: 'validate_dishes',
      name: 'Проверка блюд',
      type: 'validation',
      required: true,
      allow_drawing: true,
      checks: [],
    },
    stepIndex: 0,
    stepProgress: { id: 'validate_dishes', status: 'pending' },
    isActive: true,
    isCompleted: false,
    isPending: true,
  }

  const canGoNext = currentStepIndex < allSteps.length - 1
  const canGoPrev = currentStepIndex > 0

  const goToStep = useCallback((stepIndex: number) => {
    if (stepIndex >= 0 && stepIndex < allSteps.length) {
      setCurrentStepIndex(stepIndex)
    }
  }, [allSteps.length])

  const saveProgress = useCallback(async (annotations?: any[], modifiedDishes?: any[]) => {
    if (!task) return

    try {
      setIsSaving(true)
      const res = await fetch(`/api/tasks/${taskId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_step_index: currentStepIndex,
          annotations: annotations || [],
          modified_dishes: modifiedDishes || null,
        })
      })

      if (!res.ok) throw new Error('Failed to save progress')
    } catch (err) {
      console.error('Error saving progress:', err)
    } finally {
      setIsSaving(false)
    }
  }, [task, taskId, currentStepIndex])

  const completeStep = useCallback(async () => {
    if (!task) return

    try {
      setIsSaving(true)
      
      // Переходим к следующему этапу или завершаем
      const nextStepIndex = currentStepIndex + 1
      
      if (nextStepIndex >= allSteps.length) {
        // Завершаем задачу
        const res = await fetch(`/api/tasks/${taskId}/complete`, {
          method: 'POST',
        })
        
        if (!res.ok) throw new Error('Failed to complete task')
        
        router.push('/tasks')
      } else {
        // Переходим к следующему этапу
        setCurrentStepIndex(nextStepIndex)
        await saveProgress()
      }
    } catch (err) {
      console.error('Error completing step:', err)
    } finally {
      setIsSaving(false)
    }
  }, [task, taskId, currentStepIndex, allSteps.length, router, saveProgress])

  const skipStep = useCallback(async () => {
    if (!task) return

    try {
      setIsSaving(true)
      
      // Переходим к следующему этапу или завершаем задачу
      const nextStepIndex = currentStepIndex + 1
      
      if (nextStepIndex >= allSteps.length) {
        // Если это последний этап - завершаем задачу как пропущенную
        const res = await fetch(`/api/tasks/${taskId}/skip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'All steps skipped' })
        })
        
        if (!res.ok) throw new Error('Failed to skip task')
        router.push('/tasks')
      } else {
        // Переходим к следующему этапу, текущий помечается как пропущенный
        setCurrentStepIndex(nextStepIndex)
        await saveProgress()
      }
    } catch (err) {
      console.error('Error skipping step:', err)
    } finally {
      setIsSaving(false)
    }
  }, [task, taskId, currentStepIndex, allSteps.length, router, saveProgress])

  const skipTask = useCallback(async (reason?: string) => {
    if (!task) return

    try {
      setIsSaving(true)
      const res = await fetch(`/api/tasks/${taskId}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })

      if (!res.ok) throw new Error('Failed to skip task')
      
      router.push('/tasks')
    } catch (err) {
      console.error('Error skipping task:', err)
    } finally {
      setIsSaving(false)
    }
  }, [task, taskId, router])

  return {
    task,
    loading,
    currentStepIndex,
    currentStep,
    allSteps,
    canGoNext,
    canGoPrev,
    isSaving,
    loadTask,
    goToStep,
    completeStep,
    skipStep,
    skipTask,
    saveProgress,
  }
}

