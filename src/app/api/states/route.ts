import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/states - получить все состояния
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('clarification_states')
      .select('clarification_db_id, state')

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Преобразовать в формат для фронтенда
    type StateRow = { clarification_db_id: number; state: 'yes' | 'no' | 'bbox_error' | 'unknown' }
    const rows = (data || []) as StateRow[]
    const states: Record<string, StateRow['state']> = {}
    rows.forEach(item => {
      const key = String(item.clarification_db_id)
      states[key] = item.state
    })

    const res = NextResponse.json(states)
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/states - сохранить состояние
export async function POST(request: NextRequest) {
  try {
    const { clarification_id, state, db_id } = await request.json()

    if (!clarification_id || !state) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['yes', 'no', 'bbox_error', 'unknown'].includes(state)) {
      return NextResponse.json({ error: 'Invalid state value' }, { status: 400 })
    }

    // Если db_id не передан, найдем его по clarification_id
    let clarification_db_id = db_id
    if (!clarification_db_id) {
      const { data: clarification, error: findError } = await supabase
        .from('clarifications')
        .select('id')
        .eq('clarification_id', clarification_id)
        .single()

      if (findError || !clarification) {
        console.error('Cannot find clarification:', findError)
        return NextResponse.json({ error: 'Clarification not found' }, { status: 404 })
      }

      clarification_db_id = clarification.id
    }

    // Обновляем состояние для конкретного clarification_db_id атомарно: удалить предыдущее и вставить новое
    const { error: delErr } = await supabase
      .from('clarification_states')
      .delete()
      .eq('clarification_db_id', clarification_db_id)

    if (delErr) {
      console.error('Database error (delete before insert):', delErr)
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    const { error } = await supabase
      .from('clarification_states')
      .insert({
        clarification_id,
        clarification_db_id,
        state,
        updated_at: new Date().toISOString()
      })

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/states/[id] - удалить состояние (для кнопки Clear)
export async function DELETE(request: NextRequest) {
  try {
    const { db_id } = await request.json()

    if (!db_id) {
      return NextResponse.json({ error: 'Missing db_id' }, { status: 400 })
    }

    const { error } = await supabase
      .from('clarification_states')
      .delete()
      .eq('clarification_db_id', db_id)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
