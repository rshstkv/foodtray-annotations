import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Параллельные запросы только для нужных значений
    const [canteenNames] = await Promise.all([
      // Уникальные названия столовых
      supabase
        .from('orders')
        .select('device_canteen_name')
        .not('device_canteen_name', 'is', null)
        .order('device_canteen_name')
    ])

    // Проверяем ошибки
    if (canteenNames.error) {
      console.error('Database error:', canteenNames.error)
      return NextResponse.json({ error: 'Failed to load filter options' }, { status: 500 })
    }

    // Извлекаем уникальные значения
    const uniqueCanteenNames = [...new Set(
      canteenNames.data?.map(item => item.device_canteen_name).filter(Boolean) || []
    )].sort()

    return NextResponse.json({
      device_canteen_names: uniqueCanteenNames,
      states: ['yes', 'no', 'не задано'] // Фиксированные значения для состояний
    })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json({ error: 'Failed to load filter options' }, { status: 500 })
  }
}
