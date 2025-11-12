import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { ValidatedState, StepSnapshot, Annotation } from '@/types/annotations'

/**
 * POST /api/tasks/{task_id}/complete
 * 
 * Завершить задачу (или этап задачи)
 * 
 * Body (опционально):
 * - step_id?: string - если завершаем конкретный этап
 * 
 * Логика:
 * 1. Если step_id указан - завершаем этап в progress
 * 2. Если это последний этап - завершаем всю задачу
 * 3. Если step_id не указан - завершаем всю задачу целиком
 * 4. Создаем snapshot валидированного состояния для завершенного этапа
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    const body = await request.json().catch(() => ({}))
    const { step_id } = body

    // Получить текущего пользователя
    const supabaseServer = await createClient()
    const { data: { user } } = await supabaseServer.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    console.log(`[tasks/${taskId}/complete] User ${user.id}, step: ${step_id || 'all'}`)

    // Получаем task
    const { data: task, error: taskError } = await supabaseServer
      .from('tasks')
      .select('*, recognitions(recognition_id)')
      .eq('id', taskId)
      .eq('assigned_to', user.id)
      .single()

    if (taskError || !task) {
      return NextResponse.json(
        { error: 'Task not found or not assigned to you' },
        { status: 404 }
      )
    }

    if (task.status === 'completed') {
      return NextResponse.json(
        { error: 'Task already completed' },
        { status: 400 }
      )
    }

    const taskScope = task.task_scope || {}
    const steps: Array<{ id: string; [key: string]: unknown }> = taskScope.steps || []
    const progress = task.progress || { current_step_index: 0, steps: [] }

  const updatedProgress = { ...progress }
  let taskCompleted = false
  let nextStep: typeof steps[0] | null = null
  let validatedStateToSave: ValidatedState | null = null

  if (step_id) {
    // Завершаем конкретный этап
    const stepIndex = steps.findIndex((s) => s.id === step_id)
      
      if (stepIndex === -1) {
        return NextResponse.json(
          { error: 'Step not found in task_scope' },
          { status: 400 }
        )
      }

      // Создаем snapshot валидированного состояния для этого этапа
      console.log(`[tasks/complete] Creating snapshot for step: ${step_id}`)
      
      // Получаем текущие аннотации и validated_state
      const { data: fullTask, error: fullTaskError } = await supabaseServer
        .from('tasks')
        .select('validated_state, task_scope, images(id), annotations(*)')
        .eq('id', taskId)
        .single()

      if (fullTaskError) {
        console.error('[tasks/complete] Error fetching full task:', fullTaskError)
        return NextResponse.json(
          { error: 'Failed to fetch task data for snapshot' },
          { status: 500 }
        )
      }

      const validatedState: ValidatedState = fullTask.validated_state || { 
        steps: {}, 
        current_draft: null 
      }

      // Получить текущее состояние чека (используем modified_dishes если есть, иначе оригинальный)
      const dishes = fullTask.task_scope?.modified_dishes || []

      // Группировать аннотации по image_id (только активные)
      const annotationsByImage: { [key: string]: Annotation[] } = {}
      for (const ann of (fullTask.annotations || [])) {
        if (!ann.is_deleted) {
          if (!annotationsByImage[ann.image_id]) {
            annotationsByImage[ann.image_id] = []
          }
          annotationsByImage[ann.image_id].push(ann)
        }
      }

      // Создать snapshot
      const snapshot: StepSnapshot = {
        validated_at: new Date().toISOString(),
        validated_by: user.id,
        snapshot: {
          dishes,
          annotations: annotationsByImage
        },
        changes_log: validatedState.current_draft?.changes_log || []
      }

      // Сохранить snapshot и очистить draft
      validatedState.steps[step_id] = snapshot
      validatedState.current_draft = null
      validatedStateToSave = validatedState

      console.log(`[tasks/complete] Snapshot created with ${Object.keys(annotationsByImage).length} images, ${dishes.length} dishes, ${snapshot.changes_log.length} changes`)

      // Обновляем progress для этого этапа
      updatedProgress.steps[stepIndex] = {
        ...updatedProgress.steps[stepIndex],
        id: step_id,
        status: 'completed',
        completed_at: new Date().toISOString()
      }

      // Переходим на следующий этап или завершаем задачу
      if (stepIndex < steps.length - 1) {
        updatedProgress.current_step_index = stepIndex + 1
        nextStep = steps[stepIndex + 1]
      } else {
        taskCompleted = true
      }
    } else {
      // Завершаем всю задачу целиком (только если нет этапов или это одноэтапная задача)
      if (steps.length === 0 || updatedProgress.current_step_index >= steps.length) {
        taskCompleted = true
      } else {
        return NextResponse.json(
          { error: 'Cannot complete task without completing all steps. Use step_id to complete individual steps.' },
          { status: 400 }
        )
      }
    }

    // Обновляем task
    const updateData: Record<string, unknown> = {
      progress: updatedProgress
    }

    // Добавляем validated_state если был создан snapshot
    if (validatedStateToSave) {
      updateData.validated_state = validatedStateToSave
    }

    if (taskCompleted) {
      updateData.status = 'completed'
      updateData.completed_at = new Date().toISOString()
      updateData.completed_by = user.id
    }

    const { error: updateError } = await supabaseServer
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)

    if (updateError) {
      console.error('[tasks/complete] Error updating task:', updateError)
      return NextResponse.json(
        { error: 'Failed to update task' },
        { status: 500 }
      )
    }

    console.log(`[tasks/${taskId}/complete] Success - completed: ${taskCompleted}`)

    return NextResponse.json({
      success: true,
      task_id: taskId,
      step_completed: step_id || null,
      task_completed: taskCompleted,
      next_step: nextStep,
      progress: updatedProgress
    })

  } catch (error) {
    console.error('[tasks/complete] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
