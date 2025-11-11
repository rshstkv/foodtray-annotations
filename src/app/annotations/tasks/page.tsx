'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserNav } from '@/components/UserNav'
import { useUser } from '@/hooks/useUser'
import type { TaskStats } from '@/types/annotations'

interface User {
  id: string
  email: string
  full_name?: string
}

export default function TasksListPage() {
  const router = useRouter()
  const { user, isAdmin, loading: userLoading } = useUser()
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  const [filter, setFilter] = useState<string>('my') // my | unassigned | user_id

  useEffect(() => {
    if (!userLoading && user) {
      if (isAdmin) {
        fetchUsers()
      }
      fetchStats()
    }
  }, [userLoading, user, isAdmin])

  useEffect(() => {
    if (user) {
      fetchStats()
    }
  }, [filter, user])

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const fetchStats = async () => {
    try {
      setLoading(true)
      const url = filter === 'my' || filter === 'unassigned' 
        ? `/api/annotations/tasks/stats-detailed?filter=${filter}`
        : `/api/annotations/tasks/stats-detailed?user_id=${filter}`
      
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
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
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={() => router.push('/')}>
                ← Главная
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Задачи для аннотаторов</h1>
                <p className="text-gray-600 mt-2">
                  Выберите тип задачи для работы
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="my">Мои задачи</option>
                  <option value="unassigned">Неназначенные</option>
                  <optgroup label="По пользователям">
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.email} {u.full_name ? `(${u.full_name})` : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>
              )}
              <Button variant="outline" onClick={() => router.push('/annotations')}>
                Список recognitions →
              </Button>
              <UserNav />
            </div>
          </div>
        </div>

        {/* Main Task Groups */}
        <div className="space-y-6 mb-8">
          {/* 1. Быстрая проверка блюд */}
          <Card className="p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <span className="text-2xl">✓</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      Быстрая проверка блюд
                    </h2>
                    <p className="text-sm text-gray-600">
                      Задачи, где количество совпадает — нужна только проверка соответствия
                    </p>
                  </div>
                </div>
                <div className="ml-13 mt-3 space-y-1">
                  <div className="text-xs text-gray-500">
                    • Количество bbox уже совпадает на обеих картинках
                  </div>
                  <div className="text-xs text-gray-500">
                    • Можно быстро подвигать границы если нужно
                  </div>
                  <div className="text-xs text-gray-500">
                    • Просто проверить что блюда правильно определены
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-green-600">
                  {stats?.quick_validation || 0}
                </div>
                <div className="text-xs text-gray-500 mb-3">задач</div>
                <Button 
                  size="lg"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={filter !== 'my' || !stats?.quick_validation || stats.quick_validation === 0}
                  onClick={() => router.push('/annotations/tasks/dish_validation?mode=quick')}
                >
                  Начать проверку →
                </Button>
              </div>
            </div>
          </Card>

          {/* 2. Уточнение количества */}
          <Card className="p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <span className="text-2xl">✏️</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      Уточнение количества
                    </h2>
                    <p className="text-sm text-gray-600">
                      Задачи, требующие добавления или удаления bounding boxes
                    </p>
                  </div>
                </div>
                <div className="ml-13 mt-3 space-y-1">
                  <div className="text-xs text-gray-500">
                    • Количество не совпадает между картинками
                  </div>
                  <div className="text-xs text-gray-500">
                    • Нужно нарисовать недостающие bbox или удалить лишние
                  </div>
                  <div className="text-xs text-gray-500">
                    • После выравнивания можно сразу завершить
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-blue-600">
                  {stats?.edit_mode || 0}
                </div>
                <div className="text-xs text-gray-500 mb-3">задач</div>
                <Button 
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={filter !== 'my' || !stats?.edit_mode || stats.edit_mode === 0}
                  onClick={() => router.push('/annotations/tasks/dish_validation?mode=edit')}
                >
                  Начать редактирование →
                </Button>
              </div>
            </div>
          </Card>

          {/* 3. Ошибки в чеке */}
          <Card className="p-6 hover:shadow-lg transition-shadow border-yellow-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                    <span className="text-2xl">⚠️</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      Ошибки в чеке
                    </h2>
                    <p className="text-sm text-gray-600">
                      Задачи с неверными данными заказа в чеке
                    </p>
                  </div>
                </div>
                <div className="ml-13 mt-3 space-y-1">
                  <div className="text-xs text-gray-500">
                    • Неправильное количество блюд в чеке
                  </div>
                  <div className="text-xs text-gray-500">
                    • Неверные названия блюд
                  </div>
                  <div className="text-xs text-gray-500">
                    • Требуется ручная корректировка данных чека
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-yellow-600">
                  {stats?.check_errors || 0}
                </div>
                <div className="text-xs text-gray-500 mb-3">задач</div>
                  <Button 
                    size="lg"
                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    disabled={filter !== 'my' || !stats?.check_errors || stats.check_errors === 0}
                    onClick={() => router.push('/annotations/tasks/dish_validation?task_queue=check_error')}
                  >
                    Исправить →
                  </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Специальные задачи */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Специальные задачи</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Ориентация бутылок */}
            <Card className="p-4 hover:shadow-md transition-shadow">
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🍾</span>
                  <h3 className="text-md font-semibold">Ориентация бутылок</h3>
                </div>
                <p className="text-xs text-gray-600 mb-3 flex-1">
                  Админ добавляет EAN бутылок для разметки ориентации
                </p>
                <div className="flex items-center justify-between">
                  <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">
                    {stats?.bottle_orientation || 0} задач
                  </Badge>
                    <Button 
                      size="sm" 
                      variant="outline"
                    onClick={() => router.push('/admin')}
                    >
                    Настроить →
                    </Button>
                </div>
              </div>
            </Card>

            {/* Разметка баззеров */}
            <Card className="p-4 hover:shadow-md transition-shadow">
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🔔</span>
                  <h3 className="text-md font-semibold">Разметка баззеров</h3>
                </div>
                <p className="text-xs text-gray-600 mb-3 flex-1">
                  Задачи где аннотатор отметил "🔔 Есть баззер"
                </p>
                <div className="flex items-center justify-between">
                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                    {stats?.buzzer_annotation || 0} задач
                  </Badge>
                  <Button 
                    size="sm" 
                    variant="outline"
                    disabled={filter !== 'my' || !stats?.buzzer_annotation || stats.buzzer_annotation === 0}
                    onClick={() => router.push('/annotations/tasks/dish_validation?task_queue=buzzer')}
                  >
                    Начать →
                  </Button>
                </div>
              </div>
            </Card>

            {/* Другие объекты */}
            <Card className="p-4 hover:shadow-md transition-shadow">
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">📦</span>
                  <h3 className="text-md font-semibold">Другие объекты</h3>
                </div>
                <p className="text-xs text-gray-600 mb-3 flex-1">
                  Задачи где аннотатор отметил "📦 Есть другие предметы"
                </p>
                <div className="flex items-center justify-between">
                  <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
                    {stats?.non_food_objects || 0} задач
                  </Badge>
                  <Button 
                    size="sm" 
                    variant="outline"
                    disabled={filter !== 'my' || !stats?.non_food_objects || stats.non_food_objects === 0}
                    onClick={() => router.push('/annotations/tasks/dish_validation?task_queue=other_items')}
                  >
                    Начать →
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Экспорт датасета */}
        <Card className="p-6 bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Экспорт датасета</h3>
                <p className="text-sm text-gray-600">
                  Скачать CSV с результатами аннотаций для Data Science
                </p>
              </div>
            </div>
            <Link href="/annotations/export">
              <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700">
                Перейти к экспорту →
              </Button>
            </Link>
          </div>
        </Card>

        {/* Статистика */}
        <Card className="mt-8 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Общая статистика</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {(stats?.quick_validation || 0) + (stats?.edit_mode || 0)}
              </div>
              <div className="text-xs text-gray-500">В очереди</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {stats?.check_errors || 0}
              </div>
              <div className="text-xs text-gray-500">Ошибки в чеке</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {(stats?.bottle_orientation || 0) + (stats?.buzzer_annotation || 0) + (stats?.non_food_objects || 0)}
              </div>
              <div className="text-xs text-gray-500">Спец. задачи</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {stats?.completed || 0}
              </div>
              <div className="text-xs text-gray-500">Завершено</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
