import type { BBox } from './domain'

export const DETECTION_CLASSES = {
  0: 'food',
  1: 'plate',
} as const

export type DetectionClassId = keyof typeof DETECTION_CLASSES
export type DetectionClassName = (typeof DETECTION_CLASSES)[DetectionClassId]

export const DETECTION_CLASS_COLORS: Record<DetectionClassId, string> = {
  0: '#3B82F6', // blue for food
  1: '#10B981', // green for plate
}

export interface YoloAnnotation {
  class: DetectionClassId
  x_center: number
  y_center: number
  width: number
  height: number
}

export type DetectionImageStatus = 'pending' | 'done'

export interface DetectionTask {
  id: number
  bucket_name: string
  images_count: number
  created_at: string
}

export interface DetectionTaskWithStats extends DetectionTask {
  done_count: number
  modified_count: number
  percent_completed: number
}

export interface DetectionImageTask {
  id: number
  task_id: number
  image_filename: string
  storage_path: string
  image_width: number | null
  image_height: number | null
  original_annotations: YoloAnnotation[]
  edited_annotations: YoloAnnotation[] | null
  status: DetectionImageStatus
  reviewed_by: string | null
  reviewed_at: string | null
  is_modified: boolean
  created_at: string
}

export interface DetectionExportImage {
  image: string
  original: YoloAnnotation[]
  edited: YoloAnnotation[]
  is_modified: boolean
  reviewed: boolean
}

export interface DetectionExportData {
  bucket_name: string
  exported_at: string
  images: DetectionExportImage[]
}

export interface DetectionTaskStats {
  total_images: number
  done_images: number
  percent_completed: number
  modified_count: number
  per_user: Array<{
    user_id: string
    email: string | null
    count: number
  }>
}

export { type BBox }
