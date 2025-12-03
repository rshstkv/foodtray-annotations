'use client'

import { use, useEffect, useState, useCallback } from 'react'
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
import { useToast } from '@/hooks/use-toast'
import { getValidationCapabilities } from '@/lib/validation-capabilities'
import { getItemTypeFromValidationType } from '@/types/domain'
import { Save } from 'lucide-react'
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
  BBox
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
    selectedItemId,
    setSelectedItemId,
    selectedAnnotationId,
    setSelectedAnnotationId,
    resetToInitial,
    validationStatus,
    completeCurrentStep
  } = useValidationSession()
  
  // Берем workLog из контекста (он обновляется в реальном времени)
  const currentWorkLog = session.workLog

  // Проверяем, может ли пользователь редактировать этот work_log
  const canEdit = currentWorkLog.assigned_to === user?.id || isAdmin
  
  // Режим редактирования если пользователь может редактировать, иначе просмотр
  const mode = canEdit ? 'edit' as const : 'view' as const
  
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

  // Сбросить выбранный item при переключении шага
  useEffect(() => {
    setSelectedItemId(null)
    setSelectedAnnotationId(null)
  }, [selectedStepIndex, setSelectedItemId, setSelectedAnnotationId])

  // Обработчик сохранения/завершения этапа
  const handleSave = async () => {
    if (!canEdit) return
    
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
    } catch {
      toast({
        title: 'Ошибка',
        description: isCurrentStepSkipped ? 'Не удалось завершить этап' : 'Не удалось сохранить изменения',
        variant: 'destructive',
      })
    }
  }

  const handleReset = async () => {
    if (!canEdit) return
    
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
      setSelectedAnnotationId(null)
    }
  }

  const handleItemSelect = useCallback((id: number) => {
    if (selectedItemId === id) {
      setSelectedItemId(null)
      setSelectedAnnotationId(null)
    } else {
      setSelectedItemId(id)
      setSelectedAnnotationId(null)
    }
  }, [selectedItemId, setSelectedItemId, setSelectedAnnotationId])

  const handleAnnotationSelect = (annotationId: number | string | null, itemId?: number) => {
    setSelectedAnnotationId(annotationId)
    if (annotationId && itemId) {
      setSelectedItemId(itemId)
    }
  }

  const handleAnnotationCreate = async (imageId: number, bbox: BBox) => {
    if (!canEdit) return
    
    if (!capabilities.canCreateAnnotations) {
      alert('В данном режиме валидации нельзя создавать новые аннотации')
      return
    }
    if (!selectedItemId) {
      alert('Сначала выберите item')
      return
    }
    const newAnnotationId = createAnnotation({
      image_id: imageId,
      work_item_id: selectedItemId,
      bbox,
    })
    // Автоматически выбираем новую аннотацию для возможности сразу подправить
    if (newAnnotationId !== null) {
      setSelectedAnnotationId(newAnnotationId)
    }
  }

  const handleAnnotationUpdate = (id: number | string, data: any) => {
    if (!canEdit) return
    
    if (!capabilities.canEditAnnotationsBBox) {
      alert('В данном режиме валидации нельзя редактировать границы аннотаций')
      return
    }
    updateAnnotation(id, data)
  }

  const handleAnnotationDelete = (id: number | string) => {
    if (!canEdit) return
    
    if (!capabilities.canDeleteAnnotations) {
      alert('В данном режиме валидации нельзя удалять аннотации')
      return
    }
    deleteAnnotation(id)
  }

  const handleAnnotationToggleOcclusion = (id: number | string) => {
    if (!canEdit) return
    
    const annotation = annotations.find(a => a.id === id)
    if (annotation) {
      updateAnnotation(id, { 
        is_occluded: !annotation.is_occluded,
        occlusion_metadata: annotation.is_occluded ? null : annotation.occlusion_metadata
      })
    }
  }

  // Обёрточные функции с проверками capabilities для items
  const handleItemCreate = () => {
    if (!canEdit) return
    
    if (!capabilities.canCreateItems) {
      alert('В данном режиме валидации нельзя создавать новые объекты')
      return
    }
    // Для простых типов создаём сразу без диалога
    const itemType = getItemTypeFromValidationType(currentValidationType)
    if (itemType === 'PLATE' || itemType === 'BUZZER') {
      createItem({
        type: itemType,
        recipe_line_id: null,
      })
    } else {
      // Для FOOD нужен диалог - здесь просто показываем сообщение
      alert('Используйте кнопку "+" в списке объектов для создания нового блюда')
    }
  }

  const handleItemUpdate = (id: number, data: any) => {
    if (!canEdit) return
    
    if (!capabilities.canUpdateItems) {
      alert('В данном режиме валидации нельзя обновлять объекты')
      return
    }
    updateItem(id, data)
  }

  const handleItemDelete = (id: number) => {
    if (!canEdit) return
    
    if (!capabilities.canDeleteItems) {
      alert('В данном режиме валидации нельзя удалять объекты')
      return
    }
    if (confirm('Вы уверены, что хотите удалить этот объект?')) {
      deleteItem(id)
    }
  }

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
        // Фильтруем items по типу валидации для правильного выбора
        const currentItemType = getItemTypeFromValidationType(currentValidationType)
        const filteredItems = capabilities.showAllItemTypes
          ? items
          : items.filter((item) => item.type === currentItemType)
        
        if (itemIndex < filteredItems.length) {
          e.preventDefault()
          handleItemSelect(filteredItems[itemIndex].id)
        }
      }
      
      // Escape для снятия выделения
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedItemId(null)
        setSelectedAnnotationId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedStepIndex, canGoPrevStep, canGoNextStep, setSelectedStepIndex, items, handleItemSelect, setSelectedItemId, setSelectedAnnotationId, currentValidationType, capabilities.showAllItemTypes])

  return (
    <RootLayout
      userName={user?.full_name || undefined}
      userEmail={user?.email}
      isAdmin={isAdmin}
    >
      <WorkLayout
        header={
          <ValidationSessionHeader
            recognitionId={data.recognition.id}
            validationType={currentValidationType}
            hasUnsavedChanges={hasUnsavedChanges}
            validationStatus={validationStatus}
            onReset={handleReset}
            onSelectFirstError={handleSelectFirstError}
            readOnly={!canEdit}
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
            readOnly={!canEdit}
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
            onAnnotationCreate={handleAnnotationCreate}
            onAnnotationUpdate={handleAnnotationUpdate}
            onAnnotationSelect={handleAnnotationSelect}
            onAnnotationDelete={handleAnnotationDelete}
            onAnnotationToggleOcclusion={handleAnnotationToggleOcclusion}
          />
        }
        actions={
          <div className="flex items-center justify-end gap-3">
            {canEdit && (hasUnsavedChanges || isCurrentStepSkipped) && (
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
  
  // Проверяем, может ли пользователь редактировать этот work_log
  const canEdit = currentWorkLog.assigned_to === user?.id || isAdmin
  
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
  
  // Для OCCLUSION_VALIDATION передаем ВСЕ items и annotations (фильтрация будет в компонентах)
  // Для остальных типов - фильтруем по типу item
  let filteredItems: any[]
  let filteredAnnotations: any[]
  
  if (currentValidationType === 'OCCLUSION_VALIDATION') {
    // Для окклюзий - передаем все (не удаленные)
    filteredItems = allItems.filter(item => !item.is_deleted)
    filteredAnnotations = allAnnotations.filter(ann => !ann.is_deleted)
  } else {
    // Для остальных типов - фильтруем по типу валидации
    const currentItemType = getItemTypeFromValidationType(currentValidationType)
    filteredItems = allItems.filter(
      item => !item.is_deleted && item.type === currentItemType
    )
    
    // Фильтруем annotations по items текущего типа
    const filteredItemIds = new Set(filteredItems.map(item => item.id))
    filteredAnnotations = allAnnotations.filter(
      ann => !ann.is_deleted && filteredItemIds.has(ann.work_item_id)
    )
  }
  
  // Помечаем items которые были добавлены пользователем (не из initial)
  const itemsWithChangeStatus = filteredItems.map(item => ({
    ...item,
    isNewItem: item.initial_item_id === null, // Новый item добавлен пользователем
  }))

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
      readOnly={!canEdit}
    >
      <RecognitionViewContent 
        data={data}
        selectedStepIndex={selectedStepIndex}
        setSelectedStepIndex={setSelectedStepIndex}
      />
    </ValidationSessionProvider>
  )
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

