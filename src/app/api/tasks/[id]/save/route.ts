import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

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
          
          if (!error) savedCount++
        } else {
          // Обновляем существующую
          const { error } = await supabaseServer
            .from('annotations')
            .update({
              ...annotation,
              updated_by: user.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', annotation.id)
          
          if (!error) savedCount++
        }
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

