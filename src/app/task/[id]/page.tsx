'use client'

import { use, useState, useEffect, useCallback, useMemo } from 'react'
import { useUser } from '@/hooks/useUser'
import { useTaskManager } from '@/hooks/useTaskManager'
import { useAnnotationManager } from '@/hooks/useAnnotationManager'
import { useHotkeys } from '@/hooks/useHotkeys'
import { validateStep } from '@/lib/stepGuards'
import { TaskProvider } from '@/contexts/TaskContext'
import { AnnotationProvider } from '@/contexts/AnnotationContext'
import { MainLayout } from '@/components/layout/MainLayout'
import { StepIndicator } from '@/components/StepIndicator'
import { ActionButtons } from '@/components/ActionButtons'
import { TaskSidebar } from '@/components/task/TaskSidebar'
import { TaskHeader } from '@/components/task/TaskHeader'
import { ImageGrid } from '@/components/task/ImageGrid'
import { DishSelectionPanel } from '@/components/task/DishSelectionPanel'
import { BuzzerAnnotationPanel } from '@/components/task/BuzzerAnnotationPanel'
import { PlateAnnotationPanel } from '@/components/task/PlateAnnotationPanel'
import { BottleOrientationPanel } from '@/components/task/BottleOrientationPanel'
import { OverlapAnnotationPanel } from '@/components/task/OverlapAnnotationPanel'
import { MenuSearchPanel } from '@/components/task/MenuSearchPanel'
import { ImageAnnotationInfo } from '@/components/task/ImageAnnotationInfo'
import BBoxAnnotator from '@/components/BBoxAnnotator'
import { Skeleton } from '@/components/ui/skeleton'

export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const { user, isAdmin } = useUser()
  const [showAllBBoxes, setShowAllBBoxes] = useState(true)
  const [showMenuSearch, setShowMenuSearch] = useState(false)
  const [selectedDishIndex, setSelectedDishIndex] = useState<number | null>(null)
  const [modifiedDishes, setModifiedDishes] = useState<any[] | null>(null)
  const [initialModifiedDishes, setInitialModifiedDishes] = useState<any[] | null>(null)
  const [activeImageId, setActiveImageId] = useState<string | null>(null)

  // Initialize managers
  const taskManager = useTaskManager(resolvedParams.id)
  const annotationManager = useAnnotationManager(taskManager.task?.images || [])

  // Initialize annotations when task loads
  useEffect(() => {
    if (taskManager.task?.images) {
      const allAnnotations = taskManager.task.images.flatMap(img => img.annotations || [])
      annotationManager.setAnnotations(allAnnotations)
      
      // Set first image as active by default
      if (!activeImageId && taskManager.task.images.length > 0) {
        setActiveImageId(taskManager.task.images[0].id)
      }
    }
  }, [taskManager.task?.images, activeImageId])

  // Initialize modified_dishes from task_scope
  useEffect(() => {
    if (taskManager.task?.task_scope?.modified_dishes) {
      const dishes = taskManager.task.task_scope.modified_dishes
      setModifiedDishes(dishes)
      // Сохраняем начальное состояние для отката
      if (!initialModifiedDishes) {
        setInitialModifiedDishes(JSON.parse(JSON.stringify(dishes)))
      }
    }
  }, [taskManager.task?.task_scope, initialModifiedDishes])

  // Handler for dish selection
  const handleSelectDish = useCallback((dishIndex: number) => {
    setSelectedDishIndex(dishIndex)
    // Устанавливаем highlighted для подсветки всех bbox этого блюда
    annotationManager.setHighlightedDishIndex(dishIndex)
    // Снимаем выделение конкретного bbox чтобы подсветились все
    annotationManager.setSelectedAnnotationId(null)
  }, [annotationManager])

  // Handler for adding dish from menu
  const handleAddFromMenu = useCallback(() => {
    setShowMenuSearch(true)
  }, [])

  // Handler for selecting dish from menu
  const handleSelectFromMenu = useCallback((dishName: string) => {
    // Создаем аннотацию для выбранного bbox с custom_dish_name
    if (annotationManager.selectedAnnotationId) {
      annotationManager.updateAnnotation(annotationManager.selectedAnnotationId, {
        object_type: 'dish',
        dish_index: -1, // Специальное значение для блюд из меню
        custom_dish_name: dishName,
      })
    }
    setShowMenuSearch(false)
  }, [annotationManager])

  // Handler for changing dish count in receipt
  const handleDishCountChange = useCallback((dishIndex: number, newCount: number) => {
    if (!taskManager.task) return
    const dishes = (modifiedDishes && modifiedDishes.length > 0) ? modifiedDishes : taskManager.task.recognition.correct_dishes
    const updatedDishes = [...dishes]
    updatedDishes[dishIndex] = {
      ...updatedDishes[dishIndex],
      Count: Math.max(0, newCount) // Ensure non-negative
    }
    setModifiedDishes(updatedDishes)
    // hasUnsavedChanges будет автоматически вычислено через сравнение modifiedDishes
  }, [modifiedDishes, taskManager.task])

  // Handler for resolving ambiguity (selecting correct dish variant)
  const handleResolveAmbiguity = useCallback(async (dishIndex: number, selectedDishName: string) => {
    console.log('[handleResolveAmbiguity] START:', { dishIndex, selectedDishName })
    
    // Находим все bbox с этим dish_index
    const annotationsToUpdate = annotationManager.annotations.filter(
      a => a.object_type === 'dish' && 
          a.dish_index === dishIndex && 
          !a.is_deleted &&
          a.bbox_x1 !== undefined &&
          a.bbox_y1 !== undefined
    )
    
    console.log('[handleResolveAmbiguity] Found annotations:', annotationsToUpdate.length)
    
    // Группируем по координатам для обнаружения дубликатов
    const coordGroups = new Map<string, typeof annotationsToUpdate>()
    annotationsToUpdate.forEach(ann => {
      const coordKey = `${ann.bbox_x1},${ann.bbox_y1},${ann.bbox_x2},${ann.bbox_y2}`
      const existing = coordGroups.get(coordKey) || []
      coordGroups.set(coordKey, [...existing, ann])
    })
    
    console.log('[handleResolveAmbiguity] Coordinate groups:', coordGroups.size)
    
    // Для каждой группы координат: оставляем 1, остальные удаляем
    coordGroups.forEach((group, coordKey) => {
      console.log('[handleResolveAmbiguity] Processing group:', coordKey, 'count:', group.length)
      
      if (group.length > 1) {
        // Оставляем первую аннотацию, остальные удаляем
        console.log('[handleResolveAmbiguity] Deleting duplicates:', group.length - 1)
        group.slice(1).forEach(ann => {
          annotationManager.deleteAnnotation(ann.id)
        })
      }
      
      // Обновляем оставшуюся аннотацию
      if (group.length > 0) {
        console.log('[handleResolveAmbiguity] Updating annotation:', group[0].id.substring(0, 8), 'with custom_dish_name:', selectedDishName)
        annotationManager.updateAnnotation(group[0].id, {
          custom_dish_name: selectedDishName
        })
      }
    })
    
    // Сохраняем изменения автоматически
    if (annotationsToUpdate.length > 0) {
      console.log('[handleResolveAmbiguity] Saving progress...')
      await taskManager.saveProgress(annotationManager.annotations, modifiedDishes || [])
      // Очищаем изменения после успешного сохранения
      annotationManager.clearChanges()
      annotationManager.updateOriginalAnnotations() // Обновляем "последнее сохраненное"
      console.log('[handleResolveAmbiguity] Progress saved!')
    }
  }, [annotationManager, taskManager, modifiedDishes])

  // Handler for switching between images
  const handleSwitchImage = useCallback(() => {
    if (!taskManager.task?.images || taskManager.task.images.length < 2) return
    
    const currentIndex = taskManager.task.images.findIndex(img => img.id === activeImageId)
    const nextIndex = (currentIndex + 1) % taskManager.task.images.length
    setActiveImageId(taskManager.task.images[nextIndex].id)
    
    // Clear selection when switching images
    annotationManager.setSelectedAnnotationId(null)
  }, [taskManager.task?.images, activeImageId, annotationManager])

  // Unified save handler (MUST be before early return)
  const handleSave = useCallback(async () => {
    await taskManager.saveProgress(annotationManager.annotations, modifiedDishes || [])
    // После успешного сохранения очищаем изменения и обновляем начальное состояние
    annotationManager.clearChanges()
    annotationManager.updateOriginalAnnotations() // Обновляем "последнее сохраненное" для корректного сброса
    if (modifiedDishes) {
      setInitialModifiedDishes(JSON.parse(JSON.stringify(modifiedDishes)))
    }
  }, [taskManager, annotationManager, modifiedDishes])

  // Unified reset handler (MUST be before early return)
  const handleReset = useCallback(() => {
    // Сбрасываем аннотации
    annotationManager.resetChanges()
    // Сбрасываем блюда
    if (initialModifiedDishes) {
      setModifiedDishes(JSON.parse(JSON.stringify(initialModifiedDishes)))
    }
  }, [annotationManager, initialModifiedDishes])

  // Check if there are unsaved changes (annotations OR dishes) (MUST be before early return)
  const hasUnsavedChanges = 
    annotationManager.hasUnsavedChanges || 
    (modifiedDishes && initialModifiedDishes && 
     JSON.stringify(modifiedDishes) !== JSON.stringify(initialModifiedDishes))
  
  // Валидация текущего этапа через stepGuards
  const stepValidation = useMemo(() => {
    if (!taskManager.task) return { canComplete: true, checks: [] }
    
    const currentStep = taskManager.allSteps[taskManager.currentStepIndex]
    if (!currentStep) return { canComplete: true, checks: [] }
    
    return validateStep(
      currentStep.step.id,
      [], // items - пока пустой массив
      annotationManager.annotations,
      taskManager.task.images
    )
  }, [taskManager.task, taskManager.currentStepIndex, taskManager.allSteps, annotationManager.annotations])

  // Setup hotkeys (AFTER all handlers to avoid initialization errors)
  useHotkeys({
    taskManager,
    annotationManager,
    onToggleVisibility: () => setShowAllBBoxes(prev => !prev),
    onSelectDish: handleSelectDish,
    onSwitchImage: handleSwitchImage,
    activeImageId,
    modifiedDishes,
    enabled: !taskManager.loading && !!taskManager.task,
  })

  // Loading state
  if (taskManager.loading || !taskManager.task || !user) {
    return (
      <MainLayout userName={user?.email} userEmail={user?.email} isAdmin={isAdmin}>
        <div className="p-6 space-y-4">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </MainLayout>
    )
  }

  const { task, currentStep } = taskManager

  // Get menu from recognition (menu_all = array of {Name, ExternalId, ProtoNames})
  const menuItems = (task.recognition.menu_all as Array<{Name: string}> || [])
    .map(item => item.Name)
    .filter(Boolean)

  // Task context value
  const taskContextValue = {
    task,
    currentStep,
    allSteps: taskManager.allSteps,
    canGoNext: taskManager.canGoNext,
    canGoPrev: taskManager.canGoPrev,
    goToStep: taskManager.goToStep,
    completeStep: taskManager.completeStep,
    skipTask: taskManager.skipTask,
    saveProgress: () => taskManager.saveProgress(annotationManager.annotations, modifiedDishes),
  }

  // Annotation context value
  const annotationContextValue = {
    images: task.images,
    annotations: annotationManager.annotations,
    changes: annotationManager.changes,
    hasUnsavedChanges: annotationManager.hasUnsavedChanges,
    createAnnotation: annotationManager.createAnnotation,
    updateAnnotation: annotationManager.updateAnnotation,
    deleteAnnotation: annotationManager.deleteAnnotation,
    selectedAnnotationId: annotationManager.selectedAnnotationId,
    setSelectedAnnotationId: annotationManager.setSelectedAnnotationId,
    isDrawing: annotationManager.isDrawing,
    startDrawing: annotationManager.startDrawing,
    stopDrawing: annotationManager.stopDrawing,
    highlightedDishIndex: annotationManager.highlightedDishIndex,
    setHighlightedDishIndex: annotationManager.setHighlightedDishIndex,
  }

  return (
    <TaskProvider value={taskContextValue}>
      <AnnotationProvider value={annotationContextValue}>
        <MainLayout userName={user.email} userEmail={user.email} isAdmin={isAdmin}>
          <div className="flex flex-col h-[calc(100vh-8rem)]">
            {/* Task header */}
            <TaskHeader taskId={task.id} recognitionId={task.recognition_id} />
            
            {/* Step indicator */}
            <div className="border-b border-gray-200 bg-white px-6 py-4">
              <StepIndicator
                steps={taskManager.allSteps}
                currentStepIndex={taskManager.currentStepIndex}
                onStepClick={taskManager.goToStep}
              />
            </div>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar */}
              <TaskSidebar currentStep={currentStep}>
                {currentStep.step.id === 'validate_dishes' && (
                  <DishSelectionPanel
                    dishesFromReceipt={(modifiedDishes && modifiedDishes.length > 0) ? modifiedDishes : task.recognition.correct_dishes}
                    annotations={annotationManager.annotations}
                    images={task.images}
                    selectedDishIndex={selectedDishIndex}
                    onSelectDish={handleSelectDish}
                    onAddFromMenu={handleAddFromMenu}
                    onDishCountChange={handleDishCountChange}
                    onResolveAmbiguity={handleResolveAmbiguity}
                    onDeleteAnnotation={annotationManager.deleteAnnotation}
                    onAnnotationHover={annotationManager.setHoveredAnnotationId}
                  />
                )}

                {currentStep.step.id === 'validate_buzzers' && (
                  <BuzzerAnnotationPanel
                    annotations={annotationManager.annotations.filter(
                      a => a.object_type === 'buzzer' && !a.is_deleted
                    )}
                    onStartDrawing={(color) => {
                      annotationManager.startDrawing('buzzer')
                      annotationManager.setDrawingMetadata({ color })
                    }}
                    isDrawing={annotationManager.isDrawing}
                  />
                )}

                {currentStep.step.id === 'validate_plates' && (
                  <PlateAnnotationPanel
                    annotations={annotationManager.annotations.filter(
                      a => a.object_type === 'plate' && !a.is_deleted
                    )}
                    expectedCount={(() => {
                      // Берем expected count из QWEN аннотаций (main image)
                      const mainImage = task.images.find(img => img.image_type === 'main')
                      if (!mainImage?.original_annotations) return 0
                      const qwenData = mainImage.original_annotations as any
                      return qwenData?.plates?.qwen_detections?.length || 0
                    })()}
                    onStartDrawing={() => {
                      annotationManager.startDrawing('plate')
                    }}
                    isDrawing={annotationManager.isDrawing}
                  />
                )}

                {currentStep.step.id === 'validate_bottles' && (
                  <BottleOrientationPanel
                    annotations={annotationManager.annotations.filter(
                      a => a.object_type === 'bottle' && !a.is_deleted
                    )}
                    onStartDrawing={() => {
                      annotationManager.startDrawing('bottle')
                    }}
                    onUpdateOrientation={(annotationId, orientation) => {
                      annotationManager.updateAnnotation(annotationId, {
                        object_subtype: orientation
                      })
                    }}
                    isDrawing={annotationManager.isDrawing}
                  />
                )}

                {currentStep.step.id === 'check_overlaps' && (
                  <OverlapAnnotationPanel
                    images={task.images}
                    annotations={annotationManager.annotations}
                    selectedAnnotationId={annotationManager.selectedAnnotationId}
                    activeImageId={activeImageId}
                    dishNames={(() => {
                      const dishes = (modifiedDishes && modifiedDishes.length > 0) ? modifiedDishes : task.recognition.correct_dishes
                      return dishes.reduce((acc: Record<number, string>, dish: any, idx: number) => {
                        acc[idx] = dish.Name
                        return acc
                      }, {})
                    })()}
                    onAnnotationSelect={(annotationId) => {
                      annotationManager.setSelectedAnnotationId(annotationId)
                    }}
                    onToggleOverlap={(annotationId) => {
                      const annotation = annotationManager.annotations.find(a => a.id === annotationId)
                      if (annotation) {
                        annotationManager.updateAnnotation(annotationId, {
                          is_overlapped: !annotation.is_overlapped
                        })
                      }
                    }}
                  />
                )}
              </TaskSidebar>

              {/* Images */}
              <ImageGrid 
                images={task.images}
                activeImageId={activeImageId}
                onImageSelect={setActiveImageId}
              >
                {(image) => {
                  // Фильтруем аннотации по типу в зависимости от текущего шага
                  const getRelevantObjectTypes = () => {
                    switch (currentStep.step.id) {
                      case 'validate_dishes':
                        return ['dish']
                      case 'validate_buzzers':
                        return ['buzzer']
                      case 'validate_plates':
                        return ['plate']
                      case 'validate_bottles':
                        return ['bottle']
                      case 'validate_nonfood':
                        return ['nonfood']
                      default:
                        return ['dish', 'plate', 'buzzer', 'bottle', 'nonfood']
                    }
                  }
                  
                  const relevantTypes = getRelevantObjectTypes()
                  const filteredAnnotations = annotationManager.annotations.filter(
                    a => a.image_id === image.id && relevantTypes.includes(a.object_type) && !a.is_deleted
                  )
                  
                  // DEBUG: логируем для buzzers
                  if (currentStep.step.id === 'validate_buzzers') {
                    console.log('[DEBUG] Buzzer annotations for image:', image.id.substring(0,8), {
                      total: annotationManager.annotations.filter(a => a.object_type === 'buzzer').length,
                      forThisImage: filteredAnnotations.length,
                      allBuzzers: annotationManager.annotations.filter(a => a.object_type === 'buzzer').map(a => ({
                        id: a.id.substring(0,8),
                        image_id: a.image_id.substring(0,8),
                        is_deleted: a.is_deleted,
                        bbox: `${a.bbox_x1.toFixed(2)},${a.bbox_y1.toFixed(2)}`
                      }))
                    })
                  }
                  
                  // Если есть выбранный конкретный bbox по ID
                  const selectedForThisImage = annotationManager.annotations.find(
                    a => a.id === annotationManager.selectedAnnotationId && a.image_id === image.id
                  )
                  
                  return (
                  <div className="relative h-full">
                    {/* Информация об аннотациях над изображением */}
                    {currentStep.step.id === 'validate_dishes' && (
                      <ImageAnnotationInfo
                        image={image}
                        dishesFromReceipt={(modifiedDishes && modifiedDishes.length > 0) ? modifiedDishes : task.recognition.correct_dishes}
                        annotations={filteredAnnotations}
                        selectedDishIndex={selectedDishIndex}
                        onDeleteAnnotation={annotationManager.deleteAnnotation}
                      />
                    )}
                    
                    <BBoxAnnotator
                      imageUrl={`/api/bbox-images/${image.storage_path}`}
                      annotations={filteredAnnotations}
                      selectedAnnotation={selectedForThisImage || null}
                      highlightDishIndex={selectedDishIndex}
                      hoveredAnnotationId={annotationManager.hoveredAnnotationId}
                      drawingMode={annotationManager.isDrawing}
                      showControls={true}
                      onAnnotationHover={(annotation) => {
                        annotationManager.setHoveredAnnotationId(annotation?.id || null)
                      }}
                      onAnnotationCreate={(bbox) => {
                        const objectType = annotationManager.drawingObjectType || 'dish'
                        const metadata = annotationManager.drawingMetadata || {}
                        
                        annotationManager.createAnnotation({
                          image_id: image.id,
                          ...bbox,
                          object_type: objectType,
                          object_subtype: objectType === 'buzzer' ? metadata.color : null,
                          dish_index: selectedDishIndex,
                          custom_dish_name: null,
                          item_id: null, // ДОБАВЛЕНО: для buzzers/plates может быть null
                          is_overlapped: false,
                          is_deleted: false,
                          is_bottle_up: objectType === 'bottle' ? false : null,
                          is_error: false,
                          is_manual: true, // ДОБАВЛЕНО: рисование вручную
                          is_locked: false, // ДОБАВЛЕНО
                          version: 1, // ДОБАВЛЕНО
                          source: 'manual',
                          created_by: user.id,
                          updated_by: user.id,
                        })
                        annotationManager.stopDrawing()
                      }}
                      onAnnotationUpdate={(id, updates) => {
                        annotationManager.updateAnnotation(String(id), updates)
                      }}
                      onAnnotationSelect={(annotation) => {
                        annotationManager.setSelectedAnnotationId(annotation?.id ? String(annotation.id) : null)
                      }}
                      readOnly={false}
                    />
                  </div>
                  )
                }}
              </ImageGrid>
            </div>

            {/* Action buttons */}
            <div className="border-t border-gray-200 bg-white px-6 py-4">
              <ActionButtons
                onSave={handleSave}
                onComplete={taskManager.completeStep}
                onSkipStep={taskManager.skipStep}
                onSkipTask={taskManager.skipTask}
                onReset={handleReset}
                isSaving={taskManager.isSaving}
                hasUnsavedChanges={hasUnsavedChanges}
                canComplete={stepValidation.canComplete}
              />
            </div>
          </div>

          {/* Menu search panel (slide-in) */}
          {showMenuSearch && (
            <MenuSearchPanel
              menuItems={menuItems}
              onSelectDish={handleSelectFromMenu}
              onClose={() => setShowMenuSearch(false)}
            />
          )}
        </MainLayout>
      </AnnotationProvider>
    </TaskProvider>
  )
}

