'use client'

import { use, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { WorkLayout } from '@/components/layouts/WorkLayout'
import { ValidationSessionProvider, useValidationSession } from '@/contexts/ValidationSessionContext'
import { ValidationSessionHeader } from '@/components/validation/ValidationSessionHeader'
import { ItemsList } from '@/components/validation/ItemsList'
import { ImageGrid } from '@/components/validation/ImageGrid'
import { Button } from '@/components/ui/button'
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'
import { Save } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { getValidationCapabilities } from '@/lib/validation-capabilities'
import { getItemTypeFromValidationType } from '@/types/domain'
import type { 
  Recognition, 
  Image as RecognitionImage, 
  Recipe, 
  RecipeLine, 
  RecipeLineOption,
  ValidationWorkLog,
  WorkItem,
  WorkAnnotation,
  ValidationType,
  ValidationSession
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
  const { toast } = useToast()
  const { 
    session,
    items, 
    annotations, 
    hasUnsavedChanges, 
    saveAllChanges, 
    createItem, 
    updateItem, 
    deleteItem, 
    createAnnotation, 
    updateAnnotation, 
    deleteAnnotation, 
    setSelectedAnnotationId,
    resetToInitial,
    validationStatus,
    completeCurrentStep
  } = useValidationSession()
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [selectedAnnotationId, setSelectedAnnotationIdLocal] = useState<number | string | null>(null)
  
  // Всегда в режиме редактирования
  const mode = 'edit' as const

  // Берем первый (последний по времени) work_log
  const currentSession = data.sessions[0]
  const currentWorkLog = currentSession.workLog
  
  // Для multi-step: показываем выбранный шаг
  const hasSteps = currentWorkLog.validation_steps && currentWorkLog.validation_steps.length > 0
  const currentValidationType: ValidationType = hasSteps 
    ? currentWorkLog.validation_steps[selectedStepIndex]?.type 
    : currentWorkLog.validation_type

  // Получаем capabilities для текущего типа валидации
  const capabilities = getValidationCapabilities(currentValidationType)

  const canGoPrevStep = selectedStepIndex > 0
  const canGoNextStep = hasSteps && selectedStepIndex < currentWorkLog.validation_steps.length - 1
  
  // Проверить, является ли текущий просматриваемый этап заскипанным
  const isCurrentStepSkipped = hasSteps && currentWorkLog.validation_steps[selectedStepIndex]?.status === 'skipped'

  // Обработчик сохранения/завершения этапа
  const handleSave = async () => {
    // Проверяем валидацию перед сохранением
    if (!validationStatus.canComplete) {
      toast({
        title: 'Невозможно сохранить',
        description: 'Исправьте ошибки валидации перед сохранением',
        variant: 'destructive',
      })
      return
    }
    
    try {
      // Если этап заскипан, завершаем его (что также сохранит изменения если они есть)
      if (isCurrentStepSkipped) {
        await completeCurrentStep(selectedStepIndex)
        toast({
          title: 'Успешно',
          description: 'Этап завершен',
        })
      } else if (hasUnsavedChanges) {
        // Иначе просто сохраняем изменения
        await saveAllChanges()
        toast({
          title: 'Успешно',
          description: 'Изменения сохранены',
        })
      }
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: isCurrentStepSkipped ? 'Не удалось завершить этап' : 'Не удалось сохранить изменения',
        variant: 'destructive',
      })
    }
  }

  const handleReset = async () => {
    if (confirm('Вы уверены, что хотите откатить все изменения к исходному состоянию?')) {
      try {
        await resetToInitial()
      } catch (err) {
        console.error('Failed to reset:', err)
        toast({
          title: 'Ошибка',
          description: 'Ошибка при откате изменений',
          variant: 'destructive',
        })
      }
    }
  }

  const handleSelectFirstError = () => {
    if (validationStatus.itemErrors.size > 0) {
      const firstErrorItemId = Array.from(validationStatus.itemErrors.keys())[0]
      setSelectedItemId(firstErrorItemId)
      setSelectedAnnotationIdLocal(null)
      setSelectedAnnotationId(null)
    }
  }

  const handleItemSelect = (id: number) => {
    if (selectedItemId === id) {
      setSelectedItemId(null)
      setSelectedAnnotationIdLocal(null)
      setSelectedAnnotationId(null)
    } else {
      setSelectedItemId(id)
      setSelectedAnnotationIdLocal(null)
      setSelectedAnnotationId(null)
    }
  }

  const handleAnnotationSelect = (annotationId: number | string | null, itemId?: number) => {
    setSelectedAnnotationIdLocal(annotationId)
    setSelectedAnnotationId(annotationId)
    if (annotationId && itemId) {
      setSelectedItemId(itemId)
    }
  }

  const handleAnnotationCreate = async (imageId: number, bbox: any) => {
    if (!capabilities.canCreateAnnotations) {
      alert('В данном режиме валидации нельзя создавать новые аннотации')
      return
    }
    if (!selectedItemId) {
      alert('Сначала выберите item')
      return
    }
    await createAnnotation({
      image_id: imageId,
      work_item_id: selectedItemId,
      bbox,
    })
  }

  const handleAnnotationUpdate = (id: number | string, data: any) => {
    if (!capabilities.canEditAnnotationsBBox) {
      alert('В данном режиме валидации нельзя редактировать границы аннотаций')
      return
    }
    updateAnnotation(id, data)
  }

  const handleAnnotationDelete = (id: number | string) => {
    if (!capabilities.canDeleteAnnotations) {
      alert('В данном режиме валидации нельзя удалять аннотации')
      return
    }
    deleteAnnotation(id)
  }

  const handleAnnotationToggleOcclusion = (id: number | string) => {
    if (!capabilities.canToggleOcclusion) {
      alert('В данном режиме валидации нельзя изменять статус окклюзии')
      return
    }
    const ann = annotations.find(a => a.id === id)
    if (ann) {
      updateAnnotation(id, { 
        is_occluded: !ann.is_occluded 
      })
    }
  }

  const handleItemDelete = (id: number) => {
    if (!capabilities.canDeleteItems) {
      alert('В данном режиме валидации нельзя удалять объекты')
      return
    }
    deleteItem(id)
  }

  const handleItemUpdate = (id: number, data: any) => {
    if (!capabilities.canUpdateItems) {
      alert('В данном режиме валидации нельзя обновлять объекты')
      return
    }
    updateItem(id, data)
  }

  const handleItemCreate = () => {
    if (!capabilities.canCreateItems) {
      alert('В данном режиме валидации нельзя создавать новые объекты')
      return
    }
    createItem({ type: getItemTypeFromValidationType(currentValidationType) })
  }

  // Сбросить выбранный item при переключении шага
  useEffect(() => {
    setSelectedItemId(null)
    setSelectedAnnotationIdLocal(null)
    setSelectedAnnotationId(null)
  }, [selectedStepIndex, setSelectedAnnotationId])

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
      
      // Получаем текущий список items (фильтруем по типу валидации)
      const currentItemType = getItemTypeFromValidationType(currentValidationType)
      const filteredItems = (currentItemType && !capabilities.showAllItemTypes)
        ? items.filter((item) => item.type === currentItemType)
        : items
      
      // Цифры 1-9 для выбора items
      const num = parseInt(e.key)
      if (num >= 1 && num <= 9) {
        const itemIndex = num - 1
        if (itemIndex < filteredItems.length) {
          e.preventDefault()
          handleItemSelect(filteredItems[itemIndex].id)
        }
      }
      
      // Escape для снятия выделения
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedItemId(null)
        setSelectedAnnotationIdLocal(null)
        setSelectedAnnotationId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedStepIndex, canGoPrevStep, canGoNextStep, setSelectedStepIndex, items, handleItemSelect, setSelectedAnnotationId, currentValidationType, capabilities.showAllItemTypes])

  return (
    <WorkLayout
        header={
          <ValidationSessionHeader
            recognitionId={data.recognition.id}
            validationType={currentValidationType}
            hasUnsavedChanges={hasUnsavedChanges}
            validationStatus={validationStatus}
            onReset={handleReset}
            onSelectFirstError={handleSelectFirstError}
            readOnly={false}
            validationSteps={hasSteps ? currentWorkLog.validation_steps : null}
            currentStepIndex={selectedStepIndex}
            onStepClick={setSelectedStepIndex}
          />
        }
        sidebar={
          <ItemsList
            items={items}
            annotations={annotations}
            validationType={currentValidationType}
            selectedItemId={selectedItemId}
            recipeLines={data.recipeLines}
            recipeLineOptions={data.recipeLineOptions}
            activeMenu={data.activeMenu}
            onItemSelect={handleItemSelect}
            onItemCreate={handleItemCreate}
            onItemDelete={handleItemDelete}
            onItemUpdate={handleItemUpdate}
            mode={mode}
          />
        }
        images={
          <ImageGrid
            images={data.images}
            annotations={annotations}
            items={items}
            recipeLineOptions={data.recipeLineOptions}
            selectedItemId={selectedItemId}
            selectedAnnotationId={selectedAnnotationId}
            validationType={currentValidationType}
            mode={mode}
            displayMode={mode}
            onAnnotationCreate={handleAnnotationCreate}
            onAnnotationUpdate={handleAnnotationUpdate}
            onAnnotationSelect={handleAnnotationSelect}
            onAnnotationDelete={handleAnnotationDelete}
            onAnnotationToggleOcclusion={handleAnnotationToggleOcclusion}
          />
        }
        actions={
          <div className="flex items-center justify-end gap-3">
            {(hasUnsavedChanges || isCurrentStepSkipped) && (
              <Button 
                onClick={handleSave}
                disabled={!validationStatus.canComplete}
                title={!validationStatus.canComplete ? 'Исправьте ошибки валидации перед сохранением' : undefined}
              >
                <Save className="w-4 h-4 mr-2" />
                {isCurrentStepSkipped && !hasUnsavedChanges ? 'Завершить этап' : 'Сохранить изменения'}
              </Button>
            )}
            <Button variant="outline" onClick={() => router.back()}>
              Назад
            </Button>
          </div>
        }
      />
  )
}

export default function RecognitionViewPage({ 
  params 
}: { 
  params: Promise<{ recognitionId: string }>
}) {
  const { recognitionId } = use(params)
  const router = useRouter()
  const { user, isAdmin } = useUser()
  const [session, setSession] = useState<ValidationSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedStepIndex, setSelectedStepIndex] = useState(0)

  // Загрузка реальной session
  useEffect(() => {
    const loadSession = async () => {
      try {
        setLoading(true)
        // Сначала получаем данные для определения work_log_id
        const viewResponse = await apiFetch<RecognitionViewData>(
          `/api/recognition/${recognitionId}/view`
        )
        
        if (viewResponse.success && viewResponse.data) {
          const workLogId = viewResponse.data.sessions[0].workLog.id
          
          // Загружаем полную session
          const sessionResponse = await apiFetch<{ session: ValidationSession }>(
            `/api/validation/session/${workLogId}`
          )
          
          if (sessionResponse.success && sessionResponse.data) {
            setSession(sessionResponse.data.session)
          }
        }
      } catch (error) {
        console.error('Failed to load session:', error)
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      loadSession()
    }
  }, [recognitionId, user])

  if (!user || loading || !session) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  // Для multi-step валидации: обновляем validation_type в зависимости от текущего шага
  const hasSteps = session.workLog.validation_steps && session.workLog.validation_steps.length > 0
  const currentValidationType: ValidationType = hasSteps 
    ? session.workLog.validation_steps[selectedStepIndex]?.type 
    : session.workLog.validation_type
  
  // Создаем копию session с правильным validation_type для текущего шага
  const sessionForCurrentStep: ValidationSession = {
    ...session,
    workLog: {
      ...session.workLog,
      validation_type: currentValidationType
    }
  }
  
  // Извлекаем данные для передачи в RecognitionViewContent
  const data: RecognitionViewData = {
    recognition: session.recognition,
    images: session.images,
    recipe: session.recipe,
    recipeLines: session.recipeLines,
    recipeLineOptions: session.recipeLineOptions,
    activeMenu: session.activeMenu,
    sessions: [{
      workLog: session.workLog,
      workItems: session.items,
      workAnnotations: session.annotations
    }]
  }

  return (
    <ValidationSessionProvider 
      key={`${recognitionId}-${selectedStepIndex}`}
      initialSession={sessionForCurrentStep} 
      readOnly={false}
    >
      <RecognitionViewContent 
        data={data}
        selectedStepIndex={selectedStepIndex}
        setSelectedStepIndex={setSelectedStepIndex}
      />
    </ValidationSessionProvider>
  )
}


