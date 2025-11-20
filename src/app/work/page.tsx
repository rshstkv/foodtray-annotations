'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RootLayout } from '@/components/layouts/RootLayout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'
import { Play, Clock } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { StartValidationResponse, ValidationType, PriorityFilterType } from '@/types/domain'
import { VALIDATION_TYPE_LABELS } from '@/types/domain'

interface ValidationStats {
  validation_type: ValidationType
  total: number
  completed: number
  in_progress: number
}

interface CurrentTask {
  work_log_id: number
  recognition_id: number
  validation_type: ValidationType
  validation_steps: any[]
  current_step_index: number
  started_at: string
  updated_at: string
}

interface ProblemStats {
  unresolved_ambiguity: number
  food_annotation_mismatch: number
  plate_annotation_mismatch: number
  total_with_issues: number
}

export default function WorkPage() {
  const router = useRouter()
  const { user, isAdmin } = useUser()
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<ValidationStats[]>([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [currentTask, setCurrentTask] = useState<CurrentTask | null>(null)
  const [loadingCurrentTask, setLoadingCurrentTask] = useState(true)
  const [selectedFilter, setSelectedFilter] = useState<PriorityFilterType>('any')
  const [problemStats, setProblemStats] = useState<ProblemStats | null>(null)
  const [loadingProblemStats, setLoadingProblemStats] = useState(true)

  useEffect(() => {
    if (user) {
      loadStats()
      loadCurrentTask()
      loadProblemStats()
    }
  }, [user])

  const loadStats = async () => {
    try {
      setLoadingStats(true)
      const response = await apiFetch<{ stats: ValidationStats[] }>(
        '/api/validation/stats'
      )
      if (response.success && response.data) {
        setStats(response.data.stats || [])
      }
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoadingStats(false)
    }
  }

  const loadCurrentTask = async () => {
    try {
      setLoadingCurrentTask(true)
      const response = await apiFetch<CurrentTask | null>(
        '/api/validation/current'
      )
      if (response.success) {
        setCurrentTask(response.data)
      }
    } catch (error) {
      console.error('Error loading current task:', error)
    } finally {
      setLoadingCurrentTask(false)
    }
  }

  const loadProblemStats = async () => {
    try {
      setLoadingProblemStats(true)
      const response = await apiFetch<ProblemStats>(
        '/api/validation/problem-stats'
      )
      if (response.success && response.data) {
        setProblemStats(response.data)
      }
    } catch (error) {
      console.error('Error loading problem stats:', error)
    } finally {
      setLoadingProblemStats(false)
    }
  }

  const handleContinueTask = () => {
    if (currentTask) {
      router.push(`/work/${currentTask.work_log_id}`)
    }
  }

  const handleAbandonCurrentTask = async () => {
    if (!currentTask) return

    if (!confirm(`Отказаться от Recognition #${currentTask.recognition_id}?\n\nЗадача вернется в общую очередь.`)) {
      return
    }

    try {
      setLoading(true)
      await apiFetch('/api/validation/abandon', {
        method: 'POST',
        body: JSON.stringify({ work_log_id: currentTask.work_log_id }),
      })
      
      // Обновить список задач
      setCurrentTask(null)
      loadStats()
    } catch (error) {
      console.error('Error abandoning task:', error)
      alert('Ошибка при отказе от задачи')
    } finally {
      setLoading(false)
    }
  }

  const handleStartWork = async () => {
    try {
      setLoading(true)
      
      const response = await apiFetch<StartValidationResponse>(
        '/api/validation/start',
        {
          method: 'POST',
          body: JSON.stringify({ priority_filter: selectedFilter }),
        }
      )

      if (response.success && response.data) {
        const { workLog } = response.data
        router.push(`/work/${workLog.id}`)
      } else {
        // Нет доступных задач
        const filterLabels: Record<PriorityFilterType, string> = {
          'any': 'задач для валидации',
          'unresolved_ambiguity': 'задач с неопределенностью',
          'food_annotation_mismatch': 'задач с несоответствием аннотаций в блюдах',
          'plate_annotation_mismatch': 'задач с несоответствием аннотаций в тарелках',
          'annotation_mismatch': 'задач с несоответствием аннотаций',
          'has_ambiguity': 'задач',
          'clean_ambiguity': 'задач',
          'has_food_items': 'задач',
          'has_plates': 'задач',
          'has_buzzers': 'задач',
          'no_annotations': 'задач'
        }
        
        const filterLabel = filterLabels[selectedFilter] || 'задач'
        
        if (totalInProgress > 0) {
          alert(`Нет доступных ${filterLabel}.\n\nВсе свободные задачи сейчас в работе (${totalInProgress}). Попробуйте через несколько минут.`)
        } else if (totalRemaining === 0) {
          alert('Все задачи выполнены! 🎉')
        } else {
          alert(`Нет доступных ${filterLabel}`)
        }
      }
    } catch (error) {
      console.error('Error starting work:', error)
      alert('Ошибка при запуске работы')
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <RootLayout>
        <div className="flex items-center justify-center min-h-[calc(100vh-73px)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Загрузка...</p>
          </div>
        </div>
      </RootLayout>
    )
  }

  // Подсчет общей статистики
  const totalAvailable = stats.reduce((sum, s) => sum + s.total, 0)
  const totalCompleted = stats.reduce((sum, s) => sum + s.completed, 0)
  const totalInProgress = stats.reduce((sum, s) => sum + s.in_progress, 0)
  const totalRemaining = totalAvailable - totalCompleted - totalInProgress
  const overallProgress = totalAvailable > 0 ? Math.round((totalCompleted / totalAvailable) * 100) : 0

  return (
    <RootLayout
      userName={user.full_name || undefined}
      userEmail={user.email}
      isAdmin={isAdmin}
    >
      <div className="min-h-[calc(100vh-73px)] bg-gray-50 flex flex-col items-center py-12 px-6">
        <div className="max-w-xl w-full">
          {/* Hero Section */}
          <div className="text-center mb-8">
            <h1 className="text-5xl font-semibold text-gray-900 mb-2 tracking-tight">
              Валидация
            </h1>
            <p className="text-lg text-gray-500">
              Проверка и редактирование аннотаций
            </p>
          </div>

          {/* Stats - Large Overview */}
          {!loadingStats && stats.length > 0 && (
            <div className="bg-white rounded-3xl shadow-sm p-8 mb-6">
              {/* Total Progress */}
              <div className="text-center mb-6">
                <div className="text-6xl font-semibold text-gray-900 mb-1">
                  {totalCompleted}
                </div>
                <div className="text-base text-gray-500 mb-4">
                  из {totalAvailable} выполнено
                </div>
                {/* Progress Bar */}
                <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
                  {totalInProgress > 0 && (
                    <span className="flex items-center gap-1.5 px-2 py-1 bg-orange-50 rounded-full text-orange-600">
                      <Clock className="w-3 h-3" />
                      В работе: {totalInProgress}
                    </span>
                  )}
                  {totalRemaining > 0 && (
                    <span>
                      Доступно: {totalRemaining}
                    </span>
                  )}
                  {totalRemaining === 0 && totalInProgress === 0 && (
                    <span className="text-green-600">
                      ✓ Все задачи выполнены
                    </span>
                  )}
                  {totalRemaining === 0 && totalInProgress > 0 && (
                    <span className="text-gray-500">
                      Все задачи в работе или выполнены
                    </span>
                  )}
                </div>
              </div>

              {/* Detailed Stats */}
              <div className="space-y-2">
                {stats.map((stat) => {
                  const progress = stat.total > 0 ? (stat.completed / stat.total) * 100 : 0
                  return (
                    <div key={stat.validation_type} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">
                          {VALIDATION_TYPE_LABELS[stat.validation_type]}
                        </span>
                        {stat.in_progress > 0 && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-50 rounded-full text-[10px] text-orange-600">
                            <Clock className="w-2.5 h-2.5" />
                            {stat.in_progress}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {stat.completed}/{stat.total}
                        </span>
                        <div className="w-12 bg-gray-100 rounded-full h-1">
                          <div
                            className="bg-blue-500 h-1 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Current Task - Continue or Abandon */}
          {currentTask && !loadingCurrentTask && (
            <div className="bg-white rounded-3xl shadow-sm p-6 mb-6">
              <div className="text-center mb-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-50 rounded-full text-sm text-orange-600 mb-2">
                  <Clock className="w-4 h-4" />
                  У вас есть незавершенная задача
                </div>
                <div className="text-lg font-medium text-gray-900">
                  Recognition #{currentTask.recognition_id}
                </div>
                <div className="text-sm text-gray-500">
                  {VALIDATION_TYPE_LABELS[currentTask.validation_type]}
                  {' • '}
                  Шаг {currentTask.current_step_index + 1} из {currentTask.validation_steps.length}
                </div>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleContinueTask}
                  disabled={loading}
                  className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-full transition-all duration-200 shadow-lg hover:shadow-xl disabled:cursor-not-allowed"
                >
                  <span className="flex items-center">
                    <Play className="w-4 h-4 mr-2 fill-current" />
                    Продолжить работу
                  </span>
                </button>
                <button
                  onClick={handleAbandonCurrentTask}
                  disabled={loading}
                  className="px-6 py-3 bg-white hover:bg-gray-50 disabled:bg-gray-100 text-gray-700 text-sm font-medium rounded-full border border-gray-200 transition-all duration-200 disabled:cursor-not-allowed"
                >
                  Отказаться от задачи
                </button>
              </div>
            </div>
          )}


          {/* Main CTA Button with Filter Dropdown - only if no current task */}
          {!currentTask && !loadingCurrentTask && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-4">
                {/* Filter Dropdown */}
                {!loadingProblemStats && problemStats && (
                  <div className="bg-white rounded-full shadow-sm px-4 py-2">
                    <Select value={selectedFilter} onValueChange={(value) => setSelectedFilter(value as PriorityFilterType)}>
                      <SelectTrigger className="w-[280px] border-0 focus:ring-0 h-auto py-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">
                          <div className="flex items-center justify-between w-full">
                            <span>Все задачи</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="unresolved_ambiguity">
                          <div className="flex items-center justify-between w-full">
                            <span>Неопределенность</span>
                            <span className="ml-4 text-xs text-yellow-600 font-semibold bg-yellow-50 px-2 py-0.5 rounded-full">
                              {problemStats.unresolved_ambiguity}
                            </span>
                          </div>
                        </SelectItem>
                        <SelectItem value="food_annotation_mismatch">
                          <div className="flex items-center justify-between w-full">
                            <span>Несоответствие: блюда</span>
                            <span className="ml-4 text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-full">
                              {problemStats.food_annotation_mismatch}
                            </span>
                          </div>
                        </SelectItem>
                        <SelectItem value="plate_annotation_mismatch">
                          <div className="flex items-center justify-between w-full">
                            <span>Несоответствие: тарелки</span>
                            <span className="ml-4 text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-full">
                              {problemStats.plate_annotation_mismatch}
                            </span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Start Work Button */}
                <button
                  onClick={handleStartWork}
                  disabled={loading}
                  className="group relative px-10 py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white text-base font-medium rounded-full transition-all duration-200 shadow-lg hover:shadow-xl disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                      Загружается...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <Play className="w-4 h-4 mr-2 fill-current" />
                      Начать работу
                    </span>
                  )}
                </button>
              </div>
              
              {/* Subtle hint */}
              <p className="text-center text-xs text-gray-400">
                Система автоматически выберет следующую задачу
              </p>
            </div>
          )}
        </div>
      </div>
    </RootLayout>
  )
}

