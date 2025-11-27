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

export type ValidationStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

export type PriorityFilterType = 
  | 'any'
  | 'unresolved_ambiguity'
  | 'food_annotation_mismatch'
  | 'plate_annotation_mismatch'
  | 'annotation_mismatch'
  | 'has_ambiguity'
  | 'clean_ambiguity'
  | 'has_food_items'
  | 'has_plates'
  | 'has_buzzers'
  | 'no_annotations'

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

// Рабочая копия объекта для validation сессии
export interface WorkItem {
  id: number
  work_log_id: number
  initial_item_id: number | null // NULL для новых объектов
  recognition_id: number
  type: ItemType
  recipe_line_id: number | null
  quantity: number
  bottle_orientation: BottleOrientation | null
  metadata: Record<string, any> | null // Для BUZZER: {color}, для кастомных: {label}
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

// Рабочая копия аннотации для validation сессии
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
  order_in_session: number
  effective_from_date: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// Multi-step validation step
export interface ValidationStep {
  type: ValidationType
  status: ValidationStepStatus
  order: number
}

export interface ValidationWorkLog {
  id: number
  recognition_id: number
  validation_type: ValidationType // Для backward compatibility (текущий/первый тип)
  assigned_to: string
  started_at: string
  completed_at: string | null
  status: WorkLogStatus
  created_at: string
  updated_at?: string
  // Multi-step fields
  validation_steps?: ValidationStep[] | null
  current_step_index?: number
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
  bottle_orientation?: BottleOrientation | null
  metadata?: Record<string, any> | null
  selected_option_id?: number | null
}

export interface UpdateItemRequest {
  type?: ItemType
  recipe_line_id?: number | null
  selected_option_id?: number // Для разрешения неопределенности (помечает option как is_selected)
  quantity?: number
  bottle_orientation?: BottleOrientation | null
  metadata?: Record<string, any> | null
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

export interface NextStepRequest {
  work_log_id: number
}

export interface NextStepResponse {
  success: boolean
  new_step_index: number
  current_step: ValidationStep
  all_completed: boolean
}

export interface SkipStepRequest {
  work_log_id: number
}

export interface SkipStepResponse {
  success: boolean
  new_step_index: number
  current_step: ValidationStep
}

export interface JumpToStepRequest {
  work_log_id: number
  target_step_index: number
}

export interface JumpToStepResponse {
  success: boolean
  new_step_index: number
  current_step: ValidationStep
}

export interface AbandonAndGetNextRequest {
  work_log_id: number
}

export interface AbandonAndGetNextResponse {
  next_task?: StartValidationResponse
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

export const BUZZER_COLOR_HEX: Record<BuzzerColor, string> = {
  green: '#10B981', // green
  blue: '#3B82F6', // blue
  red: '#EF4444', // red
  white: '#E5E7EB', // light gray
}

// Helper to get item color
export function getItemColor(item: WorkItem | TrayItem): string {
  // For BUZZER type, use the specific buzzer color from metadata
  if (item.type === 'BUZZER' && item.metadata?.color) {
    const buzzerColor = item.metadata.color as BuzzerColor
    return BUZZER_COLOR_HEX[buzzerColor] || ITEM_TYPE_COLORS.BUZZER
  }
  // For all other types, use the default color mapping
  return ITEM_TYPE_COLORS[item.type]
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
      return 'FOOD' // Бутылка это просто FOOD с bottle_orientation флагом
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

// Преобразует WorkAnnotation в AnnotationView для UI
export function workAnnotationToView(annotation: WorkAnnotation): AnnotationView {
  return {
    ...annotation,
    is_modified: true,
    is_temp: false,
  }
}

// ============================================================================
// Export Types
// ============================================================================

export interface ValidationExportItem {
  item_id: number
  item_type: ItemType
  external_id: string | null
  name: string | null
  quantity: number
  bottle_orientation: BottleOrientation | null
  metadata: Record<string, any> | null
}

export interface ValidationExportAnnotation {
  item_id: number
  bbox: BBox
  is_occluded: boolean
  occlusion_metadata: Record<string, unknown> | null
  was_modified: boolean
  original_bbox: BBox | null
}

export interface ValidationExportImage {
  camera_number: 1 | 2
  image_name: 'Main' | 'Qualifying'
  storage_path: string
  width: number | null
  height: number | null
  annotations: ValidationExportAnnotation[]
}

export interface ValidationExportRecipe {
  items: ValidationExportItem[]
}

export interface ValidationExportMetadata {
  work_log_id: number
  assigned_to: string
  assigned_to_email: string
  completed_at: string
  validation_steps: Array<{
    type: ValidationType
    status: 'completed' | 'skipped' | 'pending'
    order: number
  }>
}

export interface ValidationExportRecognition {
  recognition_id: number
  batch_id: string | null
  validation_metadata?: ValidationExportMetadata
  recipe: ValidationExportRecipe
  images: ValidationExportImage[]
}

export interface ValidationExportData {
  recognitions: ValidationExportRecognition[]
}

// Export Preview Statistics
export interface ExportPreviewStats {
  total_recognitions: number
  total_items: Record<ItemType, number>
  total_annotations: number
  modified_annotations: number
  unmodified_annotations: number
  users_breakdown: Array<{
    user_id: string
    email: string
    recognitions_count: number
    items_count: number
    annotations_count: number
  }>
  validation_steps_breakdown: Record<ValidationType, {
    completed: number
    skipped: number
    pending: number
  }>
}

export interface ExportPreviewData {
  stats: ExportPreviewStats
  recognitions: Array<{
    recognition_id: number
    batch_id: string | null
    items_by_type: Record<ItemType, number>
    annotations_count: number
    modified_annotations_count: number
    validation_steps: ValidationExportMetadata['validation_steps']
    assigned_users: Array<{
      user_id: string
      email: string
    }>
  }>
  pagination: {
    page: number
    pageSize: number
    totalPages: number
    totalItems: number
  }
}

// Completed validation list for admin statistics
export interface CompletedValidationInfo {
  validation_type: ValidationType
  work_log_id: number
  completed_at: string
  assigned_to: string
  assigned_to_email?: string
}

export interface RecognitionWithValidations {
  recognition_id: number
  batch_id: string | null
  completed_validations: CompletedValidationInfo[]
}

