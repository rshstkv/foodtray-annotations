'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { UserNav } from '@/components/UserNav'

interface Recognition {
  id: number
  recognition_id: string
  recognition_date: string
  status: string
  is_mistake: boolean
  annotator_notes: string | null
  image_count: number
  annotation_count: number
  food_annotation_count: number
  main_count?: number
  qualifying_count?: number
}

export default function AnnotationsListPage() {
  const router = useRouter()
  const [recognitions, setRecognitions] = useState<Recognition[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const observerTarget = useRef<HTMLDivElement>(null)
  
  const [filters, setFilters] = useState({
    status: 'all',
    is_mistake: 'all',
    date_from: '',
    date_to: '',
    main_min: '',
    main_max: '',
    qualifying_min: '',
    qualifying_max: ''
  })

  const fetchRecognitions = async (pageNum: number, append: boolean = false) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: '50'
      })
      
      if (filters.status !== 'all') params.append('status', filters.status)
      if (filters.is_mistake !== 'all') params.append('is_mistake', filters.is_mistake)
      if (filters.date_from) params.append('date_from', filters.date_from)
      if (filters.date_to) params.append('date_to', filters.date_to)
      if (filters.main_min) params.append('main_min', filters.main_min)
      if (filters.main_max) params.append('main_max', filters.main_max)
      if (filters.qualifying_min) params.append('qualifying_min', filters.qualifying_min)
      if (filters.qualifying_max) params.append('qualifying_max', filters.qualifying_max)

      const response = await fetch(`/api/annotations/recognitions?${params}`)
      const result = await response.json()
      
      if (response.ok) {
        if (append) {
          setRecognitions(prev => [...prev, ...result.data])
        } else {
          setRecognitions(result.data)
        }
        setTotal(result.pagination.total)
        setHasMore(pageNum < result.pagination.totalPages)
      }
    } catch (error) {
      console.error('Error fetching recognitions:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  // Сброс при изменении фильтров
  useEffect(() => {
    setPage(1)
    setRecognitions([])
    fetchRecognitions(1, false)
  }, [filters])

  // Бесконечный скролл
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          const nextPage = page + 1
          setPage(nextPage)
          fetchRecognitions(nextPage, true)
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMore, loading, loadingMore, page])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500'
      case 'in_progress': return 'bg-blue-500'
      case 'rejected': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'not_started': return 'Не начато'
      case 'in_progress': return 'В работе'
      case 'completed': return 'Завершено'
      case 'rejected': return 'Отклонено'
      default: return status
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={() => router.push('/')}>
                ← Главная
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Аннотации Bounding Box</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Всего распознаваний: {total}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => router.push('/annotations/tasks')}>
                Задачи →
              </Button>
              <UserNav />
            </div>
          </div>

          {/* Фильтры - компактные */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Статус</label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters({ ...filters, status: value })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="not_started">Не начато</SelectItem>
                  <SelectItem value="in_progress">В работе</SelectItem>
                  <SelectItem value="completed">Завершено</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-32">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Ошибки</label>
              <Select
                value={filters.is_mistake}
                onValueChange={(value) => setFilters({ ...filters, is_mistake: value })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="true">Есть</SelectItem>
                  <SelectItem value="false">Нет</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-36">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Дата от</label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={filters.date_from}
                onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
              />
            </div>

            <div className="w-36">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Дата до</label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={filters.date_to}
                onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
              />
            </div>

            <div className="border-l border-gray-300 h-9 mx-1"></div>

            <div className="flex items-end gap-2">
              <div className="w-20">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Main 45°</label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    placeholder="от"
                    className="h-9 text-sm w-full"
                    value={filters.main_min}
                    onChange={(e) => setFilters({ ...filters, main_min: e.target.value })}
                  />
                </div>
              </div>
              <span className="text-gray-400 pb-2">-</span>
              <div className="w-20">
                <Input
                  type="number"
                  placeholder="до"
                  className="h-9 text-sm w-full mt-5"
                  value={filters.main_max}
                  onChange={(e) => setFilters({ ...filters, main_max: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-end gap-2">
              <div className="w-20">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Qual. 90°</label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    placeholder="от"
                    className="h-9 text-sm w-full"
                    value={filters.qualifying_min}
                    onChange={(e) => setFilters({ ...filters, qualifying_min: e.target.value })}
                  />
                </div>
              </div>
              <span className="text-gray-400 pb-2">-</span>
              <div className="w-20">
                <Input
                  type="number"
                  placeholder="до"
                  className="h-9 text-sm w-full mt-5"
                  value={filters.qualifying_max}
                  onChange={(e) => setFilters({ ...filters, qualifying_max: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* Таблица */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Дата</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Статус</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Ошибка</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Main 45°
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Qual. 90°
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      Загрузка...
                    </td>
                  </tr>
                ) : recognitions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      Нет данных
                    </td>
                  </tr>
                ) : (
                  recognitions.map((rec) => (
                    <tr 
                      key={rec.id} 
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/annotations/${rec.recognition_id}`)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rec.recognition_id}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(rec.recognition_date).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={getStatusColor(rec.status)}>
                          {getStatusLabel(rec.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {rec.is_mistake ? (
                          <Badge className="bg-red-500">Есть</Badge>
                        ) : (
                          <Badge className="bg-gray-400">Нет</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">
                        {rec.main_count ?? 0}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">
                        {rec.qualifying_count ?? 0}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Observer target для бесконечного скролла */}
          <div ref={observerTarget} className="h-20 flex items-center justify-center">
            {loadingMore && (
              <div className="text-sm text-gray-500">Загрузка...</div>
            )}
            {!hasMore && recognitions.length > 0 && (
              <div className="text-sm text-gray-400">Все записи загружены</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

