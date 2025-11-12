/**
 * Типы для annotation системы (CLEAN SLATE версия)
 * Без legacy (workflow_state, validation_mode, etc.)
 */

// ============================================================================
// Core Entities
// ============================================================================

export interface Annotation {
  id: string
  image_id: string
  
  // Bounding box (normalized 0-1)
  bbox_x1: number
  bbox_y1: number
  bbox_x2: number
  bbox_y2: number
  
  // Классификация
  object_type: 'dish' | 'plate' | 'buzzer' | 'bottle' | 'nonfood'
  object_subtype: string | null  // 'vertical', 'horizontal' для bottle
  dish_index: number | null       // Связь с correct_dishes[index]
  custom_dish_name: string | null // Для блюд не из чека (добавленных из меню)
  
  // Флаги
  is_overlapped: boolean          // Блюдо перекрыто другим объектом
  is_bottle_up: boolean | null    // Для bottle: стоит вертикально
  is_error: boolean               // Есть ошибка валидации
  
  // Аудит
  source: 'qwen_auto' | 'manual'
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  
  // Soft delete
  is_deleted: boolean
}

export interface Image {
  id: string
  recognition_id: string
  
  image_type: 'main' | 'quality'
  storage_path: string
  
  width: number | null
  height: number | null
  
  // Оригинальные аннотации QWEN (для сравнения)
  original_annotations: unknown[] | null
  
  // Текущие аннотации
  annotations?: Annotation[]
  
  created_at: string
}

// Структура блюда из чека (как приходит из базы)
export interface DishFromReceipt {
  Count: number
  Dishes: Array<{
    Name: string
    ExternalId: string
  }>
}

// Плоская структура блюда для UI
export interface Dish {
  name: string
  count: number
  externalId: string
}

export interface Recognition {
  recognition_id: string
  recognition_date: string
  
  // Данные чека (raw формат из базы)
  correct_dishes: DishFromReceipt[]
  menu_all: unknown[] | null
  
  // Метаданные
  created_at: string
  updated_at: string
}

// ============================================================================
// Tasks & Workflow
// ============================================================================

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

export interface TaskStep {
  id: string
  name: string
  type: 'validation' | 'annotation'
  required: boolean
  allow_drawing: boolean
  allow_menu_edit?: boolean
  checks: string[]
}

export interface TaskScope {
  steps: TaskStep[]
  allow_menu_edit?: boolean
}

export interface StepProgress {
  id: string
  status: 'pending' | 'in_progress' | 'completed'
  started_at?: string
  completed_at?: string
  changes?: {
    added: number
    removed: number
    modified: number
  }
}

export interface TaskProgress {
  current_step_index: number
  steps: StepProgress[]
}

// ============================================================================
// Validated State (история валидации)
// ============================================================================

// Лог изменений (delta) - все изменения которые делает пользователь
export type ChangeLogEntry = 
  | { 
      type: 'dish_resolved'
      timestamp: string
      dish_index: number
      selected_name: string
      previous_names: string[]
    }
  | { 
      type: 'dish_count_changed'
      timestamp: string
      dish_index: number
      old_count: number
      new_count: number
    }
  | { 
      type: 'dish_added_from_menu'
      timestamp: string
      dish_name: string
      external_id: string
      count: number
    }
  | { 
      type: 'annotation_created'
      timestamp: string
      annotation_id: string
      object_type: string
      image_id: string
    }
  | { 
      type: 'annotation_deleted'
      timestamp: string
      annotation_id: string
      reason?: string
    }
  | { 
      type: 'annotation_moved'
      timestamp: string
      annotation_id: string
      old_bbox: [number, number, number, number]
      new_bbox: [number, number, number, number]
    }
  | { 
      type: 'overlap_marked'
      timestamp: string
      annotation_id: string
      is_overlapped: boolean
    }

// Snapshot состояния после завершения этапа
export interface StepSnapshot {
  validated_at: string
  validated_by: string
  snapshot: {
    dishes: DishFromReceipt[]
    annotations: {
      [image_id: string]: Annotation[]
    }
  }
  changes_log: ChangeLogEntry[]
}

// Полное валидированное состояние задачи
export interface ValidatedState {
  steps: {
    [step_id: string]: StepSnapshot
  }
  current_draft: {
    step_id: string
    changes_log: ChangeLogEntry[]
  } | null
}

export interface Task {
  id: string
  recognition_id: string
  
  // Назначение
  assigned_to: string | null
  
  // Scope и прогресс
  task_scope: TaskScope
  progress: TaskProgress
  
  // Валидированное состояние (snapshot после каждого этапа)
  validated_state: ValidatedState | null
  
  // Workflow
  status: TaskStatus
  priority: 1 | 2 | 3  // 1=quick, 2=medium, 3=heavy
  
  // Временные метки
  created_at: string
  started_at: string | null
  completed_at: string | null
  
  // Аудит
  created_by: string | null
  completed_by: string | null
  
  // Пропуск
  skipped_reason: string | null
  skipped_at: string | null
}

// ============================================================================
// Full Task Data (с join)
// ============================================================================

export interface TaskData extends Task {
  recognition: Recognition
  images: Image[]
}

// ============================================================================
// Local State (Frontend)
// ============================================================================

export type AnnotationChangeType = 'create' | 'update' | 'delete'

export interface AnnotationChange {
  type: AnnotationChangeType
  annotation: Partial<Annotation> & { id?: string; image_id: string }
  originalAnnotation?: Annotation  // Для update/delete
}

export interface LocalAnnotationState {
  annotations: Annotation[]
  changes: AnnotationChange[]
  hasUnsavedChanges: boolean
}

// ============================================================================
// Validation
// ============================================================================

export type ValidationCheckType = 'error' | 'warning' | 'info'

export interface ValidationCheck {
  type: ValidationCheckType
  message: string
  action?: string  // Подсказка что делать
  field?: string   // Какое поле проблемное
}

export interface ValidationResult {
  canComplete: boolean
  checks: ValidationCheck[]
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getDishColor(index: number): string {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4']
  return colors[index % colors.length]
}

export type CorrectDish = Dish

// ============================================================================
// Step Context (для UI)
// ============================================================================

export interface StepContext {
  step: TaskStep
  stepIndex: number
  stepProgress: StepProgress
  isActive: boolean
  isCompleted: boolean
  isPending: boolean
}

// ============================================================================
// BBox Drawing
// ============================================================================

export interface BBoxDrawingState {
  isDrawing: boolean
  startPoint: { x: number; y: number } | null
  currentPoint: { x: number; y: number } | null
  objectType: Annotation['object_type']
  objectSubtype: string | null
}

// ============================================================================
// User
// ============================================================================

export interface User {
  id: string
  email: string
  role: 'admin' | 'annotator'
  full_name?: string
  created_at: string
}

// ============================================================================
// API Responses
// ============================================================================

export interface ApiError {
  error: string
  details?: unknown
}

export interface TasksStatsResponse {
  pending: number
  in_progress: number
  completed: number
  skipped: number
  by_priority: {
    [key: number]: number
  }
}

export interface SaveAnnotationsRequest {
  task_id: string
  changes: AnnotationChange[]
}

export interface SaveAnnotationsResponse {
  success: boolean
  saved_count: number
  task_progress?: TaskProgress
}

export interface CompleteStepRequest {
  task_id: string
  step_id: string
}

export interface CompleteStepResponse {
  success: boolean
  next_step?: TaskStep
  task_completed: boolean
}

// ============================================================================
// Utility Types
// ============================================================================

export type ObjectTypeColor = {
  [K in Annotation['object_type']]: string
}

export const OBJECT_TYPE_COLORS: ObjectTypeColor = {
  dish: '#3B82F6',      // blue
  plate: '#10B981',     // green
  buzzer: '#F59E0B',    // amber
  bottle: '#8B5CF6',    // purple
  nonfood: '#6B7280',   // gray
}

export const OBJECT_TYPE_LABELS: { [K in Annotation['object_type']]: string } = {
  dish: 'Блюдо',
  plate: 'Тарелка',
  buzzer: 'Buzzer',
  bottle: 'Бутылка',
  nonfood: 'Другое',
}

export const PRIORITY_LABELS: { [key: number]: string } = {
  1: 'Быстрая',
  2: 'Средняя',
  3: 'Сложная',
}
