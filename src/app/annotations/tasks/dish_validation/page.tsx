import { redirect } from 'next/navigation'
import { DishValidationClient } from './DishValidationClient'

type DishValidationPageProps = {
  searchParams?: Promise<{
    mode?: string
    task_queue?: string
  }> | {
    mode?: string
    task_queue?: string
  }
}

export default async function DishValidationPage({ searchParams }: DishValidationPageProps) {
  const params = searchParams instanceof Promise ? await searchParams : searchParams
  const modeParam = params?.mode
  const taskQueueParam = params?.task_queue as 'dish_validation' | 'check_error' | 'buzzer' | 'other_items' | undefined

  // Для специальных очередей всегда используем edit mode
  if (taskQueueParam && taskQueueParam !== 'dish_validation') {
    return <DishValidationClient mode="edit" taskQueue={taskQueueParam} />
  }

  // Для обычной очереди требуем указание mode
  if (modeParam !== 'quick' && modeParam !== 'edit') {
    redirect('/annotations/tasks/dish_validation?mode=quick')
  }

  return <DishValidationClient mode={modeParam} taskQueue="dish_validation" />
}

