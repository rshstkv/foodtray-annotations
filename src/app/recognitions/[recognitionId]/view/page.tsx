'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RootLayout } from '@/components/layouts/RootLayout'
import { WorkLayout } from '@/components/layouts/WorkLayout'
import { ValidationSessionProvider, useValidationSession } from '@/contexts/ValidationSessionContext'
import { ValidationSessionHeader } from '@/components/validation/ValidationSessionHeader'
import { ItemsList } from '@/components/validation/ItemsList'
import { ImageGrid } from '@/components/validation/ImageGrid'
import { Button } from '@/components/ui/button'
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { 
  Recognition, 
  Image as RecognitionImage, 
  Recipe, 
  RecipeLine, 
  RecipeLineOption,
  ValidationWorkLog,
  WorkItem,
  WorkAnnotation,
  ValidationType
} from '@/types/domain'

interface SessionData {
  workLog: ValidationWorkLog
  workItems: WorkItem[]
  workAnnotations: WorkAnnotation[]
}

interface RecognitionViewData {
  recognition: Recognition
  images: RecognitionImage[]
  recipe: Recipe | null
  recipeLines: RecipeLine[]
  recipeLineOptions: RecipeLineOption[]
  activeMenu: any[]
  sessions: SessionData[]
}

function RecognitionViewContent({ 
  data,
  selectedStepIndex,
  setSelectedStepIndex
}: {
  data: RecognitionViewData
  selectedStepIndex: number
  setSelectedStepIndex: (index: number) => void
}) {
  const router = useRouter()
  const { user, isAdmin } = useUser()
  const { items, annotations } = useValidationSession()
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)

  // Берем первый (последний по времени) work_log
  const currentSession = data.sessions[0]
  const currentWorkLog = currentSession.workLog
  
  // Для multi-step: показываем выбранный шаг
  const hasSteps = currentWorkLog.validation_steps && currentWorkLog.validation_steps.length > 0
  const currentValidationType: ValidationType = hasSteps 
    ? currentWorkLog.validation_steps[selectedStepIndex]?.type 
    : currentWorkLog.validation_type

  const canGoPrevStep = selectedStepIndex > 0
  const canGoNextStep = hasSteps && selectedStepIndex < currentWorkLog.validation_steps.length - 1

  // Сбросить выбранный item при переключении шага
  useEffect(() => {
    setSelectedItemId(null)
  }, [selectedStepIndex])

  // Горячие клавиши для навигации между шагами и выбора items
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Игнорируем, если фокус на input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return
      }

      // Стрелки влево/вправо - двигаться между шагами
      if (e.key === 'ArrowLeft' && canGoPrevStep) {
        e.preventDefault()
        setSelectedStepIndex(selectedStepIndex - 1)
      } else if (e.key === 'ArrowRight' && canGoNextStep) {
        e.preventDefault()
        setSelectedStepIndex(selectedStepIndex + 1)
      }
      
      // Цифры 1-9 для выбора items
      const num = parseInt(e.key)
      if (num >= 1 && num <= 9) {
        const itemIndex = num - 1
        if (itemIndex < items.length) {
          e.preventDefault()
          setSelectedItemId(items[itemIndex].id)
        }
      }
      
      // Escape для снятия выделения
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedItemId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedStepIndex, canGoPrevStep, canGoNextStep, setSelectedStepIndex, items])

  return (
    <RootLayout
      userName={user?.full_name || undefined}
      userEmail={user?.email}
      isAdmin={isAdmin}
    >
      <WorkLayout
        header={
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Recognition #{data.recognition.id} (Просмотр)
                </h1>
                {hasSteps && (
                  <div className="flex items-center gap-2 mt-2">
                    {currentWorkLog.validation_steps.map((step, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedStepIndex(idx)}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          idx === selectedStepIndex
                            ? 'bg-blue-500 text-white'
                            : step.status === 'completed'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {getValidationTypeLabel(step.type)}
                        {step.status === 'completed' && ' ✓'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="outline" onClick={() => router.back()}>
                Назад
              </Button>
            </div>
          </div>
        }
        sidebar={
          <ItemsList
            items={items}
            annotations={annotations}
            validationType={currentValidationType}
            selectedItemId={selectedItemId}
            recipeLineOptions={data.recipeLineOptions}
            onItemSelect={setSelectedItemId}
            onItemCreate={() => {}}
            onItemDelete={() => {}}
            onItemUpdate={() => {}}
            readOnly={true}
          />
        }
        images={
          <ImageGrid
            images={data.images}
            annotations={annotations}
            items={items}
            recipeLineOptions={data.recipeLineOptions}
            selectedItemId={selectedItemId}
            selectedAnnotationId={null}
            validationType={currentValidationType}
            mode="view"
            onAnnotationCreate={() => {}}
            onAnnotationUpdate={() => {}}
            onAnnotationSelect={() => {}}
            onAnnotationDelete={() => {}}
            onAnnotationToggleOcclusion={() => {}}
          />
        }
        actions={
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => setSelectedStepIndex(Math.max(0, selectedStepIndex - 1))}
              disabled={!canGoPrevStep}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Предыдущий шаг
              <kbd className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-gray-200 rounded border border-gray-300">
                ←
              </kbd>
            </Button>
            <div className="text-sm text-gray-600">
              {hasSteps && `Шаг ${selectedStepIndex + 1} из ${currentWorkLog.validation_steps.length}`}
            </div>
            <Button
              variant="outline"
              onClick={() => setSelectedStepIndex(Math.min(currentWorkLog.validation_steps.length - 1, selectedStepIndex + 1))}
              disabled={!canGoNextStep}
            >
              Следующий шаг
              <kbd className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-gray-200 rounded border border-gray-300">
                →
              </kbd>
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        }
      />
    </RootLayout>
  )
}

export default function RecognitionViewPage({ 
  params 
}: { 
  params: Promise<{ recognitionId: string }>
}) {
  const { recognitionId } = use(params)
  const { user, isAdmin } = useUser()
  const [data, setData] = useState<RecognitionViewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedStepIndex, setSelectedStepIndex] = useState(0)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const response = await apiFetch<RecognitionViewData>(
          `/api/recognition/${recognitionId}/view`
        )
        if (response.success && response.data) {
          setData(response.data)
        }
      } catch (error) {
        console.error('Failed to load recognition data:', error)
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      loadData()
    }
  }, [recognitionId, user])

  if (!user || loading || !data) {
    return (
      <RootLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Загрузка...</p>
          </div>
        </div>
      </RootLayout>
    )
  }

  // Берем первый (последний по времени) work_log
  const currentSession = data.sessions[0]
  const currentWorkLog = currentSession.workLog
  
  // Для multi-step: показываем выбранный шаг
  const hasSteps = currentWorkLog.validation_steps && currentWorkLog.validation_steps.length > 0
  const currentValidationType: ValidationType = hasSteps 
    ? currentWorkLog.validation_steps[selectedStepIndex]?.type 
    : currentWorkLog.validation_type

  // Обновляем validation_type в work_log для текущего шага
  const displayWorkLog = {
    ...currentWorkLog,
    validation_type: currentValidationType
  }

  // Собираем items из всех сессий (может быть несколько work_logs для разных типов валидации)
  const allItems = data.sessions.flatMap(session => session.workItems)
  const allAnnotations = data.sessions.flatMap(session => session.workAnnotations)
  
  // Фильтруем items по текущему типу валидации
  const currentItemType = getItemTypeFromValidationType(currentValidationType)
  const filteredItems = allItems.filter(
    item => !item.is_deleted && item.type === currentItemType
  )
  
  // Помечаем items которые были добавлены пользователем (не из initial)
  const itemsWithChangeStatus = filteredItems.map(item => ({
    ...item,
    isNewItem: item.initial_item_id === null, // Новый item добавлен пользователем
  }))
  
  // Фильтруем annotations по items текущего типа
  const filteredItemIds = new Set(filteredItems.map(item => item.id))
  const filteredAnnotations = allAnnotations.filter(
    ann => !ann.is_deleted && filteredItemIds.has(ann.work_item_id)
  )

  // Преобразуем в формат ValidationSession
  const mockSession: any = {
    workLog: displayWorkLog,
    recognition: data.recognition,
    images: data.images,
    recipe: data.recipe,
    recipeLines: data.recipeLines,
    recipeLineOptions: data.recipeLineOptions,
    activeMenu: data.activeMenu,
    items: itemsWithChangeStatus,
    annotations: filteredAnnotations
  }

  return (
    <ValidationSessionProvider 
      key={`${recognitionId}-${selectedStepIndex}`}
      initialSession={mockSession} 
      readOnly={true}
    >
      <RecognitionViewContent 
        data={data}
        selectedStepIndex={selectedStepIndex}
        setSelectedStepIndex={setSelectedStepIndex}
      />
    </ValidationSessionProvider>
  )
}

function getItemTypeFromValidationType(validationType: ValidationType) {
  const map: Record<ValidationType, string> = {
    FOOD_VALIDATION: 'FOOD',
    PLATE_VALIDATION: 'PLATE',
    BUZZER_VALIDATION: 'BUZZER',
    OCCLUSION_VALIDATION: 'FOOD',
    BOTTLE_ORIENTATION_VALIDATION: 'FOOD' // Бутылки это FOOD items с bottle_orientation
  }
  return map[validationType]
}

function getValidationTypeLabel(validationType: ValidationType): string {
  const labels: Record<ValidationType, string> = {
    FOOD_VALIDATION: 'Блюда',
    PLATE_VALIDATION: 'Тарелки',
    BUZZER_VALIDATION: 'Пейджеры',
    OCCLUSION_VALIDATION: 'Окклюзии',
    BOTTLE_ORIENTATION_VALIDATION: 'Ориентация'
  }
  return labels[validationType]
}

