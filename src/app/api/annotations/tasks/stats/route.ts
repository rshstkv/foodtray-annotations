import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/annotations/tasks/stats
 * 
 * Возвращает статистику по task_queue и validation_mode
 * 
 * Response:
 * {
 *   quick_validation: number,  // dish_validation + quick mode
 *   edit_mode: number,          // dish_validation + edit mode
 *   check_errors: number,       // check_error queue
 *   buzzer_annotation: number,  // buzzer queue
 *   non_food_objects: number,   // other_items queue
 *   completed: number           // всего completed
 * }
 */
export async function GET() {
  try {
    // Получаем детальную статистику: всего, назначено, не назначено
    const { data: stats } = await supabase
      .from('recognitions')
      .select('task_queue, validation_mode, assigned_to, workflow_state')
      .eq('workflow_state', 'pending')

    const { data: completed } = await supabase
      .from('recognitions')
      .select('*', { count: 'exact', head: true })
      .eq('workflow_state', 'completed')

    // Подсчет по категориям
    const quickTotal = stats?.filter(r => r.task_queue === 'dish_validation' && r.validation_mode === 'quick').length || 0
    const quickAssigned = stats?.filter(r => r.task_queue === 'dish_validation' && r.validation_mode === 'quick' && r.assigned_to).length || 0
    const quickUnassigned = quickTotal - quickAssigned

    const editTotal = stats?.filter(r => r.task_queue === 'dish_validation' && r.validation_mode === 'edit').length || 0
    const editAssigned = stats?.filter(r => r.task_queue === 'dish_validation' && r.validation_mode === 'edit' && r.assigned_to).length || 0
    const editUnassigned = editTotal - editAssigned

    const checkTotal = stats?.filter(r => r.task_queue === 'check_error').length || 0
    const checkAssigned = stats?.filter(r => r.task_queue === 'check_error' && r.assigned_to).length || 0
    const checkUnassigned = checkTotal - checkAssigned

    const buzzerTotal = stats?.filter(r => r.task_queue === 'buzzer').length || 0
    const buzzerAssigned = stats?.filter(r => r.task_queue === 'buzzer' && r.assigned_to).length || 0
    const buzzerUnassigned = buzzerTotal - buzzerAssigned

    const otherTotal = stats?.filter(r => r.task_queue === 'other_items').length || 0
    const otherAssigned = stats?.filter(r => r.task_queue === 'other_items' && r.assigned_to).length || 0
    const otherUnassigned = otherTotal - otherAssigned

    return NextResponse.json({
      quick_validation: quickTotal,
      quick_validation_assigned: quickAssigned,
      quick_validation_unassigned: quickUnassigned,
      
      edit_mode: editTotal,
      edit_mode_assigned: editAssigned,
      edit_mode_unassigned: editUnassigned,
      
      check_errors: checkTotal,
      check_errors_assigned: checkAssigned,
      check_errors_unassigned: checkUnassigned,
      
      buzzer_annotation: buzzerTotal,
      buzzer_annotation_assigned: buzzerAssigned,
      buzzer_annotation_unassigned: buzzerUnassigned,
      
      non_food_objects: otherTotal,
      non_food_objects_assigned: otherAssigned,
      non_food_objects_unassigned: otherUnassigned,
      
      bottle_orientation: 0,
      completed: completed?.count || 0,
    })

  } catch (error) {
    console.error('Unexpected error in stats endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}


