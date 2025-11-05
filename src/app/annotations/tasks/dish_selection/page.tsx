'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/**
 * Dish Selection Task UI
 * Самый быстрый интерфейс для выбора правильного блюда из нескольких вариантов
 * 
 * Фокус: Быстрый выбор через цифры 1-2-3
 * Layout: Одна картинка + крупные карточки с вариантами
 * Actions: correct_dish_select
 */

interface Dish {
  Name: string
  ean?: string
}

interface CorrectDish {
  Count: number
  Dishes: Dish[]
}

interface Recognition {
  recognition_id: string
  correct_dishes: CorrectDish[]
  tier: number
}

interface TaskData {
  recognition: Recognition
  task_type: {
    code: string
    name: string
  }
  stage: {
    id: number
    name: string
  }
}

export default function DishSelectionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tier = searchParams.get('tier')

  const [taskData, setTaskData] = useState<TaskData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentDishIndex, setCurrentDishIndex] = useState(0)
  const [selectedDishes, setSelectedDishes] = useState<number[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchNextTask()
  }, [tier])

  useEffect(() => {
    // Горячие клавиши
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!taskData) return
      
      const currentDish = taskData.recognition.correct_dishes[currentDishIndex]
      if (!currentDish || currentDish.Dishes.length <= 1) return

      const key = parseInt(e.key)
      if (key >= 1 && key <= currentDish.Dishes.length) {
        handleSelectDish(key - 1)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [taskData, currentDishIndex])

  const fetchNextTask = async () => {
    try {
      setLoading(true)
      const url = tier
        ? `/api/annotations/tasks/next?task_type=dish_selection&tier=${tier}`
        : `/api/annotations/tasks/next?task_type=dish_selection`
      
      const response = await fetch(url)
      
      if (response.status === 404) {
        setTaskData(null)
        return
      }

      const data = await response.json()
      setTaskData(data)
      setCurrentDishIndex(0)
      setSelectedDishes([])
    } catch (error) {
      console.error('Error fetching task:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectDish = async (dishVariantIndex: number) => {
    if (!taskData) return

    const newSelectedDishes = [...selectedDishes]
    newSelectedDishes[currentDishIndex] = dishVariantIndex
    setSelectedDishes(newSelectedDishes)

    // Автоматически переходим к следующему блюду
    const nextIndex = currentDishIndex + 1
    const multipleChoiceDishes = taskData.recognition.correct_dishes.filter(d => d.Dishes.length > 1)
    
    if (nextIndex < multipleChoiceDishes.length) {
      setCurrentDishIndex(nextIndex)
    } else {
      // Все выбрано, сохраняем
      await saveSelections(newSelectedDishes)
    }
  }

  const saveSelections = async (selections: number[]) => {
    if (!taskData) return

    try {
      setSaving(true)

      // Обновляем correct_dishes: оставляем только выбранное блюдо
      const updatedCorrectDishes = taskData.recognition.correct_dishes.map((dish, idx) => {
        if (dish.Dishes.length > 1) {
          const selectedIndex = selections[idx] ?? 0
          return {
            ...dish,
            Dishes: [dish.Dishes[selectedIndex]]
          }
        }
        return dish
      })

      // Сохраняем изменения
      await fetch(`/api/annotations/recognitions/${taskData.recognition.recognition_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correct_dishes: updatedCorrectDishes
        })
      })

      // Завершаем этап
      const completeResponse = await fetch(
        `/api/annotations/tasks/${taskData.recognition.recognition_id}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stage_id: taskData.stage.id,
            move_to_next: true,
            changes: {
              completed_by: 'dish_selection_ui',
              selections_made: selections.length
            }
          })
        }
      )

      if (completeResponse.ok) {
        // Загружаем следующую задачу
        await fetchNextTask()
      }
    } catch (error) {
      console.error('Error saving selections:', error)
      alert('Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = async () => {
    if (!taskData) return
    
    try {
      setSaving(true)
      // Завершаем без изменений
      const response = await fetch(
        `/api/annotations/tasks/${taskData.recognition.recognition_id}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stage_id: taskData.stage.id,
            move_to_next: true
          })
        }
      )

      if (response.ok) {
        await fetchNextTask()
      }
    } catch (error) {
      console.error('Error skipping:', error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg">Загрузка задачи...</div>
      </div>
    )
  }

  if (!taskData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Нет доступных задач</h2>
          <p className="text-gray-600 mb-6">
            Все задачи выбора блюд {tier && `(Tier ${tier})`} выполнены!
          </p>
          <Button onClick={() => router.push('/annotations/tasks')}>
            ← Вернуться к списку задач
          </Button>
        </Card>
      </div>
    )
  }

  const multipleChoiceDishes = taskData.recognition.correct_dishes
    .map((dish, idx) => ({ ...dish, originalIndex: idx }))
    .filter(d => d.Dishes.length > 1)

  const currentDish = multipleChoiceDishes[currentDishIndex]
  const progress = ((currentDishIndex + 1) / multipleChoiceDishes.length) * 100

  if (saving) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg">Сохранение...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-bold">Выбор правильного блюда</h1>
            <Button variant="outline" size="sm" onClick={() => router.push('/annotations/tasks')}>
              ✕ Выход
            </Button>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Блюдо {currentDishIndex + 1} из {multipleChoiceDishes.length}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-8">
        {currentDish ? (
          <div className="space-y-6">
            {/* Instruction */}
            <Card className="p-4 bg-blue-100 border-blue-300">
              <p className="text-center text-lg font-medium">
                Выберите правильное блюдо или нажмите цифру <span className="font-bold">1-{currentDish.Dishes.length}</span>
              </p>
            </Card>

            {/* Dish Info */}
            <div className="text-center">
              <Badge className="text-lg px-4 py-2">
                Количество: {currentDish.Count}
              </Badge>
            </div>

            {/* Dish Options - Крупные карточки */}
            <div className="grid gap-4">
              {currentDish.Dishes.map((dish, idx) => (
                <Card
                  key={idx}
                  className={`p-6 cursor-pointer transition-all hover:shadow-lg hover:scale-102 ${
                    selectedDishes[currentDishIndex] === idx 
                      ? 'border-4 border-blue-500 bg-blue-50' 
                      : 'border-2 hover:border-blue-300'
                  }`}
                  onClick={() => handleSelectDish(idx)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold">
                          {idx + 1}
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900">
                          {dish.Name}
                        </h3>
                      </div>
                      {dish.ean && (
                        <p className="text-sm text-gray-500 ml-16">
                          EAN: {dish.ean}
                        </p>
                      )}
                    </div>
                    {selectedDishes[currentDishIndex] === idx && (
                      <div className="text-green-600 text-3xl">✓</div>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-4 mt-8">
              <Button
                variant="outline"
                onClick={handleSkip}
                className="flex-1"
                disabled={saving}
              >
                Пропустить (оставить все варианты)
              </Button>
              <Button
                onClick={() => router.push(`/annotations/${taskData.recognition.recognition_id}`)}
                variant="outline"
                className="flex-1"
              >
                Открыть полный редактор
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-600">Нет блюд с множественным выбором</p>
          </div>
        )}
      </div>
    </div>
  )
}

