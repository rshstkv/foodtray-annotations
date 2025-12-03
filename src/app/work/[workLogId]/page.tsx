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
import { getItemTypeFromValidationType, VALIDATION_TYPE_LABELS } from '@/types/domain'
import { getValidationCapabilities } from '@/lib/validation-capabilities'
import { CheckCircle, XCircle, SkipForward } from 'lucide-react'

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
    finishStep,
  } = useValidationSession()

  // Всегда режим редактирования для этой задачи
  const mode = 'edit' as const
  const [showItemDialog, setShowItemDialog] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [highlightedStepIndex, setHighlightedStepIndex] = useState<number | null>(null)

  const itemType = getItemTypeFromValidationType(session.workLog.validation_type)
  
  // Получаем capabilities для текущего типа валидации
  const capabilities = getValidationCapabilities(session.workLog.validation_type)
  
  // Multi-step navigation
  const workLog = session.workLog
  const hasSteps = workLog.validation_steps && workLog.validation_steps.length > 0
  const currentStepIndex = workLog.current_step_index ?? 0
  const isLastStep = hasSteps ? currentStepIndex >= workLog.validation_steps.length - 1 : true

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
      console.log('[DEBUG] Creating item:', itemType, new Date().toISOString())
      const newItemId = createItem({
        type: itemType,
      })
      // Автоматически выбираем новый элемент
      if (newItemId !== null) {
        setSelectedItemId(newItemId)
        setSelectedAnnotationId(null)
      }
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
    
    console.log('[DEBUG] ItemDialog onSave called:', data, new Date().toISOString())
    
    // Если выбрано блюдо из активного меню, сохранить его данные в metadata
    if (data.menu_item_external_id && session.activeMenu) {
      const menuItem = session.activeMenu.find(
        (m) => m.external_id === data.menu_item_external_id
      )
      if (menuItem) {
        data.metadata = {
          menu_item_external_id: menuItem.external_id,
          name: menuItem.name,
        }
      }
      // Удаляем menu_item_external_id из data, т.к. сохранили в metadata
      delete data.menu_item_external_id
    }
    
    const newItemId = createItem(data)
    // Автоматически выбираем новый элемент
    if (newItemId !== null) {
      setSelectedItemId(newItemId)
      setSelectedAnnotationId(null)
    }
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
    // Предотвращаем повторные нажатия
    if (isCompleting) return
    
    try {
      setIsCompleting(true)
      
      // Если есть следующий этап - подсвечиваем его
      if (!isLastStep) {
        const nextStepIndex = currentStepIndex + 1
        setHighlightedStepIndex(nextStepIndex)
        
        // Задержка чтобы пользователь увидел анимацию
        await new Promise(resolve => setTimeout(resolve, 800))
      }
      
      // Завершаем этап
      await finishStep('completed')
      
      // Убираем подсветку
      setHighlightedStepIndex(null)
    } catch (err) {
      console.error('Failed to complete step:', err)
      alert('Ошибка при завершении этапа')
      setHighlightedStepIndex(null)
    } finally {
      // Разблокируем через секунду после завершения
      setTimeout(() => setIsCompleting(false), 1000)
    }
  }

  const handleSkip = async () => {
    const currentValidationType = session.workLog.validation_type
    const validationLabel = VALIDATION_TYPE_LABELS[currentValidationType]
    
    let message = `Пропустить "${validationLabel}"?\n\n`
    
    if (hasUnsavedChanges) {
      message += `⚠️ Несохраненные изменения НА ЭТОМ ЭТАПЕ будут потеряны\n\n`
    } else {
      message += `✓ Несохраненных изменений нет\n\n`
    }
    
    // Подсчитать завершенные этапы
    const completedSteps = workLog.validation_steps?.filter(s => s.status === 'completed').length || 0
    if (completedSteps > 0) {
      message += `✓ Уже завершенные этапы (${completedSteps}) останутся сохранены`
    }
    
    if (!confirm(message)) {
      return
    }
    
    try {
      await finishStep('skipped')
    } catch (err) {
      console.error('Failed to skip step:', err)
      alert('Ошибка при пропуске этапа')
    }
  }

  const handleAbandon = async () => {
    const recognitionId = session.recognition.id
    const currentValidationType = session.workLog.validation_type
    const validationLabel = VALIDATION_TYPE_LABELS[currentValidationType]
    const completedSteps = workLog.validation_steps?.filter(s => s.status === 'completed').length || 0
    const skippedSteps = workLog.validation_steps?.filter(s => s.status === 'skipped').length || 0
    
    let message = `Отказаться от Recognition #${recognitionId}?\n\n`
    
    if (hasUnsavedChanges) {
      message += `❌ Потеряете несохраненные изменения на ТЕКУЩЕМ этапе:\n   "${validationLabel}"\n\n`
    }
    
    if (completedSteps > 0 || skippedSteps > 0) {
      message += `⚠️ Результаты уже обработанных этапов:\n`
      if (completedSteps > 0) message += `   • Завершено: ${completedSteps}\n`
      if (skippedSteps > 0) message += `   • Пропущено: ${skippedSteps}\n`
      message += `   (НЕ будут сохранены в систему)\n\n`
    }
    
    message += `Recognition вернется в общую очередь для других аннотаторов.`
    
    if (!confirm(message)) {
      return
    }
    
    try {
      const response = await apiFetch<{ next_task?: StartValidationResponse }>(
        '/api/validation/abandon',
        {
          method: 'POST',
          body: JSON.stringify({ work_log_id: session.workLog.id }),
        }
      )
      
      if (response.success && response.data?.next_task) {
        router.push(`/work/${response.data.next_task.workLog.id}`)
      } else {
        router.push('/work')
      }
    } catch (err) {
      console.error('Failed to abandon validation:', err)
      alert('Ошибка при отказе от задачи')
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

  // Heartbeat для обновления updated_at (предотвращает timeout)
  useEffect(() => {
    if (readOnly) return

    const heartbeat = async () => {
      try {
        await apiFetch('/api/validation/heartbeat', {
          method: 'POST',
          body: JSON.stringify({ work_log_id: session.workLog.id }),
        })
        console.log('[Heartbeat] Updated at refreshed')
      } catch (err) {
        console.error('[Heartbeat] Failed:', err)
      }
    }

    // Отправить heartbeat каждые 5 минут
    const interval = setInterval(heartbeat, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [session.workLog.id, readOnly])

  // Проверка истечения сессии (30 минут)
  useEffect(() => {
    if (readOnly) return

    const checkExpiry = () => {
      const updatedAt = new Date(session.workLog.updated_at || session.workLog.started_at).getTime()
      const now = Date.now()
      const elapsed = now - updatedAt

      // 30 минут = 30 * 60 * 1000 мс
      if (elapsed > 30 * 60 * 1000) {
        setSessionExpired(true)
      }
    }

    // Проверять каждую минуту
    const interval = setInterval(checkExpiry, 60 * 1000)
    
    // Проверить сразу
    checkExpiry()

    return () => clearInterval(interval)
  }, [session.workLog.updated_at, session.workLog.started_at, readOnly])

  // Обработка горячих клавиш
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Игнорируем, если фокус на input/textarea/select или contenteditable
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      // Игнорируем если открыт диалог (проверяем наличие dialog в DOM)
      if (document.querySelector('[role="dialog"]')) {
        return
      }

      // Escape - снять выделение
      if (e.key === 'Escape') {
        setSelectedItemId(null)
        setSelectedAnnotationId(null)
        return
      }

      // Shift+Enter - пропустить этап
      if (e.key === 'Enter' && e.shiftKey && !readOnly && !isCompleting) {
        e.preventDefault()
        handleSkip()
        return
      }

      // Enter - завершить валидацию / следующая валидация
      if (e.key === 'Enter' && !readOnly && !isCompleting) {
        e.preventDefault()
        if (validationStatus.canComplete) {
          handleComplete()
        }
        return
      }

      // Получаем текущий список айтемов (для окклюзий показываем все типы)
      const currentItemType = getItemTypeFromValidationType(session.workLog.validation_type)
      const filteredItems = (currentItemType && !capabilities.showAllItemTypes)
        ? items.filter((item) => item.type === currentItemType)
        : items

      // Цифры 1-9 - выбрать айтем по индексу
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const index = parseInt(e.key) - 1
        if (index < filteredItems.length) {
          handleItemSelect(filteredItems[index].id)
        }
        return
      }

      if (filteredItems.length === 0) return

      // Стрелки влево/вправо - двигаться между айтемами
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        
        if (filteredItems.length === 0) return
        
        if (selectedItemId === null) {
          // Если ничего не выбрано, выбрать первый
          handleItemSelect(filteredItems[0].id)
        } else {
          // Найти текущий индекс
          const currentIndex = filteredItems.findIndex(item => item.id === selectedItemId)
          if (currentIndex !== -1) {
            let newIndex
            if (e.key === 'ArrowLeft') {
              // Предыдущий айтем (с циклом)
              newIndex = currentIndex > 0 ? currentIndex - 1 : filteredItems.length - 1
            } else {
              // Следующий айтем (с циклом)
              newIndex = currentIndex < filteredItems.length - 1 ? currentIndex + 1 : 0
            }
            handleItemSelect(filteredItems[newIndex].id)
          }
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    setSelectedItemId, 
    setSelectedAnnotationId, 
    items, 
    selectedItemId,
    session.workLog.validation_type,
    readOnly,
    validationStatus.canComplete,
    handleComplete,
    handleSkip,
    handleItemSelect,
    capabilities.showAllItemTypes,
    isCompleting,
  ])

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
            highlightedStepIndex={highlightedStepIndex}
          />
        }
        sidebar={
          <ItemsList
            items={items}
            annotations={annotations}
            validationType={session.workLog.validation_type}
            selectedItemId={selectedItemId}
            recipeLines={session.recipeLines}
            recipeLineOptions={session.recipeLineOptions}
            activeMenu={session.activeMenu}
            onItemSelect={handleItemSelect}
            onItemCreate={handleItemCreate}
            onItemDelete={handleItemDelete}
            onItemUpdate={handleItemUpdate}
            mode={mode}
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
            displayMode={mode}
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
              {/* Пропустить текущий этап - всегда доступна */}
              <Button 
                variant="outline" 
                onClick={handleSkip}
              >
                <SkipForward className="w-4 h-4 mr-2" />
                Пропустить этап
                <kbd className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600 rounded border border-gray-300">
                  Shift+Enter
                </kbd>
              </Button>
              
              {/* Завершить / Следующая */}
              <Button 
                onClick={handleComplete}
                disabled={!validationStatus.canComplete || isCompleting}
                title={
                  isCompleting ? 'Сохранение...' :
                  !validationStatus.canComplete ? 'Исправьте ошибки валидации перед завершением' : 
                  (isLastStep ? 'Завершить всё' : 'Следующая валидация')
                }
                className="relative"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {isCompleting ? 'Сохранение...' : (isLastStep ? 'Завершить всё' : 'Следующая валидация')}
                {!isCompleting && (
                  <kbd className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-white/20 rounded border border-white/30">
                    Enter
                  </kbd>
                )}
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

      {/* Session Expired Overlay */}
      {sessionExpired && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-8 max-w-md mx-4 shadow-2xl">
            <div className="text-center">
              <div className="text-6xl mb-4">⏱️</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Сессия истекла</h2>
              <p className="text-gray-600 mb-6">
                Ваша задача была освобождена из-за неактивности более 30 минут.
                <br />
                <br />
                Обновите страницу, чтобы взять новую задачу.
              </p>
              <Button 
                onClick={() => window.location.href = '/work'}
                size="lg"
                className="w-full"
              >
                Вернуться к задачам
              </Button>
            </div>
          </div>
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
  const router = useRouter()
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
          const loadedSession = response.data.session
          
          // Проверка: если задача уже завершена или отменена - редирект на главную
          if (loadedSession.workLog.status === 'abandoned' || loadedSession.workLog.status === 'completed') {
            console.warn(`[work] Session ${workLogId} is ${loadedSession.workLog.status}, redirecting to /work`)
            router.push('/work')
            return
          }
          
          setSession(loadedSession)
        }
      } catch (error) {
        console.error('Failed to load session:', error)
        // Если ошибка загрузки - тоже редирект
        router.push('/work')
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      loadSession()
    }
  }, [workLogId, user, readOnly, router])

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

