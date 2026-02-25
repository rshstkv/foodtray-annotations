'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { RootLayout } from '@/components/layouts/RootLayout'
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'
import { Play, Clock, Flag, ChevronLeft, ChevronRight, ExternalLink, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ValidationSession } from '@/types/domain'

interface ReviewerInfo {
  user_id: string
  email?: string
  count: number
  last_completed: string | null
}

interface TestSplitStats {
  total: number
  completed: number
  in_progress: number
  remaining: number
  flagged_items?: number
  reviewers?: ReviewerInfo[]
}

interface CurrentTask {
  work_log_id: number
  recognition_id: number
  started_at: string
}

interface RecognitionListItem {
  recognition_id: number
  status: string
  work_log_id: number | null
  reviewer: string | null
  completed_at: string | null
  flagged_count: number
  flag_comments: string[]
}

interface ListResponse {
  items: RecognitionListItem[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ожидает', color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'В работе', color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Готово', color: 'bg-green-100 text-green-700' },
  abandoned: { label: 'Брошено', color: 'bg-red-100 text-red-600' },
}

export default function TestSplitPage() {
  const router = useRouter()
  const { user, isAdmin } = useUser()
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<TestSplitStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [currentTask, setCurrentTask] = useState<CurrentTask | null>(null)
  const [loadingCurrentTask, setLoadingCurrentTask] = useState(true)

  // List state
  const [listItems, setListItems] = useState<RecognitionListItem[]>([])
  const [listTotal, setListTotal] = useState(0)
  const [listPage, setListPage] = useState(1)
  const [listTotalPages, setListTotalPages] = useState(1)
  const [listLoading, setListLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [flagsOnly, setFlagsOnly] = useState(false)
  const [openingRecId, setOpeningRecId] = useState<number | null>(null)

  useEffect(() => {
    if (user) {
      loadStats()
      loadCurrentTask()
    }
  }, [user])

  useEffect(() => {
    if (user) {
      loadList()
    }
  }, [user, listPage, statusFilter, flagsOnly])

  const loadStats = async () => {
    try {
      setLoadingStats(true)
      const response = await apiFetch<TestSplitStats>('/api/test-split/stats')
      if (response.success && response.data) {
        setStats(response.data)
      }
    } catch (error) {
      console.error('Error loading test split stats:', error)
    } finally {
      setLoadingStats(false)
    }
  }

  const loadCurrentTask = async () => {
    try {
      setLoadingCurrentTask(true)
      const response = await apiFetch<CurrentTask>('/api/test-split/current')
      if (response.success && response.data) {
        setCurrentTask(response.data)
      }
    } catch (error) {
      console.error('Error loading current task:', error)
    } finally {
      setLoadingCurrentTask(false)
    }
  }

  const loadList = useCallback(async () => {
    try {
      setListLoading(true)
      const params = new URLSearchParams()
      params.set('page', String(listPage))
      params.set('per_page', '50')
      if (statusFilter) params.set('status', statusFilter)
      if (flagsOnly) params.set('has_flags', '1')

      const response = await apiFetch<ListResponse>(`/api/test-split/list?${params}`)
      if (response.success && response.data) {
        setListItems(response.data.items)
        setListTotal(response.data.total)
        setListTotalPages(response.data.total_pages)
      }
    } catch (error) {
      console.error('Error loading list:', error)
    } finally {
      setListLoading(false)
    }
  }, [listPage, statusFilter, flagsOnly])

  const handleContinueTask = () => {
    if (currentTask) {
      router.push(`/test-split/${currentTask.work_log_id}`)
    }
  }

  const handleAbandonCurrentTask = async () => {
    if (!currentTask) return
    try {
      setLoading(true)
      await apiFetch('/api/test-split/abandon', {
        method: 'POST',
        body: JSON.stringify({ work_log_id: currentTask.work_log_id }),
      })
      setCurrentTask(null)
      await loadStats()
      await loadList()
    } catch (error) {
      console.error('Error abandoning task:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenRecognition = async (item: RecognitionListItem) => {
    if (openingRecId) return

    // If there's an existing work_log, go directly
    if (item.work_log_id) {
      // For completed/abandoned — reopen via start API with specific recognition_id
      if (item.status === 'completed' || item.status === 'abandoned') {
        try {
          setOpeningRecId(item.recognition_id)
          const response = await apiFetch<{ session: ValidationSession }>('/api/test-split/start', {
            method: 'POST',
            body: JSON.stringify({ recognition_id: item.recognition_id }),
          })
          if (response.success && response.data) {
            router.push(`/test-split/${response.data.session.workLog.id}`)
          }
        } catch (err) {
          console.error('Error reopening:', err)
        } finally {
          setOpeningRecId(null)
        }
        return
      }
      // In progress — go directly
      router.push(`/test-split/${item.work_log_id}`)
      return
    }

    // No work_log — create new session
    try {
      setOpeningRecId(item.recognition_id)
      const response = await apiFetch<{ session: ValidationSession }>('/api/test-split/start', {
        method: 'POST',
        body: JSON.stringify({ recognition_id: item.recognition_id }),
      })
      if (response.success && response.data) {
        router.push(`/test-split/${response.data.session.workLog.id}`)
      }
    } catch (err) {
      console.error('Error starting specific recognition:', err)
    } finally {
      setOpeningRecId(null)
    }
  }

  const handleStartWork = async () => {
    try {
      setLoading(true)
      const response = await apiFetch<{ session: ValidationSession }>('/api/test-split/start', {
        method: 'POST',
        body: JSON.stringify({}),
      })

      if (response.success && response.data) {
        const { session } = response.data
        router.push(`/test-split/${session.workLog.id}`)
      } else {
        alert('Нет доступных задач для проверки тестового сплита')
      }
    } catch (error) {
      console.error('Error starting test split work:', error)
      alert('Ошибка при запуске работы')
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <RootLayout>
        <div className="flex items-center justify-center min-h-[calc(100vh-73px)]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        </div>
      </RootLayout>
    )
  }

  const overallProgress = stats && stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0

  return (
    <RootLayout
      userName={user.full_name || undefined}
      userEmail={user.email}
      isAdmin={isAdmin}
    >
      <div className="min-h-[calc(100vh-73px)] bg-gray-50 flex flex-col items-center py-12 px-6">
        <div className="max-w-4xl w-full">
          {/* Hero + Stats row */}
          <div className="flex flex-col md:flex-row gap-6 mb-8">
            {/* Left: Hero + Actions */}
            <div className="flex-1 min-w-0">
              <h1 className="text-4xl font-semibold text-gray-900 mb-1 tracking-tight">
                Тестовый сплит
              </h1>
              <p className="text-base text-gray-500 mb-6">
                Проверка аннотаций тестовой выборки
              </p>

              {/* Current Task */}
              {currentTask && !loadingCurrentTask && (
                <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-orange-500" />
                    <span className="text-sm text-orange-600 font-medium">
                      Незавершённая: #{currentTask.recognition_id}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleContinueTask}
                      disabled={loading}
                      className="px-5 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-full transition-colors disabled:cursor-not-allowed"
                    >
                      <span className="flex items-center">
                        <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                        Продолжить
                      </span>
                    </button>
                    <button
                      onClick={handleAbandonCurrentTask}
                      disabled={loading}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 text-sm rounded-full transition-colors"
                    >
                      Отказаться
                    </button>
                  </div>
                </div>
              )}

              {/* Start Button */}
              {!currentTask && !loadingCurrentTask && (
                <button
                  onClick={handleStartWork}
                  disabled={loading}
                  className="px-8 py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-full transition-colors shadow-md disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                      Загружается...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <Play className="w-4 h-4 mr-1.5 fill-current" />
                      Начать проверку
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Right: Stats card */}
            {!loadingStats && stats && (
              <div className="bg-white rounded-2xl shadow-sm p-6 w-full md:w-72 flex-shrink-0">
                <div className="text-center mb-3">
                  <div className="text-4xl font-semibold text-gray-900">
                    {stats.completed}
                  </div>
                  <div className="text-sm text-gray-500">
                    из {stats.total} проверено
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-500">
                  {stats.in_progress > 0 && (
                    <span className="px-2 py-0.5 bg-blue-50 rounded-full text-blue-600">
                      В работе: {stats.in_progress}
                    </span>
                  )}
                  {stats.remaining > 0 && (
                    <span className="px-2 py-0.5 bg-gray-50 rounded-full">
                      Ожидает: {stats.remaining}
                    </span>
                  )}
                  {(stats.flagged_items || 0) > 0 && (
                    <span className="px-2 py-0.5 bg-orange-50 rounded-full text-orange-600">
                      <Flag className="w-3 h-3 inline mr-0.5" />
                      {stats.flagged_items}
                    </span>
                  )}
                </div>
                {stats.reviewers && stats.reviewers.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                    {stats.reviewers.map((r) => (
                      <div key={r.user_id} className="flex justify-between text-xs">
                        <span className="text-gray-600 truncate mr-2">{r.email}</span>
                        <span className="text-gray-400 font-medium flex-shrink-0">{r.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recognition list */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* Filters */}
            <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Фильтры:</span>
              <div className="flex gap-1.5">
                {[
                  { value: '', label: 'Все' },
                  { value: 'pending', label: 'Ожидает' },
                  { value: 'in_progress', label: 'В работе' },
                  { value: 'completed', label: 'Готово' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setStatusFilter(opt.value); setListPage(1) }}
                    className={cn(
                      'px-3 py-1 text-xs rounded-full transition-colors',
                      statusFilter === opt.value
                        ? 'bg-purple-100 text-purple-700 font-medium'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setFlagsOnly(!flagsOnly); setListPage(1) }}
                className={cn(
                  'px-3 py-1 text-xs rounded-full transition-colors flex items-center gap-1',
                  flagsOnly
                    ? 'bg-orange-100 text-orange-700 font-medium'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                <Flag className="w-3 h-3" />
                С вопросами
              </button>
              <span className="ml-auto text-xs text-gray-400">{listTotal} записей</span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-2.5 font-medium">ID</th>
                    <th className="px-3 py-2.5 font-medium">Статус</th>
                    <th className="px-3 py-2.5 font-medium">Проверил</th>
                    <th className="px-3 py-2.5 font-medium">Завершено</th>
                    <th className="px-3 py-2.5 font-medium text-center">
                      <Flag className="w-3 h-3 inline" />
                    </th>
                    <th className="px-3 py-2.5 font-medium">Комментарии</th>
                    <th className="px-3 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {listLoading ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500 mx-auto" />
                      </td>
                    </tr>
                  ) : listItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                        Нет записей
                      </td>
                    </tr>
                  ) : (
                    listItems.map((item) => {
                      const st = STATUS_LABELS[item.status] || STATUS_LABELS.pending
                      const isOpening = openingRecId === item.recognition_id
                      return (
                        <tr
                          key={item.recognition_id}
                          onClick={() => handleOpenRecognition(item)}
                          className={cn(
                            'border-b border-gray-50 hover:bg-purple-50/50 transition-colors cursor-pointer',
                            item.flagged_count > 0 && 'bg-orange-50/30',
                            isOpening && 'opacity-50'
                          )}
                        >
                          <td className="px-5 py-2.5 font-mono text-gray-700">
                            <div className="flex items-center gap-2">
                              {isOpening && (
                                <div className="animate-spin rounded-full h-3 w-3 border-2 border-purple-500 border-t-transparent" />
                              )}
                              {item.recognition_id}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', st.color)}>
                              {st.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 text-xs">
                            {item.reviewer || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs">
                            {item.completed_at
                              ? new Date(item.completed_at).toLocaleDateString('ru-RU', {
                                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                                })
                              : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {item.flagged_count > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-xs text-orange-600 font-medium">
                                <Flag className="w-3 h-3" />
                                {item.flagged_count}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[200px]">
                            {item.flag_comments.length > 0 && (
                              <div className="flex items-start gap-1">
                                <MessageSquare className="w-3 h-3 mt-0.5 text-gray-400 flex-shrink-0" />
                                <span className="truncate" title={item.flag_comments.join('; ')}>
                                  {item.flag_comments.join('; ')}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-purple-500" />
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {listTotalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Стр. {listPage} из {listTotalPages}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setListPage(p => Math.max(1, p - 1))}
                    disabled={listPage <= 1}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setListPage(p => Math.min(listTotalPages, p + 1))}
                    disabled={listPage >= listTotalPages}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </RootLayout>
  )
}
