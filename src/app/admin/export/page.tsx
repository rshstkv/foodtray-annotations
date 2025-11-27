'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@/hooks/useUser'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api-response'
import { ExportFilters } from '@/components/admin/ExportFilters'
import { ExportStatsPanel } from '@/components/admin/ExportStatsPanel'
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

  useEffect(() => {
    if (isAdmin) {
      loadUsers()
      loadRecognitions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

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

  const applyFilters = async () => {
    if (recognitions.length === 0) {
      toast({
        title: 'Нет данных',
        description: 'Сначала загрузите recognitions',
        variant: 'destructive',
      })
      return
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
      params.append('recognitionIds', recognitionIds.join(','))
      
      if (selectedUserIds.size > 0) {
        params.append('userIds', Array.from(selectedUserIds).join(','))
      }
      
      // Передаем статусы этапов (только enabled)
      for (const [type, filter] of validationStepFilters.entries()) {
        if (filter.enabled) {
          params.append(`step_${type}`, filter.status)
        }
      }

      const url = `/api/admin/export-preview?${params.toString()}`
      console.log('[export] Loading preview from:', url)
      
      const response = await fetch(url)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('[export] Preview API error:', response.status, errorText)
        throw new Error(`Preview failed: ${response.status}`)
      }

      const data: ExportPreviewData = await response.json()
      console.log('[export] Preview loaded:', data.stats.total_recognitions, 'recognitions')
      
      setPreviewData(data)
      setSelectedRecognitionIds(new Set(data.recognitions.map(r => r.recognition_id)))

      if (data.recognitions.length === 0) {
        toast({
          title: 'Нет данных',
          description: 'Фильтры не вернули результатов. Попробуйте изменить условия фильтрации.',
        })
      } else {
        toast({
          title: 'Фильтры применены',
          description: `Найдено ${data.recognitions.length} recognitions`,
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
    if (selectedRecognitionIds.size === 0) {
      toast({
        title: 'Ошибка',
        description: 'Выберите хотя бы один recognition для экспорта',
        variant: 'destructive',
      })
      return
    }

    try {
      setExporting(true)
      const ids = Array.from(selectedRecognitionIds).join(',')
      const url = `/api/admin/export?recognitionIds=${ids}`
      
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
        description: `Экспортировано ${selectedRecognitionIds.size} recognitions`,
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

  const handleExcludeUser = (userId: string) => {
    const newSet = new Set(selectedUserIds)
    if (newSet.has(userId)) {
      newSet.delete(userId)
    } else {
      newSet.add(userId)
    }
    setSelectedUserIds(newSet)
    
    toast({
      title: 'Фильтр обновлен',
      description: 'Примените фильтры заново для обновления данных',
    })
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
          onApply={applyFilters}
          loading={loading}
          previewCount={previewData?.stats.total_recognitions}
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table - 2 columns */}
        <div className="lg:col-span-2">
          <RecognitionsTable
            data={previewData}
            selectedIds={selectedRecognitionIds}
            onSelectionChange={setSelectedRecognitionIds}
            onPreview={handlePreview}
          />
        </div>

        {/* Stats Panel - 1 column */}
        <div className="lg:col-span-1">
          <ExportStatsPanel
            stats={previewData?.stats || null}
            selectedCount={selectedRecognitionIds.size}
            onExport={handleExport}
            onVerifyIntegrity={() => setIntegrityCheckOpen(true)}
            exporting={exporting}
            onExcludeUser={handleExcludeUser}
          />
        </div>
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

