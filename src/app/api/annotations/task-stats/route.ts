import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/annotations/task-stats
 * 
 * Получить статистику по доступным задачам
 * Возвращает количество pending recognitions для каждого task_type и tier
 */
export async function GET() {
  try {
    // Используем прямой SQL запрос с GROUP BY для правильного подсчета всех recognitions
    // (Supabase JS API ограничивает результаты до 1000 записей)
    const { data: stats, error } = await supabase.rpc('get_task_stats')

    if (error) {
      // Если RPC функция не найдена, используем fallback с прямым SQL
      console.log('RPC function not found, using direct query')
      
      // Получаем статистику напрямую через SQL
      // ВАЖНО: убираем лимит 1000, чтобы получить все записи
      const { data: directStats, error: directError } = await supabase
        .from('recognitions')
        .select('current_stage_id, tier')
        .eq('workflow_state', 'pending')
        .limit(10000) // Увеличиваем лимит для всех recognitions
      
      if (directError) {
        console.error('Error fetching stats:', directError)
        return NextResponse.json(
          { error: directError.message },
          { status: 500 }
        )
      }

      // Получаем stages для маппинга stage_id -> task_type
      const { data: stages } = await supabase
        .from('workflow_stages')
        .select('id, task_type:task_types(code)')

      const stageMap = new Map()
      stages?.forEach(stage => {
        stageMap.set(stage.id, (stage.task_type as { code: string }).code)
      })

      // Группируем вручную
      const grouped: Record<string, Record<number, number>> = {}
      
      directStats?.forEach(rec => {
        const taskCode = stageMap.get(rec.current_stage_id)
        if (!taskCode) return
        
        if (!grouped[taskCode]) grouped[taskCode] = {}
        const tier = rec.tier || 1
        grouped[taskCode][tier] = (grouped[taskCode][tier] || 0) + 1
      })

      // Преобразуем в плоский массив
      const flatStats: Array<{ task_type_code: string; tier: number; count: number }> = []
      
      Object.entries(grouped).forEach(([taskCode, tierCounts]) => {
        Object.entries(tierCounts).forEach(([tier, count]) => {
          flatStats.push({
            task_type_code: taskCode,
            tier: parseInt(tier),
            count: count
          })
        })
      })

      return NextResponse.json({ data: flatStats })
    }

    return NextResponse.json({ data: stats })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

