/**
 * Единый источник типов для annotation системы
 * Используется во всех компонентах, hooks и API
 */

// ============================================================================
// Core Entities
// ============================================================================

export interface Annotation {
  id: number
  image_id: number
  bbox_x1: number
  bbox_y1: number
  bbox_x2: number
  bbox_y2: number
  object_type: 'food' | 'buzzer' | 'plate' | 'non_food' | 'tray'
  object_subtype: string | null
  dish_index: number | null
  is_overlapped: boolean
  is_bottle_up: boolean | null
  is_error: boolean
  source: 'qwen_auto' | 'manual'
  qwen_detection_index?: number | null
  qwen_detection_type?: string | null
  created_at?: string
  updated_at?: string
}

export interface Image {
  id: number
  recognition_id: string
  photo_type: 'Main' | 'Qualifying'
  storage_path: string
  image_width: number | null
  image_height: number | null
  original_annotations?: {
    qwen_dishes_detections?: unknown[]
    qwen_plates_detections?: unknown[]
  } | null
  annotations: Annotation[]
  created_at?: string
}

export interface Dish {
  Name: string
  ean?: string
}

export interface CorrectDish {
  Count: number
  Dishes: Dish[]
}

export interface Recognition {
  id?: number
  recognition_id: string
  recognition_date: string
  status?: string
  is_mistake?: boolean
  correct_dishes: CorrectDish[]
  menu_all?: unknown[]
  validation_mode?: 'quick' | 'edit' | null
  workflow_state: WorkflowState
  current_stage_id: number | null
  completed_stages: number[]
  assigned_to: string | null
  started_at: string | null
  completed_at: string | null
  completed_by?: string | null
  annotator_notes?: string | null
  created_at?: string
  updated_at?: string
}

// ============================================================================
// Workflow
// ============================================================================

export type WorkflowState = 
  | 'pending' 
  | 'in_progress' 
  | 'completed' 
  | 'requires_correction'
  | 'check_error_pending'
  | 'dish_correction_pending'
  | 'manual_review_pending'

export interface TaskType {
  id: number
  code: string
  name: string
  description: string
  ui_config: TaskUIConfig
  is_active: boolean
  created_at: string
}

export interface TaskUIConfig {
  layout: 'single-image' | 'dual-image'
  actions: {
    bbox_create?: boolean
    bbox_delete?: boolean
    bbox_assign_dish?: boolean
    bbox_resize?: boolean
    bbox_drag?: boolean
    bbox_toggle_overlap?: boolean
    bbox_toggle_bottle?: boolean
    bbox_change_type?: boolean
    correct_dish_select?: boolean
    correct_dish_change_count?: boolean
  }
  ui: {
    show_both_images?: boolean
    show_menu_search?: boolean
    focus_mode?: 'bbox' | 'dishes' | 'attributes'
    quick_keys?: Record<string, string>
    simplified_controls?: boolean
    auto_next?: boolean
    sync_dish_highlight?: boolean
    buttons?: string[]
  }
  filters?: {
    object_types?: string[]
    dish_codes?: string[]
  }
}

export interface WorkflowStage {
  id: number
  task_type_id: number
  stage_order: number
  name: string
  skip_condition: Record<string, unknown> | null
  is_optional: boolean
  created_at: string
}

// ============================================================================
// Task Data
// ============================================================================

export interface TaskData {
  recognition: Recognition
  images: Image[]
  menu_all?: unknown[]
  task_type: TaskType
  stage: WorkflowStage
}

export interface TaskResult {
  success: boolean
  changes?: Record<string, unknown>
  flag_type?: 'dish_error' | 'check_error' | 'manual_review'
  reason?: string
}

// ============================================================================
// API Responses
// ============================================================================

export interface APIResponse<T = unknown> {
  data?: T
  error?: string
  message?: string
}

export interface TaskStatsResponse {
  task_type: string
  total: number
  pending: number
  in_progress: number
  completed: number
  by_tier: Record<number, number>
}

// ============================================================================
// UI State
// ============================================================================

export interface TaskEngineState {
  taskData: TaskData | null
  loading: boolean
  error: string | null
  completing: boolean
}

export type TaskEngineAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: TaskData }
  | { type: 'FETCH_ERROR'; payload: string }
  | { type: 'COMPLETE_START' }
  | { type: 'COMPLETE_SUCCESS' }
  | { type: 'COMPLETE_ERROR'; payload: string }
  | { type: 'RESET' }

// ============================================================================
// Annotation Operations
// ============================================================================

export interface CreateAnnotationPayload {
  image_id: number
  object_type: Annotation['object_type']
  object_subtype: string | null
  dish_index: number | null
  bbox_x1: number
  bbox_y1: number
  bbox_x2: number
  bbox_y2: number
  is_overlapped?: boolean
  is_bottle_up?: boolean | null
  is_error?: boolean
}

export interface UpdateAnnotationPayload {
  bbox_x1?: number
  bbox_y1?: number
  bbox_x2?: number
  bbox_y2?: number
  dish_index?: number | null
  object_type?: Annotation['object_type']
  object_subtype?: string | null
  is_overlapped?: boolean
  is_bottle_up?: boolean | null
  is_error?: boolean
  current_bbox_x1?: number
  current_bbox_y1?: number
  current_bbox_x2?: number
  current_bbox_y2?: number
}

// ============================================================================
// BBox Annotator Props
// ============================================================================

export interface BBoxAnnotatorProps {
  imageUrl: string
  annotations: Annotation[]
  selectedDishIndex?: number | null
  highlightDishIndex?: number | null
  dishNames?: Record<number, string>
  originalAnnotations?: Image['original_annotations']
  imageId?: number
  onAnnotationCreate?: (bbox: {
    bbox_x1: number
    bbox_y1: number
    bbox_x2: number
    bbox_y2: number
  }) => void
  onAnnotationUpdate?: (id: number, updates: UpdateAnnotationPayload) => void
  onAnnotationSelect?: (annotation: Annotation | null) => void
  selectedAnnotation?: Annotation | null
  drawingMode?: boolean
  readOnly?: boolean
  referenceWidth?: number
  referenceHeight?: number
}

// ============================================================================
// Dish Colors
// ============================================================================

export const DISH_COLORS = [
  '#22c55e', // green-500
  '#3b82f6', // blue-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#84cc16', // lime-500
] as const

export function getDishColor(index: number): string {
  return DISH_COLORS[index % DISH_COLORS.length]
}

// ============================================================================
// Workflow & Queue Types
// ============================================================================

export type WorkflowQueue = 'pending' | 'requires_correction'

export type TaskMode = 'quick' | 'edit'

// ============================================================================
// Export Types
// ============================================================================

export interface ExportFilters {
  tier?: number[]
  workflow_state?: string[]
  completed_stages?: string[]
  date_from?: string
  date_to?: string
}

// ============================================================================
// Dish EAN Metadata
// ============================================================================

export interface DishEanMetadata {
  id: number
  ean: string
  dish_name: string
  requires_bottle_orientation: boolean
  created_at: string
  updated_at: string
}

// ============================================================================
// Task Statistics
// ============================================================================

export interface TaskStats {
  quick_validation: number  // M=Q=expected, pending
  edit_mode: number          // M≠Q or M≠expected, pending
  requires_correction: number
  bottle_orientation: number
  buzzer_annotation: number
  non_food_objects: number
  completed: number
}

