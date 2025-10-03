import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/states - получить все состояния
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('clarification_states')
      .select('clarification_id, state')

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Преобразовать в формат для фронтенда
    const states: Record<string, string> = {}
    data?.forEach(item => {
      states[item.clarification_id] = item.state
    })

    return NextResponse.json(states)
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

    if (!['yes', 'no'].includes(state)) {
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

    const { error } = await supabase
      .from('clarification_states')
      .upsert({
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
    const { clarification_id } = await request.json()

    if (!clarification_id) {
      return NextResponse.json({ error: 'Missing clarification_id' }, { status: 400 })
    }

    const { error } = await supabase
      .from('clarification_states')
      .delete()
      .eq('clarification_id', clarification_id)

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
