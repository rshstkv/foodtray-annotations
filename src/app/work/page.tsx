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

  return (
    <RootLayout
      userName={user.full_name || undefined}
      userEmail={user.email}
      isAdmin={isAdmin}
    >
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Рабочая зона валидации
          </h1>
          <p className="text-lg text-gray-600">
            Нажмите кнопку ниже, чтобы начать валидацию
          </p>
        </div>

        {/* Stats */}
        {!loadingStats && stats.length > 0 && (
          <div className="mb-8 max-w-2xl mx-auto">
            <Card className="overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-900">
                  Статистика по типам валидации
                </h2>
              </div>
              <div className="divide-y divide-gray-200">
                {stats.map((stat) => {
                  const remaining = stat.total - stat.completed
                  const progress =
                    stat.total > 0 ? (stat.completed / stat.total) * 100 : 0

                  return (
                    <div key={stat.validation_type} className="px-6 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-900">
                            {VALIDATION_TYPE_LABELS[stat.validation_type]}
                          </span>
                          {stat.in_progress > 0 && (
                            <span className="flex items-center gap-1 text-xs text-orange-600">
                              <Clock className="w-3 h-3" />
                              {stat.in_progress}
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-1 text-sm">
                          <span className="font-semibold text-gray-900">
                            {stat.completed}
                          </span>
                          <span className="text-gray-500">/</span>
                          <span className="text-gray-500">{stat.total}</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        )}

        {/* Start Button */}
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleStartWork}
            disabled={loading}
            className="px-8 py-6 text-lg"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                Загрузка...
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-3" />
                Начать работу
              </>
            )}
          </Button>
        </div>

        {/* Instructions */}
        <div className="mt-12 max-w-2xl mx-auto">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Как работает валидация
            </h3>
            <ol className="space-y-2 text-sm text-gray-600">
              <li className="flex gap-3">
                <span className="flex-none font-medium text-gray-900">1.</span>
                <span>
                  Система автоматически выберет следующий recognition для
                  валидации по приоритетам
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-none font-medium text-gray-900">2.</span>
                <span>
                  Проверьте и отредактируйте items (блюда, тарелки, пейджеры)
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-none font-medium text-gray-900">3.</span>
                <span>
                  Проверьте annotations (bbox) на обеих фотографиях
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-none font-medium text-gray-900">4.</span>
                <span>
                  Нажмите "Завершить" чтобы сохранить и перейти к следующему
                </span>
              </li>
            </ol>
          </Card>
        </div>
      </div>
    </RootLayout>
  )
}

