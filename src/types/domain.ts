/**
 * Domain Types для RRS Annotation System
 * Соответствует новой архитектуре БД без tasks
 */

// ============================================================================
// Enums
// ============================================================================

export type UserRole = 'admin' | 'editor' | 'viewer'

export type ItemType = 'FOOD' | 'BUZZER' | 'PLATE' | 'BOTTLE' | 'OTHER'

export type BuzzerColor = 'green' | 'blue' | 'red' | 'white'

export type BottleOrientation = 'horizontal' | 'vertical'

export type TrayItemSource = 'RECIPE_LINE_OPTION' | 'MENU_ITEM' | 'MANUAL' | 'MODEL'

export type ValidationType =
  | 'FOOD_VALIDATION'
  | 'PLATE_VALIDATION'
  | 'BUZZER_VALIDATION'
  | 'OCCLUSION_VALIDATION'
  | 'BOTTLE_ORIENTATION_VALIDATION'

export type WorkLogStatus = 'in_progress' | 'completed' | 'abandoned'

// ============================================================================
// User & Auth
// ============================================================================

export interface Profile {
  id: string
  email: string
  role: UserRole
  full_name: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// Recognition & Images
// ============================================================================

export interface Recognition {
  id: number
  batch_id: string | null
  created_at: string
}

export interface Image {
  id: number
  recognition_id: number
  camera_number: 1 | 2
  storage_path: string
  width: number | null
  height: number | null
  created_at: string
}

// ============================================================================
// Recipe (Check)
// ============================================================================

export interface Recipe {
  id: number
  recognition_id: number
  raw_payload: unknown
  total_amount: number | null
  created_at: string
}

export interface RecipeLine {
  id: number
  recipe_id: number
  line_number: number
  quantity: number
  has_ambiguity: boolean
  raw_name: string | null
  created_at: string
}

export interface RecipeLineOption {
  id: number
  recipe_line_id: number
  external_id: string
  name: string
  is_selected: boolean
  model_score: number | null
  created_at: string
}

// ============================================================================
// Active Menu
// ============================================================================

export interface ActiveMenuItem {
  external_id: string
  name: string
  category?: string
  price?: number
  [key: string]: unknown
}

// ============================================================================
// Tray Items (Physical Objects)
// ============================================================================

export interface InitialTrayItem {
  id: number
  recognition_id: number
  item_type: ItemType
  source: TrayItemSource
  recipe_line_option_id: number | null
  menu_item_external_id: string | null
  metadata: Record<string, unknown> | null
  bottle_orientation: BottleOrientation | null
  created_at: string
}

// Рабочая копия объекта для validation сессии
// Копируется из initial_tray_items при создании work_log
export interface WorkItem {
  id: number
  work_log_id: number
  initial_item_id: number | null // NULL для новых объектов
  recognition_id: number
  type: ItemType
  recipe_line_id: number | null
  quantity: number
  bottle_orientation: BottleOrientation | null
  is_deleted: boolean
  created_at: string
  updated_at: string
}

// Alias для UI (используем WorkItem напрямую)
export type TrayItem = WorkItem & {
  is_modified: boolean // всегда true для work_items (все отредактированные)
}

// ============================================================================
// Annotations (Visual Layer)
// ============================================================================

export interface BBox {
  x: number
  y: number
  w: number
  h: number
}

export interface InitialAnnotation {
  id: number
  image_id: number
  initial_tray_item_id: number
  bbox: BBox
  source: string
  is_occluded: boolean
  created_at: string
}

// Рабочая копия аннотации для validation сессии
// Копируется из initial_annotations при создании work_log
export interface WorkAnnotation {
  id: number
  work_log_id: number
  initial_annotation_id: number | null // NULL для новых аннотаций
  image_id: number
  work_item_id: number
  bbox: BBox
  is_deleted: boolean
  is_occluded: boolean
  occlusion_metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// Alias для UI (используем WorkAnnotation напрямую)
export type AnnotationView = WorkAnnotation & {
  is_modified: boolean // всегда true для work_annotations
  is_temp?: boolean // true для временных (еще не сохраненных)
}

// ============================================================================
// Validation System
// ============================================================================

export interface ValidationPriorityConfig {
  id: number
  validation_type: ValidationType
  priority: number
  order_in_session: number
  effective_from_date: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ValidationWorkLog {
  id: number
  recognition_id: number
  validation_type: ValidationType
  assigned_to: string
  started_at: string
  completed_at: string | null
  status: WorkLogStatus
  created_at: string
}

// ============================================================================
// Validation Session (для UI)
// ============================================================================

export interface ValidationSession {
  workLog: ValidationWorkLog
  recognition: Recognition
  images: Image[]
  recipe: Recipe | null
  recipeLines: RecipeLine[]
  recipeLineOptions: RecipeLineOption[]
  activeMenu: ActiveMenuItem[]
  items: TrayItem[]
  annotations: AnnotationView[]
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface StartValidationResponse {
  workLog: ValidationWorkLog
  recognition: Recognition
  images: Image[]
  recipe: Recipe | null
  recipeLines: RecipeLine[]
  recipeLineOptions: RecipeLineOption[]
  activeMenu: ActiveMenuItem[]
  workItems: WorkItem[] // Рабочие копии (уже скопированы триггером)
  workAnnotations: WorkAnnotation[] // Рабочие копии (уже скопированы триггером)
}

export interface ValidationSessionResponse {
  session: ValidationSession
}

export interface CreateItemRequest {
  work_log_id: number
  recognition_id: number
  type: ItemType
  recipe_line_id?: number | null
  quantity?: number
}

export interface UpdateItemRequest {
  type?: ItemType
  recipe_line_id?: number | null
  quantity?: number
  bottle_orientation?: BottleOrientation | null
  is_deleted?: boolean
}

export interface CreateAnnotationRequest {
  work_log_id: number
  image_id: number
  work_item_id: number
  bbox: BBox
  is_occluded?: boolean
  occlusion_metadata?: Record<string, unknown> | null
}

export interface UpdateAnnotationRequest {
  bbox?: BBox
  work_item_id?: number
  is_occluded?: boolean
  occlusion_metadata?: Record<string, unknown> | null
  is_deleted?: boolean
}

// DEPRECATED: не используется в новой архитектуре (каждая операция выполняется отдельно)
export interface BatchSaveAnnotationsRequest {
  recognition_id: number
  created: Array<any>
  updated: Array<any>
  deleted: number[]
}

export interface CompleteValidationRequest {
  work_log_id: number
}

export interface AbandonValidationRequest {
  work_log_id: number
  reason?: string
}

// ============================================================================
// Utility Types
// ============================================================================

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  FOOD: 'Блюдо',
  PLATE: 'Тарелка',
  BUZZER: 'Пейджер',
  BOTTLE: 'Бутылка',
  OTHER: 'Другое',
}

export const ITEM_TYPE_COLORS: Record<ItemType, string> = {
  FOOD: '#3B82F6', // blue
  PLATE: '#10B981', // green
  BUZZER: '#F59E0B', // amber
  BOTTLE: '#8B5CF6', // purple
  OTHER: '#6B7280', // gray
}

export const VALIDATION_TYPE_LABELS: Record<ValidationType, string> = {
  FOOD_VALIDATION: 'Валидация блюд',
  PLATE_VALIDATION: 'Валидация тарелок',
  BUZZER_VALIDATION: 'Валидация пейджеров',
  OCCLUSION_VALIDATION: 'Валидация окклюзий',
  BOTTLE_ORIENTATION_VALIDATION: 'Валидация ориентации бутылок',
}

export const BUZZER_COLOR_LABELS: Record<BuzzerColor, string> = {
  green: 'Зеленый',
  blue: 'Синий',
  red: 'Красный',
  white: 'Белый',
}

// Helper to get item type from validation type
export function getItemTypeFromValidationType(
  validationType: ValidationType
): ItemType | null {
  switch (validationType) {
    case 'FOOD_VALIDATION':
      return 'FOOD'
    case 'PLATE_VALIDATION':
      return 'PLATE'
    case 'BUZZER_VALIDATION':
      return 'BUZZER'
    case 'BOTTLE_ORIENTATION_VALIDATION':
      return 'BOTTLE'
    case 'OCCLUSION_VALIDATION':
      return null // Occlusion is not a specific item type
    default:
      return null
  }
}

// Преобразует WorkItem в TrayItem для UI
export function workItemToTrayItem(item: WorkItem): TrayItem {
  return {
    ...item,
    is_modified: true,
  }
}

// DEPRECATED: старая функция merge, больше не используется
export function mergeItems(
  initial: InitialTrayItem[],
  current: any[]
): TrayItem[] {
  const currentMap = new Map<number | null, CurrentTrayItem>()
  
  // Map current items by initial_tray_item_id
  current.forEach((item) => {
    if (item.initial_tray_item_id !== null) {
      currentMap.set(item.initial_tray_item_id, item)
    }
  })

  const merged: TrayItem[] = []

  // Add initial items (potentially overridden by current)
  initial.forEach((item) => {
    const currentItem = currentMap.get(item.id)
    if (currentItem) {
      // Use current version
      merged.push({
        id: currentItem.id,
        recognition_id: currentItem.recognition_id,
        item_type: currentItem.item_type,
        source: currentItem.source,
        recipe_line_option_id: currentItem.recipe_line_option_id,
        menu_item_external_id: currentItem.menu_item_external_id,
        metadata: currentItem.metadata,
        is_modified: true,
        is_deleted: currentItem.is_deleted,
        created_by: currentItem.created_by,
        created_at: currentItem.created_at,
        updated_at: currentItem.updated_at,
      })
    } else {
      // Use initial version
      merged.push({
        id: item.id,
        recognition_id: item.recognition_id,
        item_type: item.item_type,
        source: item.source,
        recipe_line_option_id: item.recipe_line_option_id,
        menu_item_external_id: item.menu_item_external_id,
        metadata: item.metadata,
        is_modified: false,
        is_deleted: false,
        created_by: null,
        created_at: item.created_at,
        updated_at: item.created_at,
      })
    }
  })

  // Add newly created current items (initial_tray_item_id is null)
  current.forEach((item) => {
    if (item.initial_tray_item_id === null) {
      merged.push({
        id: item.id,
        recognition_id: item.recognition_id,
        item_type: item.item_type,
        source: item.source,
        recipe_line_option_id: item.recipe_line_option_id,
        menu_item_external_id: item.menu_item_external_id,
        metadata: item.metadata,
        is_modified: true,
        is_deleted: item.is_deleted,
        created_by: item.created_by,
        created_at: item.created_at,
        updated_at: item.updated_at,
      })
    }
  })

  return merged.filter((item) => !item.is_deleted)
}

// Преобразует WorkAnnotation в AnnotationView для UI
export function workAnnotationToView(annotation: WorkAnnotation): AnnotationView {
  return {
    ...annotation,
    is_modified: true,
    is_temp: false,
  }
}

// DEPRECATED: старая функция merge, больше не используется
export function mergeAnnotations(
  initial: InitialAnnotation[],
  current: any[],
  images?: Image[]
): AnnotationView[] {
  const currentMap = new Map<number, Annotation>()
  
  // Map current annotations by initial_tray_item_id
  current.forEach((ann) => {
    if (ann.initial_tray_item_id !== null) {
      const key = `${ann.image_id}-${ann.initial_tray_item_id}`
      currentMap.set(ann.initial_tray_item_id, ann)
    }
  })

  const merged: AnnotationView[] = []

  // Add initial annotations (potentially overridden by current)
  initial.forEach((ann) => {
    const currentAnn = currentMap.get(ann.initial_tray_item_id)
    if (currentAnn) {
      // Use current version
      merged.push({
        id: currentAnn.id,
        image_id: currentAnn.image_id,
        tray_item_id: currentAnn.current_tray_item_id || currentAnn.initial_tray_item_id || 0,
        bbox: currentAnn.bbox,
        is_modified: true,
        is_deleted: currentAnn.is_deleted,
        is_occluded: currentAnn.is_occluded,
        occlusion_metadata: currentAnn.occlusion_metadata,
        is_temp: false,
        created_by: currentAnn.created_by,
        created_at: currentAnn.created_at,
        updated_at: currentAnn.updated_at,
      })
    } else {
      // Use initial version
      merged.push({
        id: ann.id,
        image_id: ann.image_id,
        tray_item_id: ann.initial_tray_item_id,
        bbox: ann.bbox,
        is_modified: false,
        is_deleted: false,
        is_occluded: ann.is_occluded,
        occlusion_metadata: null,
        is_temp: false,
        created_by: null,
        created_at: ann.created_at,
        updated_at: ann.created_at,
      })
    }
  })

  // Add newly created current annotations (initial_tray_item_id is null)
  current.forEach((ann) => {
    if (ann.initial_tray_item_id === null && ann.current_tray_item_id !== null) {
      merged.push({
        id: ann.id,
        image_id: ann.image_id,
        tray_item_id: ann.current_tray_item_id,
        bbox: ann.bbox,
        is_modified: true,
        is_deleted: ann.is_deleted,
        is_occluded: ann.is_occluded,
        occlusion_metadata: ann.occlusion_metadata,
        is_temp: false,
        created_by: ann.created_by,
        created_at: ann.created_at,
        updated_at: ann.updated_at,
      })
    }
  })

  return merged.filter((ann) => !ann.is_deleted)
}

