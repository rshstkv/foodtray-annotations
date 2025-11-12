import { NextResponse } from 'next/server'

/**
 * Стандартизированные типы ответов API
 */

export type ApiSuccessResponse<T> = {
  success: true
  data: T
  message?: string
}

export type ApiErrorResponse = {
  success: false
  error: string
  code?: string
  details?: unknown
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

/**
 * Создать успешный ответ
 */
export function apiSuccess<T>(data: T, message?: string, status = 200) {
  return NextResponse.json<ApiSuccessResponse<T>>(
    {
      success: true,
      data,
      message
    },
    { status }
  )
}

/**
 * Создать ответ об ошибке
 */
export function apiError(
  error: string,
  status = 500,
  code?: string,
  details?: unknown
) {
  return NextResponse.json<ApiErrorResponse>(
    {
      success: false,
      error,
      code,
      details
    },
    { status }
  )
}

/**
 * Стандартные коды ошибок
 */
export const ApiErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NO_TASKS_AVAILABLE: 'NO_TASKS_AVAILABLE',
} as const

/**
 * Типизированный fetch для клиента
 */
export async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, options)
    const data = await res.json()
    
    // Если ответ не в нашем формате, преобразуем
    if (typeof data.success === 'undefined') {
      if (res.ok) {
        return {
          success: true,
          data: data as T
        }
      } else {
        return {
          success: false,
          error: data.error || data.message || 'Unknown error'
        }
      }
    }
    
    return data
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error'
    }
  }
}

