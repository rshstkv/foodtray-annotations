'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RootLayout } from '@/components/layouts/RootLayout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'
import { Play, Clock } from 'lucide-react'
import type { StartValidationResponse, ValidationType } from '@/types/domain'
import { VALIDATION_TYPE_LABELS } from '@/types/domain'

interface ValidationStats {
  validation_type: ValidationType
  total: number
  completed: number
  in_progress: number
}

export default function WorkPage() {
  const router = useRouter()
  const { user, isAdmin } = useUser()
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<ValidationStats[]>([])
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    if (user) {
      loadStats()
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

  const handleStartWork = async () => {
    try {
      setLoading(true)
      const response = await apiFetch<StartValidationResponse>(
        '/api/validation/start',
        {
          method: 'POST',
        }
      )

      if (response.success && response.data) {
        const { workLog } = response.data
        router.push(`/work/${workLog.id}`)
      } else {
        // Нет доступных задач
        alert('Нет доступных задач для валидации')
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
  const totalRemaining = totalAvailable - totalCompleted
  const overallProgress = totalAvailable > 0 ? Math.round((totalCompleted / totalAvailable) * 100) : 0

  return (
    <RootLayout
      userName={user.full_name || undefined}
      userEmail={user.email}
      isAdmin={isAdmin}
    >
      <div className="h-[calc(100vh-73px)] bg-gray-50 flex flex-col items-center justify-center px-6">
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
                {totalRemaining > 0 && (
                  <p className="text-xs text-gray-500">
                    Осталось: {totalRemaining}
                  </p>
                )}
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

          {/* Main CTA Button */}
          <div className="flex justify-center">
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
          <p className="text-center text-xs text-gray-400 mt-4">
            Система автоматически выберет следующую задачу
          </p>
        </div>
      </div>
    </RootLayout>
  )
}

