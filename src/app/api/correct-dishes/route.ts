import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { clarification_id, selected_ean, selected_product_name, source } = body

  // Validate required fields
  if (!clarification_id || !selected_ean || !selected_product_name || !source) {
    return NextResponse.json(
      { error: 'Missing required fields: clarification_id, selected_ean, selected_product_name, source' },
      { status: 400 }
    )
  }

  if (!['available', 'menu'].includes(source)) {
    return NextResponse.json(
      { error: 'source must be "available" or "menu"' },
      { status: 400 }
    )
  }

  try {
    // First, find the clarification to get its database ID
    const { data: clarification, error: clarificationError } = await supabase
      .from('clarifications')
      .select('id')
      .eq('clarification_id', clarification_id)
      .single()

    if (clarificationError || !clarification) {
      console.error('Clarification not found:', clarificationError)
      return NextResponse.json(
        { error: 'Clarification not found' },
        { status: 404 }
      )
    }

    // Upsert (insert or update if exists)
    const { data, error } = await supabase
      .from('correct_dishes')
      .upsert(
        {
          clarification_db_id: clarification.id,
          clarification_id,
          selected_ean,
          selected_product_name,
          source,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'clarification_db_id'
        }
      )
      .select()
      .single()

    if (error) {
      console.error('Error saving correct dish:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Unexpected error in correct-dishes API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json()
  const { clarification_id } = body

  if (!clarification_id) {
    return NextResponse.json(
      { error: 'Missing required field: clarification_id' },
      { status: 400 }
    )
  }

  try {
    // Find the clarification to get its database ID
    const { data: clarification, error: clarificationError } = await supabase
      .from('clarifications')
      .select('id')
      .eq('clarification_id', clarification_id)
      .single()

    if (clarificationError || !clarification) {
      // If clarification not found, consider it already deleted
      return NextResponse.json({ success: true })
    }

    const { error } = await supabase
      .from('correct_dishes')
      .delete()
      .eq('clarification_db_id', clarification.id)

    if (error) {
      console.error('Error deleting correct dish:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error in correct-dishes DELETE:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

