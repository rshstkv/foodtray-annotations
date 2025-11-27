'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@/hooks/useUser'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api-response'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { ExportFilters } from '@/components/admin/ExportFilters'
import { RecognitionsTable } from '@/components/admin/RecognitionsTable'
import { RecognitionPreviewModal } from '@/components/admin/RecognitionPreviewModal'
import { IntegrityCheckDialog } from '@/components/admin/IntegrityCheckDialog'
import type {
  RecognitionWithValidations,
  ValidationType,
  ExportPreviewData,
} from '@/types/domain'

interface User {
  id: string
  email: string
  full_name: string | null
}

export default function AdminExportPage() {
  const { user, isAdmin } = useUser()
  const { toast } = useToast()

  // Users
  const [users, setUsers] = useState<User[]>([])

  // Filters
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [validationStepFilters, setValidationStepFilters] = useState<Map<ValidationType, { enabled: boolean; status: 'any' | 'completed' | 'skipped' }>>(
    new Map([
      ['FOOD_VALIDATION', { enabled: false, status: 'completed' }],
      ['PLATE_VALIDATION', { enabled: false, status: 'completed' }],
      ['BUZZER_VALIDATION', { enabled: false, status: 'completed' }],
      ['OCCLUSION_VALIDATION', { enabled: false, status: 'completed' }],
      ['BOTTLE_ORIENTATION_VALIDATION', { enabled: false, status: 'completed' }],
    ])
  )

  // Data
  const [recognitions, setRecognitions] = useState<RecognitionWithValidations[]>([])
  const [previewData, setPreviewData] = useState<ExportPreviewData | null>(null)
  const [selectedRecognitionIds, setSelectedRecognitionIds] = useState<Set<number>>(new Set())

  // UI State
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewRecognitionId, setPreviewRecognitionId] = useState<number | null>(null)
  const [integrityCheckOpen, setIntegrityCheckOpen] = useState(false)
  
  // Search & Pagination
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50

  useEffect(() => {
    if (isAdmin) {
      loadUsers()
      loadRecognitions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  // Reload data when page changes (but not on initial mount)
  useEffect(() => {
    if (previewData && currentPage > 0) {
      applyFilters()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage])

  const loadUsers = async () => {
    try {
      const response = await apiFetch<{ users: User[] }>('/api/admin/users')
      if (response.success && response.data) {
        setUsers(response.data.users || [])
      }
    } catch (err) {
      console.error('Error loading users:', err)
    }
  }

  const loadRecognitions = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (selectedUserIds.size > 0) {
        params.append('userId', Array.from(selectedUserIds)[0])
      }

      const url = `/api/admin/completed-validations${params.toString() ? '?' + params.toString() : ''}`
      const response = await apiFetch<{ recognitions: RecognitionWithValidations[] }>(url)
      
      if (response.success && response.data) {
        setRecognitions(response.data.recognitions || [])
      }
    } catch (err) {
      console.error('Error loading recognitions:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleValidationStepFilterChange = (type: ValidationType, filter: { enabled: boolean; status: 'any' | 'completed' | 'skipped' }) => {
    setValidationStepFilters(prev => {
      const newMap = new Map(prev)
      newMap.set(type, filter)
      return newMap
    })
  }

  const applyFilters = async (resetPage = false) => {
    if (recognitions.length === 0) {
      toast({
        title: 'Нет данных',
        description: 'Сначала загрузите recognitions',
        variant: 'destructive',
      })
      return
    }

    // Reset to page 1 when applying new filters
    if (resetPage) {
      setCurrentPage(1)
    }

    // Просто берем все recognitions (фильтрация будет на бэкенде через API preview)
    const recognitionIds = recognitions.map(r => r.recognition_id)

    if (recognitionIds.length === 0) {
      toast({
        title: 'Нет данных',
        description: 'Фильтры не вернули результатов',
      })
      setPreviewData(null)
      return
    }

    // Load preview data
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (selectedUserIds.size > 0) {
        params.append('userIds', Array.from(selectedUserIds).join(','))
      }
      
      // Передаем статусы этапов (только enabled)
      for (const [type, filter] of validationStepFilters.entries()) {
        if (filter.enabled) {
          params.append(`step_${type}`, filter.status)
        }
      }

      // Добавляем поиск и пагинацию
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim())
      }
      params.append('page', currentPage.toString())
      params.append('pageSize', pageSize.toString())

      const url = `/api/admin/export-preview?${params.toString()}`
      console.log('[export] Loading preview from:', url)
      
      const response = await fetch(url)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('[export] Preview API error:', response.status, errorText)
        throw new Error(`Preview failed: ${response.status}`)
      }

      const data: ExportPreviewData = await response.json()
      console.log('[export] Preview loaded:', data.pagination.totalItems, 'recognitions total')
      
      setPreviewData(data)
      setSelectedRecognitionIds(new Set(data.recognitions.map(r => r.recognition_id)))

      if (data.pagination.totalItems === 0) {
        toast({
          title: 'Нет данных',
          description: 'Фильтры не вернули результатов. Попробуйте изменить условия фильтрации.',
        })
      } else {
        toast({
          title: 'Фильтры применены',
          description: `Найдено ${data.pagination.totalItems} recognitions`,
        })
      }
    } catch (err) {
      console.error('[export] Error loading preview:', err)
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка'
      toast({
        title: 'Ошибка загрузки данных',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (!previewData || previewData.pagination.totalItems === 0) {
      toast({
        title: 'Ошибка',
        description: 'Нет данных для экспорта. Примените фильтры.',
        variant: 'destructive',
      })
      return
    }

    try {
      setExporting(true)
      
      // Собираем параметры фильтров (те же что и для preview)
      const params = new URLSearchParams()
      
      if (selectedUserIds.size > 0) {
        params.append('userIds', Array.from(selectedUserIds).join(','))
      }
      
      // Добавляем статусы этапов
      for (const [type, filter] of validationStepFilters.entries()) {
        if (filter.enabled) {
          params.append(`step_${type}`, filter.status)
        }
      }
      
      // Поиск (если был)
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim())
      }

      const url = `/api/admin/export?${params.toString()}`
      console.log('[export] Exporting with filters:', url)
      
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Export failed')
      }
      
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `annotations_export_${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(downloadUrl)
      document.body.removeChild(a)

      toast({
        title: 'Успешно',
        description: `Экспортировано ${previewData.pagination.totalItems} recognitions`,
      })
    } catch (err) {
      console.error('Error exporting:', err)
      toast({
        title: 'Ошибка',
        description: 'Не удалось экспортировать данные',
        variant: 'destructive',
      })
    } finally {
      setExporting(false)
    }
  }

  const handlePreview = (recognitionId: number) => {
    setPreviewRecognitionId(recognitionId)
    setPreviewModalOpen(true)
  }


  if (!user) {
    return <div>Loading...</div>
  }

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">Доступ запрещен. Требуются права администратора.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Экспорт данных</h1>
        <p className="text-gray-600 text-base mb-4">
          Экспорт валидированных аннотаций для обучения ML моделей
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
          <h3 className="font-semibold text-gray-900 mb-2">Как использовать:</h3>
          <ol className="space-y-1 text-gray-700 list-decimal list-inside">
            <li>Выберите пользователей, чьи данные нужно включить</li>
            <li>Для каждого этапа укажите статус: Любой / Завершен / Пропущен</li>
            <li>Нажмите "Применить фильтры" - увидите количество recognitions и статистику</li>
            <li>Скачайте JSON с полными метаданными</li>
          </ol>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <ExportFilters
          users={users}
          selectedUserIds={selectedUserIds}
          onUserIdsChange={setSelectedUserIds}
          validationStepFilters={validationStepFilters}
          onValidationStepFilterChange={handleValidationStepFilterChange}
          onApply={() => applyFilters(true)}
          loading={loading}
          previewCount={previewData?.pagination.totalItems}
        />
      </div>

      {/* Search Bar */}
      {previewData && (
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Поиск по Recognition ID..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1) // Reset to first page on search
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  applyFilters()
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="text-sm text-gray-600">
            Показано {previewData.recognitions.length} из {previewData.pagination.totalItems}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="space-y-6">
        {/* Export Actions - Sticky */}
        {previewData && previewData.recognitions.length > 0 && (
          <div className="sticky top-0 z-10 bg-gray-50 pb-4">
            <div className="flex items-center justify-between p-4 bg-white border rounded-xl shadow-lg">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-sm text-gray-600">Всего записей:</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {previewData.pagination.totalItems}
                  </p>
                </div>
                <div className="h-12 w-px bg-gray-200" />
                <div>
                  <p className="text-sm text-gray-600">Items:</p>
                  <p className="text-xl font-semibold text-blue-600">
                    {Object.values(previewData.stats.total_items).reduce((a, b) => a + b, 0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Annotations:</p>
                  <p className="text-xl font-semibold text-gray-700">
                    {previewData.stats.total_annotations}
                  </p>
                </div>
                {previewData.stats.modified_annotations > 0 && (
                  <>
                    <div className="h-12 w-px bg-gray-200" />
                    <div>
                      <p className="text-sm text-green-600">С правками:</p>
                      <p className="text-xl font-semibold text-green-600">
                        {previewData.stats.modified_annotations}
                      </p>
                    </div>
                  </>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setIntegrityCheckOpen(true)}
                  disabled={exporting}
                  variant="outline"
                >
                  Проверить целостность
                </Button>
                <Button
                  onClick={handleExport}
                  disabled={exporting || selectedRecognitionIds.size === 0}
                  className="bg-green-600 hover:bg-green-700 h-12 px-8 text-base font-semibold"
                >
                  <Download className="w-5 h-5 mr-2" />
                  {exporting ? 'Экспорт...' : `Скачать все (${previewData.pagination.totalItems})`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <RecognitionsTable
          data={previewData}
          selectedIds={selectedRecognitionIds}
          onSelectionChange={setSelectedRecognitionIds}
          onPreview={handlePreview}
        />

        {/* Pagination */}
        {previewData && previewData.pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <Button
              variant="outline"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || loading}
            >
              ← Назад
            </Button>
            
            <div className="flex items-center gap-2">
              {Array.from({ length: Math.min(5, previewData.pagination.totalPages) }, (_, i) => {
                let pageNum
                if (previewData.pagination.totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= previewData.pagination.totalPages - 2) {
                  pageNum = previewData.pagination.totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'outline'}
                    onClick={() => setCurrentPage(pageNum)}
                    disabled={loading}
                    className="w-10 h-10 p-0"
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>
            
            <Button
              variant="outline"
              onClick={() => setCurrentPage(prev => Math.min(previewData.pagination.totalPages, prev + 1))}
              disabled={currentPage === previewData.pagination.totalPages || loading}
            >
              Вперед →
            </Button>
            
            <span className="text-sm text-gray-600 ml-4">
              Страница {currentPage} из {previewData.pagination.totalPages}
            </span>
          </div>
        )}
      </div>

      {/* Modals */}
      <RecognitionPreviewModal
        recognitionId={previewRecognitionId}
        open={previewModalOpen}
        onClose={() => {
          setPreviewModalOpen(false)
          setPreviewRecognitionId(null)
        }}
      />

      <IntegrityCheckDialog
        open={integrityCheckOpen}
        onClose={() => setIntegrityCheckOpen(false)}
        recognitionIds={Array.from(selectedRecognitionIds)}
      />
    </div>
  )
}

