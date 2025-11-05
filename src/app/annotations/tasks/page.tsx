'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface TaskType {
  id: number
  code: string
  name: string
  description: string
  ui_config: {
    layout: string
    focus_mode: string
  }
  is_active: boolean
}

interface TaskStats {
  task_type_code: string
  tier: number
  count: number
}

export default function TasksListPage() {
  const router = useRouter()
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [stats, setStats] = useState<Record<string, Record<number, number>>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)

      // Получаем task types
      const tasksRes = await fetch('/api/annotations/task-types')
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json()
        setTaskTypes(tasksData.data || [])
      }

      // Получаем статистику по задачам
      const statsRes = await fetch('/api/annotations/task-stats')
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        // Преобразуем массив в объект { task_code: { tier: count } }
        const statsMap: Record<string, Record<number, number>> = {}
        statsData.data.forEach((stat: TaskStats) => {
          if (!statsMap[stat.task_type_code]) {
            statsMap[stat.task_type_code] = {}
          }
          statsMap[stat.task_type_code][stat.tier] = stat.count
        })
        setStats(statsMap)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getTotalCount = (taskCode: string): number => {
    const taskStats = stats[taskCode] || {}
    return Object.values(taskStats).reduce((sum, count) => sum + count, 0)
  }

  const getTierColor = (tier: number): string => {
    switch (tier) {
      case 1: return 'bg-green-500'
      case 2: return 'bg-blue-500'
      case 3: return 'bg-yellow-500'
      case 4: return 'bg-orange-500'
      case 5: return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const handleStartTask = (taskCode: string, tier?: number) => {
    const url = tier 
      ? `/annotations/tasks/${taskCode}?tier=${tier}`
      : `/annotations/tasks/${taskCode}`
    router.push(url)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Задачи для аннотаторов</h1>
              <p className="text-gray-600 mt-2">
                Выберите тип задачи и уровень сложности
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push('/annotations')}>
              ← К списку recognitions
            </Button>
          </div>
        </div>

        {/* Task Types */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {taskTypes.map((taskType) => {
            const totalCount = getTotalCount(taskType.code)
            const taskStats = stats[taskType.code] || {}

            return (
              <Card key={taskType.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-gray-900 mb-1">
                      {taskType.name}
                    </h2>
                    <p className="text-sm text-gray-600 mb-3">{taskType.description}</p>
                    
                    {/* Badges */}
                    <div className="flex gap-2 mb-4">
                      <Badge variant="outline" className="text-xs">
                        {taskType.ui_config.layout === 'dual-image' ? '2 фото' : '1 фото'}
                      </Badge>
                      <Badge variant="outline" className="text-xs capitalize">
                        {taskType.ui_config.focus_mode}
                      </Badge>
                    </div>
                  </div>

                  {/* Total count */}
                  <div className="text-right">
                    <div className="text-3xl font-bold text-blue-600">{totalCount}</div>
                    <div className="text-xs text-gray-500">доступно</div>
                  </div>
                </div>

                {/* Tier breakdown */}
                {totalCount > 0 && (
                  <div className="space-y-2 mb-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">По уровням:</div>
                    {[1, 2, 3, 4, 5].map((tier) => {
                      const count = taskStats[tier] || 0
                      if (count === 0) return null
                      
                      return (
                        <div key={tier} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${getTierColor(tier)}`} />
                            <span className="text-sm text-gray-700">Tier {tier}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{count}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStartTask(taskType.code, tier)}
                            >
                              Начать
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Main action button */}
                <Button
                  className="w-full"
                  disabled={totalCount === 0}
                  onClick={() => handleStartTask(taskType.code)}
                >
                  {totalCount > 0 ? 'Начать работу' : 'Нет доступных задач'}
                </Button>
              </Card>
            )
          })}
        </div>

        {/* Legend */}
        <Card className="mt-8 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Уровни сложности:</h3>
          <div className="grid grid-cols-5 gap-4">
            {[
              { tier: 1, label: 'Очень легко', desc: 'Все совпадает' },
              { tier: 2, label: 'Легко', desc: 'Есть выбор блюд' },
              { tier: 3, label: 'Средне', desc: 'Разница в bbox' },
              { tier: 4, label: 'Сложно', desc: 'Комбинация факторов' },
              { tier: 5, label: 'Очень сложно', desc: 'Требует внимания' },
            ].map(({ tier, label, desc }) => (
              <div key={tier} className="flex items-start gap-2">
                <div className={`w-4 h-4 rounded-full ${getTierColor(tier)} mt-0.5 flex-shrink-0`} />
                <div>
                  <div className="text-xs font-medium text-gray-900">{label}</div>
                  <div className="text-xs text-gray-500">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

