import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { ValidatedState, ChangeLogEntry } from '@/types/annotations'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    const body = await request.json()
    const { changes, annotations, modified_dishes, current_step_index } = body

    const supabaseServer = await createClient()
    const { data: { user } } = await supabaseServer.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Получаем текущую задачу для validated_state
    const { data: taskData, error: taskFetchError } = await supabaseServer
      .from('tasks')
      .select('validated_state, task_scope, progress')
      .eq('id', taskId)
      .single()

    if (taskFetchError) {
      console.error('[tasks/save] Error fetching task:', taskFetchError)
      return NextResponse.json(
        { error: 'Failed to fetch task' },
        { status: 500 }
      )
    }

    // Инициализируем validated_state
    const validatedState: ValidatedState = taskData.validated_state || { 
      steps: {}, 
      current_draft: null 
    }
    
    const currentStepId = taskData.task_scope?.steps?.[current_step_index]?.id

    // Создаем массив изменений для current_draft
    const changesLog: ChangeLogEntry[] = []

    // Обновляем прогресс задачи, если указан current_step_index
    if (current_step_index !== undefined) {
      // Сначала получаем текущий progress, чтобы не потерять массив steps
      const { data: taskData, error: fetchError } = await supabaseServer
        .from('tasks')
        .select('progress')
        .eq('id', taskId)
        .single()
      
      if (fetchError) {
        console.error('[tasks/save] Error fetching task:', fetchError)
        return NextResponse.json(
          { error: 'Failed to fetch task' },
          { status: 500 }
        )
      }

      const currentProgress = taskData.progress || {}
      const { error: progressError } = await supabaseServer
        .from('tasks')
        .update({
          progress: {
            ...currentProgress,  // Сохраняем существующие данные (включая steps)
            current_step_index,
            updated_at: new Date().toISOString(),
          },
        })
        .eq('id', taskId)
      
      if (progressError) {
        console.error('[tasks/save] Error updating progress:', progressError)
        return NextResponse.json(
          { error: 'Failed to update progress' },
          { status: 500 }
        )
      }
    }

    // Сохраняем измененный чек в task_scope
    if (modified_dishes) {
      const { data: taskData, error: taskFetchError } = await supabaseServer
        .from('tasks')
        .select('task_scope')
        .eq('id', taskId)
        .single()

      if (taskFetchError) {
        console.error('[tasks/save] Error fetching task:', taskFetchError)
      } else {
        const updatedTaskScope = {
          ...taskData.task_scope,
          modified_dishes,
        }

        const { error: taskScopeError } = await supabaseServer
          .from('tasks')
          .update({ task_scope: updatedTaskScope })
          .eq('id', taskId)

        if (taskScopeError) {
          console.error('[tasks/save] Error updating task_scope:', taskScopeError)
        }
      }
    }

    // Применяем изменения аннотаций
    let savedCount = 0
    
    // Логируем изменения для validated_state.current_draft
    if (annotations && Array.isArray(annotations)) {
      for (const ann of annotations) {
        const timestamp = new Date().toISOString()
        
        if (!ann.id) {
          // Новая аннотация
          changesLog.push({
            type: 'annotation_created',
            timestamp,
            annotation_id: 'pending', // будет обновлен после вставки
            object_type: ann.object_type,
            image_id: ann.image_id
          })
        } else if (ann.is_deleted) {
          // Удаленная аннотация
          changesLog.push({
            type: 'annotation_deleted',
            timestamp,
            annotation_id: ann.id,
            reason: 'user_deleted'
          })
        } else if (ann.custom_dish_name) {
          // Разрешение неопределенности
          // Проверяем - это новое разрешение или уже существовало
          const existingEntry = validatedState.current_draft?.changes_log.find(
            entry => entry.type === 'dish_resolved' && entry.dish_index === ann.dish_index
          )
          
          if (!existingEntry) {
            changesLog.push({
              type: 'dish_resolved',
              timestamp,
              dish_index: ann.dish_index,
              selected_name: ann.custom_dish_name,
              previous_names: [] // можно получить из recognitions если нужно
            })
          }
        }
      }
    }
    
    // Поддержка старого формата (changes) для обратной совместимости
    if (changes && Array.isArray(changes)) {
      for (const change of changes) {
        if (change.type === 'create') {
          const { error } = await supabaseServer
            .from('annotations')
            .insert({
              ...change.annotation,
              created_by: user.id,
              source: 'manual',
            })
          
          if (!error) savedCount++
        } else if (change.type === 'update') {
          const { error } = await supabaseServer
            .from('annotations')
            .update({
              ...change.annotation,
              updated_by: user.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', change.annotation.id)
          
          if (!error) savedCount++
        } else if (change.type === 'delete') {
          const { error } = await supabaseServer
            .from('annotations')
            .update({ is_deleted: true })
            .eq('id', change.annotation.id)
          
          if (!error) savedCount++
        }
      }
    }
    
    // Новый формат: прямое сохранение всех аннотаций (upsert)
    if (annotations && Array.isArray(annotations)) {
      console.log(`[tasks/save] Saving ${annotations.length} annotations`)
      
      for (const annotation of annotations) {
        // Пропускаем аннотации, которые не были изменены (нет id или это новые)
        if (!annotation.id) {
          // Создаем новую аннотацию
          const { error } = await supabaseServer
            .from('annotations')
            .insert({
              ...annotation,
              created_by: user.id,
              source: 'manual',
            })
          
          if (error) {
            console.error('[tasks/save] Error inserting annotation:', error)
          } else {
            savedCount++
          }
        } else {
          // Обновляем существующую - логируем custom_dish_name для отладки
          if (annotation.custom_dish_name) {
            console.log(`[tasks/save] Updating annotation ${annotation.id.substring(0, 8)} with custom_dish_name: ${annotation.custom_dish_name}`)
          }
          
          const { error } = await supabaseServer
            .from('annotations')
            .update({
              ...annotation,
              updated_by: user.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', annotation.id)
          
          if (error) {
            console.error('[tasks/save] Error updating annotation:', error)
          } else {
            savedCount++
          }
        }
      }
    }
    
    // Обновляем validated_state.current_draft
    if (changesLog.length > 0 && currentStepId) {
      validatedState.current_draft = {
        step_id: currentStepId,
        changes_log: [
          ...(validatedState.current_draft?.changes_log || []),
          ...changesLog
        ]
      }
      
      // Сохраняем обновленный validated_state
      const { error: stateError } = await supabaseServer
        .from('tasks')
        .update({ validated_state: validatedState })
        .eq('id', taskId)
      
      if (stateError) {
        console.error('[tasks/save] Error updating validated_state:', stateError)
      } else {
        console.log(`[tasks/save] Updated validated_state with ${changesLog.length} change(s)`)
      }
    }

    return NextResponse.json({
      success: true,
      saved_count: savedCount,
      message: current_step_index !== undefined 
        ? `Progress saved at step ${current_step_index}` 
        : `${savedCount} annotation(s) saved`,
    })

  } catch (error) {
    console.error('[tasks/save] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

