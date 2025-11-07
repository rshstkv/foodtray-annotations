/**
 * Type-safe API Client для annotation системы
 * Обертка над fetch с error handling, retry logic, loading states
 */

import type {
  TaskData,
  TaskResult,
  APIResponse,
  Annotation,
  CreateAnnotationPayload,
  UpdateAnnotationPayload,
  Recognition,
  TaskStatsResponse,
} from '@/types/annotations'

class AnnotationClient {
  private baseUrl: string

  constructor(baseUrl: string = '/api/annotations') {
    this.baseUrl = baseUrl
  }

  /**
   * Generic fetch wrapper с error handling
   */
  private async fetch<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<APIResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          error: data.error || `Request failed with status ${response.status}`,
        }
      }

      return { data }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  // ==========================================================================
  // Tasks API
  // ==========================================================================

  /**
   * Получить следующую задачу
   */
  async getNextTask(
    taskType: string, 
    tier?: number, 
    queue?: 'pending' | 'requires_correction',
    minTier?: number,
    maxTier?: number
  ): Promise<APIResponse<TaskData>> {
    const params = new URLSearchParams({ task_type: taskType })
    if (tier) params.append('tier', tier.toString())
    if (queue) params.append('queue', queue)
    if (minTier) params.append('min_tier', minTier.toString())
    if (maxTier) params.append('max_tier', maxTier.toString())
    
    return this.fetch<TaskData>(`/tasks/next?${params.toString()}`)
  }

  /**
   * Завершить задачу
   */
  async completeTask(
    recognitionId: string,
    stageId: number,
    result?: TaskResult
  ): Promise<APIResponse<void>> {
    return this.fetch<void>(`/tasks/${recognitionId}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        stage_id: stageId,
        move_to_next: true,
        changes: result?.changes || {},
      }),
    })
  }

  /**
   * Пропустить задачу
   */
  async skipTask(recognitionId: string): Promise<APIResponse<void>> {
    return this.fetch<void>(`/tasks/${recognitionId}/skip`, {
      method: 'POST',
    })
  }

  /**
   * Отметить задачу флагом (ошибка в блюдах, чеке, требует ревью)
   */
  async flagTask(
    recognitionId: string,
    flagType: 'dish_error' | 'check_error' | 'manual_review',
    reason?: string
  ): Promise<APIResponse<void>> {
    return this.fetch<void>(`/tasks/${recognitionId}/flag`, {
      method: 'POST',
      body: JSON.stringify({ flag_type: flagType, reason }),
    })
  }

  /**
   * Освободить задачу (release)
   */
  async releaseTask(recognitionId: string): Promise<APIResponse<void>> {
    return this.fetch<void>(`/tasks/${recognitionId}/release`, {
      method: 'POST',
    })
  }

  /**
   * Получить статистику по задачам
   */
  async getTaskStats(taskType: string): Promise<APIResponse<TaskStatsResponse>> {
    return this.fetch<TaskStatsResponse>(`/tasks/stats?task_type=${taskType}`)
  }

  // ==========================================================================
  // Annotations API
  // ==========================================================================

  /**
   * Создать аннотацию
   */
  async createAnnotation(
    payload: CreateAnnotationPayload
  ): Promise<APIResponse<Annotation>> {
    return this.fetch<Annotation>('/annotations', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  /**
   * Обновить аннотацию
   */
  async updateAnnotation(
    id: number,
    payload: UpdateAnnotationPayload
  ): Promise<APIResponse<Annotation>> {
    return this.fetch<Annotation>(`/annotations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  /**
   * Удалить аннотацию
   */
  async deleteAnnotation(id: number): Promise<APIResponse<void>> {
    return this.fetch<void>(`/annotations/${id}`, {
      method: 'DELETE',
    })
  }

  // ==========================================================================
  // Recognitions API
  // ==========================================================================

  /**
   * Обновить recognition
   */
  async updateRecognition(
    recognitionId: string,
    payload: Partial<Recognition>
  ): Promise<APIResponse<Recognition>> {
    return this.fetch<Recognition>(`/recognitions/${recognitionId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  /**
   * Получить историю recognition
   */
  async getRecognitionHistory(
    recognitionId: string
  ): Promise<APIResponse<unknown[]>> {
    return this.fetch<unknown[]>(`/recognitions/${recognitionId}/history`)
  }
}

// Singleton instance
export const annotationClient = new AnnotationClient()

// Export class for testing or custom instances
export default AnnotationClient

