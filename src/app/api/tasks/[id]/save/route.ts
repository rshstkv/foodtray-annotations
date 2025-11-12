import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    const body = await request.json()
    const { changes, current_step_index } = body

    const supabaseServer = await createClient()
    const { data: { user } } = await supabaseServer.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Обновляем прогресс задачи, если указан current_step_index
    if (current_step_index !== undefined) {
      const { error: progressError } = await supabaseServer
        .from('tasks')
        .update({
          progress: {
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

    // Применяем изменения аннотаций, если есть
    let savedCount = 0
    
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

