'use client'

import { createContext, useContext, ReactNode } from 'react'
import { TaskData, StepContext } from '@/types/annotations'

interface TaskContextValue {
  task: TaskData
  currentStep: StepContext
  allSteps: StepContext[]
  canGoNext: boolean
  canGoPrev: boolean
  goToStep: (stepIndex: number) => void
  completeStep: () => Promise<void>
  skipTask: (reason?: string) => Promise<void>
  saveProgress: () => Promise<void>
}

const TaskContext = createContext<TaskContextValue | null>(null)

export function useTask() {
  const context = useContext(TaskContext)
  if (!context) {
    throw new Error('useTask must be used within TaskProvider')
  }
  return context
}

export function TaskProvider({
  children,
  value,
}: {
  children: ReactNode
  value: TaskContextValue
}) {
  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>
}




