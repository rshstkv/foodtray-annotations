'use client'

import { use, useState, useEffect, useCallback } from 'react'
import { useUser } from '@/hooks/useUser'
import { useTaskManager } from '@/hooks/useTaskManager'
import { useAnnotationManager } from '@/hooks/useAnnotationManager'
import { useHotkeys } from '@/hooks/useHotkeys'
import { TaskProvider } from '@/contexts/TaskContext'
import { AnnotationProvider } from '@/contexts/AnnotationContext'
import { MainLayout } from '@/components/layout/MainLayout'
import { StepIndicator } from '@/components/StepIndicator'
import { ActionButtons } from '@/components/ActionButtons'
import { TaskSidebar } from '@/components/task/TaskSidebar'
import { ImageGrid } from '@/components/task/ImageGrid'
import { DishSelectionPanel } from '@/components/task/DishSelectionPanel'
import { BuzzerAnnotationPanel } from '@/components/task/BuzzerAnnotationPanel'
import { PlateAnnotationPanel } from '@/components/task/PlateAnnotationPanel'
import { OverlapAnnotationPanel } from '@/components/task/OverlapAnnotationPanel'
import { MenuSearchPanel } from '@/components/task/MenuSearchPanel'
import BBoxAnnotator from '@/components/BBoxAnnotator'
import { Skeleton } from '@/components/ui/skeleton'

export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const { user, isAdmin } = useUser()
  const [showAllBBoxes, setShowAllBBoxes] = useState(true)
  const [showMenuSearch, setShowMenuSearch] = useState(false)
  const [selectedDishIndex, setSelectedDishIndex] = useState<number | null>(null)
  const [modifiedDishes, setModifiedDishes] = useState<any[] | null>(null)

  // Initialize managers
  const taskManager = useTaskManager(resolvedParams.id)
  const annotationManager = useAnnotationManager(taskManager.task?.images || [])

  // Initialize annotations when task loads
  useEffect(() => {
    if (taskManager.task?.images) {
      const allAnnotations = taskManager.task.images.flatMap(img => img.annotations || [])
      annotationManager.setAnnotations(allAnnotations)
    }
  }, [taskManager.task?.images])

  // Initialize modified_dishes from task_scope
  useEffect(() => {
    if (taskManager.task?.task_scope?.modified_dishes) {
      setModifiedDishes(taskManager.task.task_scope.modified_dishes)
    }
  }, [taskManager.task?.task_scope])

  // Handler for dish selection
  const handleSelectDish = useCallback((dishIndex: number) => {
    setSelectedDishIndex(dishIndex)
    annotationManager.setHighlightedDishIndex(dishIndex)

    // Select first annotation of this dish
    const dishAnnotations = annotationManager.annotations.filter(
      a => a.object_type === 'dish' && a.dish_index === dishIndex && !a.is_deleted
    )
    if (dishAnnotations.length > 0) {
      annotationManager.setSelectedAnnotationId(dishAnnotations[0].id)
    }
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
    const dishes = modifiedDishes || taskManager.task.recognition.correct_dishes
    const updatedDishes = [...dishes]
    updatedDishes[dishIndex] = {
      ...updatedDishes[dishIndex],
      Count: Math.max(0, newCount) // Ensure non-negative
    }
    setModifiedDishes(updatedDishes)
    annotationManager.setHasUnsavedChanges(true)
  }, [modifiedDishes, taskManager.task, annotationManager])

  // Setup hotkeys (AFTER all handlers to avoid initialization errors)
  useHotkeys({
    taskManager,
    annotationManager,
    onToggleVisibility: () => setShowAllBBoxes(prev => !prev),
    onSelectDish: handleSelectDish,
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
            {/* Step indicator */}
            <div className="border-b border-gray-200 bg-white px-6 py-4">
              <StepIndicator
                steps={taskManager.allSteps}
                currentStepIndex={taskManager.currentStepIndex}
              />
            </div>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar */}
              <TaskSidebar currentStep={currentStep}>
                {currentStep.step.id === 'validate_dishes' && (
                  <DishSelectionPanel
                    dishesFromReceipt={modifiedDishes || task.recognition.correct_dishes}
                    annotations={annotationManager.annotations}
                    images={task.images}
                    selectedDishIndex={selectedDishIndex}
                    onSelectDish={handleSelectDish}
                    onAddFromMenu={handleAddFromMenu}
                    onDishCountChange={handleDishCountChange}
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

                {currentStep.step.id === 'check_overlaps' && (
                  <OverlapAnnotationPanel
                    images={task.images}
                    annotations={annotationManager.annotations}
                    selectedAnnotationId={annotationManager.selectedAnnotationId}
                    dishNames={(() => {
                      const dishes = modifiedDishes || task.recognition.correct_dishes
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
              <ImageGrid images={task.images}>
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
                    a => a.image_id === image.id && relevantTypes.includes(a.object_type)
                  )
                  
                  // Если выбрано блюдо (selectedDishIndex), подсвечиваем bbox этого блюда на текущей картинке
                  const selectedForThisImage = selectedDishIndex !== null
                    ? filteredAnnotations.find(a => a.object_type === 'dish' && a.dish_index === selectedDishIndex)
                    : annotationManager.annotations.find(
                        a => a.id === annotationManager.selectedAnnotationId && a.image_id === image.id
                      )
                  
                  return (
                  <BBoxAnnotator
                    imageUrl={`/api/bbox-images/${image.storage_path}`}
                    annotations={filteredAnnotations}
                    selectedAnnotation={selectedForThisImage || null}
                    highlightDishIndex={null}
                    drawingMode={annotationManager.isDrawing}
                    showControls={true}
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
                        is_overlapped: false,
                        is_deleted: false,
                        is_bottle_up: objectType === 'bottle' ? false : null,
                        is_error: false,
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
                  )
                }}
              </ImageGrid>
            </div>

            {/* Action buttons */}
            <div className="border-t border-gray-200 bg-white px-6 py-4">
              <ActionButtons
                onSave={taskManager.saveProgress}
                onComplete={taskManager.completeStep}
                onSkipStep={taskManager.skipStep}
                onSkipTask={taskManager.skipTask}
                onReset={annotationManager.resetChanges}
                isSaving={taskManager.isSaving}
                hasUnsavedChanges={annotationManager.hasUnsavedChanges}
                canComplete={taskManager.canGoNext || taskManager.currentStepIndex === taskManager.allSteps.length - 1}
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

