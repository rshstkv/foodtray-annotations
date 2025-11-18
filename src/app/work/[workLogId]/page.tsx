'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RootLayout } from '@/components/layouts/RootLayout'
import { WorkLayout } from '@/components/layouts/WorkLayout'
import { ValidationSessionHeader } from '@/components/validation/ValidationSessionHeader'
import { ItemsList } from '@/components/validation/ItemsList'
import { ImageGrid } from '@/components/validation/ImageGrid'
import { AnnotationsList } from '@/components/validation/AnnotationsList'
import { ItemDialog } from '@/components/validation/ItemDialog'
import { Button } from '@/components/ui/button'
import { useUser } from '@/hooks/useUser'
import {
  ValidationSessionProvider,
  useValidationSession,
} from '@/contexts/ValidationSessionContext'
import { apiFetch } from '@/lib/api-response'
import type { ValidationSession, BBox, StartValidationResponse } from '@/types/domain'
import { getItemTypeFromValidationType } from '@/types/domain'
import { getValidationCapabilities } from '@/lib/validation-capabilities'
import { CheckCircle, XCircle } from 'lucide-react'

function ValidationSessionContent() {
  const router = useRouter()
  const {
    session,
    loading,
    error,
    readOnly,
    items,
    selectedItemId,
    setSelectedItemId,
    createItem,
    updateItem,
    deleteItem,
    annotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    hasUnsavedChanges,
    saveAllChanges,
    resetToInitial,
    validationStatus,
    completeValidation,
    abandonValidation,
    nextStep,
  } = useValidationSession()

  // Всегда режим редактирования для этой задачи
  const mode = 'edit' as const
  const [showItemDialog, setShowItemDialog] = useState(false)

  const itemType = getItemTypeFromValidationType(session.workLog.validation_type)
  
  // Получаем capabilities для текущего типа валидации
  const capabilities = getValidationCapabilities(session.workLog.validation_type)

  // Обработка Escape для снятия выделения
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedItemId(null)
        setSelectedAnnotationId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSelectedItemId, setSelectedAnnotationId])

  const handleItemSelect = (id: number) => {
    // Если кликаем на уже выбранный item - снимаем выделение
    if (selectedItemId === id) {
      setSelectedItemId(null)
      setSelectedAnnotationId(null)
    } else {
      setSelectedItemId(id)
      setSelectedAnnotationId(null)
    }
  }

  const handleItemCreate = () => {
    // Для простых типов (PLATE, BOTTLE) создаём сразу без диалога
    if (itemType === 'PLATE' || itemType === 'BOTTLE') {
      if (!capabilities.canCreateItems) {
        alert('В данном режиме валидации нельзя создавать новые объекты')
        return
      }
      createItem({
        type: itemType,
      })
    } else {
      // Для FOOD и BUZZER показываем диалог с опциями
      setShowItemDialog(true)
    }
  }

  const handleItemDialogSave = async (data: any) => {
    if (!capabilities.canCreateItems) {
      alert('В данном режиме валидации нельзя создавать новые объекты')
      return
    }
    await createItem(data)
    setShowItemDialog(false)
  }

  const handleAnnotationCreate = async (imageId: number, bbox: BBox) => {
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

  const handleAnnotationSelect = (annotationId: number | string | null, itemId?: number) => {
    setSelectedAnnotationId(annotationId)
    // Если выбрана аннотация и передан itemId, автоматически выбираем item
    if (annotationId && itemId) {
      setSelectedItemId(itemId)
    }
  }

  // Обёрточные функции с проверками capabilities
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

  const handleComplete = async () => {
    try {
      // Сохранить изменения
      if (hasUnsavedChanges) {
        await saveAllChanges()
      }

      const workLog = session.workLog
      const hasSteps = workLog.validation_steps && workLog.validation_steps.length > 0
      const currentStep = workLog.current_step_index ?? 0
      const isLastStep = hasSteps ? currentStep >= workLog.validation_steps.length - 1 : true

      if (hasSteps && !isLastStep) {
        // Есть еще steps - переключиться на следующий (БЕЗ router.push!)
        await nextStep()
        // Страница обновится локально через context
      } else {
        // Это последний step или single-step - завершить и взять новый recognition
        await completeValidation()
        
        const response = await apiFetch<StartValidationResponse>(
          '/api/validation/start',
          { method: 'POST' }
        )
        
        if (response.success && response.data) {
          router.push(`/work/${response.data.workLog.id}`)
        } else {
          router.push('/work')
        }
      }
    } catch (err) {
      console.error('Failed to complete validation:', err)
      alert('Ошибка при завершении валидации')
    }
  }

  const handleSkip = async () => {
    if (hasUnsavedChanges) {
      if (!confirm('У вас есть несохраненные изменения. Вы уверены, что хотите пропустить эту задачу? Все изменения будут потеряны.')) {
        return
      }
    } else {
      if (!confirm('Вы уверены, что хотите пропустить эту задачу?')) {
        return
      }
    }
    
    try {
      await abandonValidation()
      router.push('/work')
    } catch (err) {
      console.error('Failed to skip validation:', err)
      alert('Ошибка при пропуске задачи')
    }
  }

  const handleReset = async () => {
    if (confirm('Вы уверены, что хотите откатить все изменения к исходному состоянию?')) {
      try {
        await resetToInitial()
      } catch (err) {
        console.error('Failed to reset:', err)
        alert('Ошибка при откате изменений')
      }
    }
  }

  const handleSelectFirstError = () => {
    // Находим первый item с ошибкой и выделяем его
    if (validationStatus.itemErrors.size > 0) {
      const firstErrorItemId = Array.from(validationStatus.itemErrors.keys())[0]
      setSelectedItemId(firstErrorItemId)
      setSelectedAnnotationId(null)
    }
  }

  const workLog = session.workLog
  const hasSteps = workLog.validation_steps && workLog.validation_steps.length > 0
  const currentStepIndex = workLog.current_step_index ?? 0
  const isLastStep = hasSteps ? currentStepIndex >= workLog.validation_steps.length - 1 : true

  return (
    <>
      <WorkLayout
        header={
          <ValidationSessionHeader
            recognitionId={session.recognition.id}
            validationType={session.workLog.validation_type}
            hasUnsavedChanges={hasUnsavedChanges}
            validationStatus={validationStatus}
            onReset={readOnly ? undefined : handleReset}
            onSelectFirstError={handleSelectFirstError}
            readOnly={readOnly}
            validationSteps={workLog.validation_steps}
            currentStepIndex={currentStepIndex}
          />
        }
        sidebar={
          <ItemsList
            items={items}
            validationType={session.workLog.validation_type}
            selectedItemId={selectedItemId}
            recipeLineOptions={session.recipeLineOptions}
            onItemSelect={handleItemSelect}
            onItemCreate={handleItemCreate}
            onItemDelete={handleItemDelete}
            onItemUpdate={handleItemUpdate}
          />
        }
        images={
          <ImageGrid
            images={session.images}
            annotations={annotations}
            items={items}
            recipeLineOptions={session.recipeLineOptions}
            selectedItemId={selectedItemId}
            selectedAnnotationId={selectedAnnotationId}
            validationType={session.workLog.validation_type}
            mode={mode}
            onAnnotationCreate={handleAnnotationCreate}
            onAnnotationUpdate={handleAnnotationUpdate}
            onAnnotationSelect={handleAnnotationSelect}
            onAnnotationDelete={handleAnnotationDelete}
            onAnnotationToggleOcclusion={handleAnnotationToggleOcclusion}
          />
        }
        actions={
          !readOnly ? (
            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" onClick={handleSkip}>
                <XCircle className="w-4 h-4 mr-2" />
                Пропустить
              </Button>
              <Button 
                onClick={handleComplete}
                disabled={!validationStatus.canComplete}
                title={!validationStatus.canComplete ? 'Исправьте ошибки валидации перед завершением' : (isLastStep ? 'Завершить всё' : 'Следующая валидация')}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {isLastStep ? 'Завершить всё' : 'Следующая валидация'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => router.back()}>
                Назад
              </Button>
            </div>
          )
        }
      />

      {itemType && (
        <ItemDialog
          open={showItemDialog}
          onClose={() => setShowItemDialog(false)}
          onSave={handleItemDialogSave}
          itemType={itemType}
          recipeLineOptions={session.recipeLineOptions}
          activeMenu={session.activeMenu}
        />
      )}

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 rounded-lg p-4 shadow-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </>
  )
}

export default function WorkSessionPage({ 
  params,
  searchParams,
}: { 
  params: Promise<{ workLogId: string }>
  searchParams: Promise<{ readonly?: string }>
}) {
  const { workLogId } = use(params)
  const resolvedSearchParams = use(searchParams)
  const readOnly = resolvedSearchParams.readonly === 'true'
  const { user, isAdmin } = useUser()
  const [session, setSession] = useState<ValidationSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSession = async () => {
      try {
        setLoading(true)
        const response = await apiFetch<{ session: ValidationSession }>(
          `/api/validation/session/${workLogId}`
        )
        if (response.success && response.data) {
          setSession(response.data.session)
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
  }, [workLogId, user])

  if (!user || loading || !session) {
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

  return (
    <ValidationSessionProvider initialSession={session} readOnly={readOnly}>
      <ValidationSessionContent />
    </ValidationSessionProvider>
  )
}

