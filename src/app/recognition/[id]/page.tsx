'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WorkLayout } from '@/components/layouts/WorkLayout'
import { ItemsList } from '@/components/validation/ItemsList'
import { ImageGrid } from '@/components/validation/ImageGrid'
import { ValidationSessionProvider } from '@/contexts/ValidationSessionContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'
import { ArrowLeft } from 'lucide-react'
import type { 
  ValidationSession, 
  ValidationType,
} from '@/types/domain'
import { VALIDATION_TYPE_LABELS } from '@/types/domain'
import { cn } from '@/lib/utils'

interface RecognitionData {
  recognition_id: number
  batch_id: string | null
  sessions: ValidationSession[]
}

function RecognitionViewContentInner({ 
  recognitionData,
  activeSessionIndex,
  setActiveSessionIndex,
}: { 
  recognitionData: RecognitionData
  activeSessionIndex: number
  setActiveSessionIndex: (index: number) => void
}) {
  const router = useRouter()
  const activeSession = recognitionData.sessions[activeSessionIndex]

  // Горячие клавиши для навигации между валидациями
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Игнорируем, если фокус на input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return
      }

      const sessionsCount = recognitionData.sessions.length

      // Цифры 1-9 - переключиться на валидацию по индексу
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1
        if (index < sessionsCount) {
          setActiveSessionIndex(index)
        }
        return
      }

      // Стрелки влево/вправо - двигаться между валидациями
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const newIndex = activeSessionIndex > 0 ? activeSessionIndex - 1 : sessionsCount - 1
        setActiveSessionIndex(newIndex)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const newIndex = activeSessionIndex < sessionsCount - 1 ? activeSessionIndex + 1 : 0
        setActiveSessionIndex(newIndex)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeSessionIndex, recognitionData.sessions.length, setActiveSessionIndex])

  if (!activeSession) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Нет доступных валидаций</p>
        </div>
      </div>
    )
  }

  return (
    <WorkLayout
      header={
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Recognition #{recognitionData.recognition_id}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Просмотр завершенных валидаций
              </p>
            </div>
            <span className="px-3 py-1 bg-gray-100 border border-gray-300 rounded text-sm font-medium text-gray-700">
              Режим просмотра
            </span>
          </div>

          {/* Табы для переключения между валидациями */}
          <div className="flex items-center gap-2 overflow-x-auto">
            {recognitionData.sessions.map((session, index) => {
              const hotkey = index < 9 ? (index + 1).toString() : null
              return (
                <button
                  key={session.workLog.id}
                  onClick={() => setActiveSessionIndex(index)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap relative',
                    activeSessionIndex === index
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  {VALIDATION_TYPE_LABELS[session.workLog.validation_type]}
                  {hotkey && (
                    <kbd className={cn(
                      'ml-2 px-1.5 py-0.5 text-xs font-semibold rounded border',
                      activeSessionIndex === index
                        ? 'bg-white/20 border-white/30'
                        : 'bg-gray-200 border-gray-300'
                    )}>
                      {hotkey}
                    </kbd>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      }
      sidebar={
        <ItemsList
          items={activeSession.items}
          annotations={activeSession.annotations}
          validationType={activeSession.workLog.validation_type}
          selectedItemId={null}
          recipeLineOptions={activeSession.recipeLineOptions}
          onItemSelect={() => {}}
          onItemCreate={() => {}}
          onItemDelete={() => {}}
          onItemUpdate={() => {}}
          readOnly={true}
        />
      }
      images={
        <div className="p-4 h-full flex flex-col min-h-0">
          <ImageGrid
            images={activeSession.images}
            annotations={activeSession.annotations}
            items={activeSession.items}
            recipeLineOptions={activeSession.recipeLineOptions}
            selectedItemId={null}
            selectedAnnotationId={null}
            validationType={activeSession.workLog.validation_type}
            mode="view"
            onAnnotationCreate={() => {}}
            onAnnotationUpdate={() => {}}
            onAnnotationSelect={() => {}}
            onAnnotationDelete={() => {}}
            onAnnotationToggleOcclusion={() => {}}
          />
        </div>
      }
      actions={
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={() => router.push('/admin/statistics')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад к статистике
          </Button>
        </div>
      }
    />
  )
}

function RecognitionViewContent({ recognitionData }: { recognitionData: RecognitionData }) {
  const [activeSessionIndex, setActiveSessionIndex] = useState(0)
  const activeSession = recognitionData.sessions[activeSessionIndex]

  if (!activeSession) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Нет доступных валидаций</p>
        </div>
      </div>
    )
  }

  return (
    <ValidationSessionProvider 
      key={activeSession.workLog.id}
      initialSession={activeSession} 
      readOnly={true}
    >
      <RecognitionViewContentInner 
        recognitionData={recognitionData}
        activeSessionIndex={activeSessionIndex}
        setActiveSessionIndex={setActiveSessionIndex}
      />
    </ValidationSessionProvider>
  )
}

export default function RecognitionViewPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = use(params)
  const recognitionId = parseInt(id)
  const { user } = useUser()
  const [recognitionData, setRecognitionData] = useState<RecognitionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadRecognitionData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Получить все completed work logs для этого recognition
        const workLogsResponse = await apiFetch<any[]>(
          `/api/validation/recognition/${recognitionId}/completed`
        )

        if (!workLogsResponse.success || !workLogsResponse.data || workLogsResponse.data.length === 0) {
          setError('Нет завершенных валидаций для этого recognition')
          return
        }

        const workLogs = workLogsResponse.data

        // Загрузить session для каждого work_log
        const sessions: ValidationSession[] = []
        for (const workLog of workLogs) {
          const response = await apiFetch<{ session: ValidationSession }>(
            `/api/validation/session/${workLog.id}`
          )
          if (response.success && response.data) {
            sessions.push(response.data.session)
          }
        }

        setRecognitionData({
          recognition_id: recognitionId,
          batch_id: sessions[0]?.recognition.batch_id || null,
          sessions,
        })
      } catch (err) {
        console.error('Failed to load recognition data:', err)
        setError('Ошибка загрузки данных recognition')
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      loadRecognitionData()
    }
  }, [recognitionId, user])

  if (!user || loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (error || !recognitionData) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Данные не найдены'}</p>
          <Button onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
        </div>
      </div>
    )
  }

  return <RecognitionViewContent recognitionData={recognitionData} />
}
