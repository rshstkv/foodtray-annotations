import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Параллельные запросы только для нужных значений
    const [canteenNames, buckets] = await Promise.all([
      // Возвращаем только те столовые, по которым реально есть кларификации
      supabase
        .from('clarifications')
        .select(`
          orders!inner(
            device_canteen_name
          )
        `)
        .limit(20000),
      // Частотные бакеты из вьюхи
      supabase
        .from('v_ean_freq_bucket')
        .select('bucket')
        .limit(1000)
    ])

    // Проверяем ошибки
    if (canteenNames.error || buckets.error) {
      console.error('Database error:', canteenNames.error || buckets.error)
      return NextResponse.json({ error: 'Failed to load filter options' }, { status: 500 })
    }

    // Извлекаем уникальные значения
    type Row = { orders: { device_canteen_name: string } | Array<{ device_canteen_name: string }> }
    const uniqueCanteenNames = [...new Set(
      ((canteenNames.data || []) as Row[])
        .map(r => Array.isArray(r.orders) ? r.orders[0]?.device_canteen_name : r.orders?.device_canteen_name)
        .map(v => String(v || '').trim())
        .filter(v => v.length > 0)
    )].sort()

    type BucketRow = { bucket: string }
    
    return NextResponse.json({
      device_canteen_names: uniqueCanteenNames,
      states: ['yes', 'no', 'corrected', 'bbox_error', 'unknown', 'не задано'], // Все возможные состояния
      freq_buckets: Array.from(new Set((buckets.data || []).map((r: BucketRow) => r.bucket))).filter(Boolean)
    })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json({ error: 'Failed to load filter options' }, { status: 500 })
  }
}
