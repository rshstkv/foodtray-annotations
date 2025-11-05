import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/annotations/task-types
 * 
 * Получить список всех активных типов задач
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('task_types')
      .select('*')
      .eq('is_active', true)
      .order('id')

    if (error) {
      console.error('Error fetching task types:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

