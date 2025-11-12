import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    const body = await request.json()
    const { changes } = body

    const supabaseServer = await createClient()
    const { data: { user } } = await supabaseServer.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Применяем изменения
    let savedCount = 0
    
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

    return NextResponse.json({
      success: true,
      saved_count: savedCount,
    })

  } catch (error) {
    console.error('[tasks/save] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

