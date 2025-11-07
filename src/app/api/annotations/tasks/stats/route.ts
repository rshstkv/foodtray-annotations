import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/annotations/tasks/stats
 * 
 * Возвращает статистику по всем типам задач
 * 
 * Response:
 * {
 *   quick_validation: number,  // M=Q=expected, pending
 *   edit_mode: number,          // M≠Q or M≠expected, pending
 *   requires_correction: number,
 *   bottle_orientation: number,
 *   buzzer_annotation: number,
 *   non_food_objects: number,
 *   completed: number
 * }
 */
export async function GET() {
  try {
    // Используем RPC функцию для быстрого подсчета
    const { data, error } = await supabase.rpc('get_task_stats_grouped')

    if (error) {
      console.error('Error fetching stats:', error)
      // Fallback to simple counts
      return getFallbackStats()
    }

    return NextResponse.json(data || {
      quick_validation: 0,
      edit_mode: 0,
      requires_correction: 0,
      bottle_orientation: 0,
      buzzer_annotation: 0,
      non_food_objects: 0,
      completed: 0,
    })

  } catch (error) {
    console.error('Unexpected error in stats endpoint:', error)
    return getFallbackStats()
  }
}

/**
 * Fallback stats если RPC функция не работает
 */
async function getFallbackStats() {
  try {
    // Простые подсчеты по workflow_state
    const { count: correctionCount } = await supabase
      .from('recognitions')
      .select('*', { count: 'exact', head: true })
      .eq('workflow_state', 'requires_correction')

    const { count: buzzerCount } = await supabase
      .from('recognitions')
      .select('*', { count: 'exact', head: true })
      .eq('workflow_state', 'buzzer_pending')

    const { count: completedCount } = await supabase
      .from('recognitions')
      .select('*', { count: 'exact', head: true })
      .eq('workflow_state', 'completed')

    // Для dish_validation задач (tier 1 = quick, остальные = edit)
    const { count: tier1Count } = await supabase
      .from('recognitions')
      .select('*', { count: 'exact', head: true })
      .eq('workflow_state', 'pending')
      .eq('tier', 1)

    const { count: otherTiersCount } = await supabase
      .from('recognitions')
      .select('*', { count: 'exact', head: true })
      .eq('workflow_state', 'pending')
      .gt('tier', 1)

    return NextResponse.json({
      quick_validation: tier1Count || 0,
      edit_mode: otherTiersCount || 0,
      requires_correction: correctionCount || 0,
      bottle_orientation: 0, // TODO: посчитать
      buzzer_annotation: buzzerCount || 0,
      non_food_objects: 0, // TODO: посчитать
      completed: completedCount || 0,
    })
  } catch (error) {
    console.error('Fallback stats error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

