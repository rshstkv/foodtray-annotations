/**
 * Утилиты для оптимизации производительности
 */

// Функция для мониторинга производительности
export function measurePerformance<T>(
  name: string,
  fn: () => T | Promise<T>
): T | Promise<T> {
  if (typeof window === 'undefined' || !window.performance) {
    return fn()
  }

  const start = performance.now()
  const result = fn()

  if (result instanceof Promise) {
    return result.then((value) => {
      const end = performance.now()
      console.debug(`⏱️ ${name}: ${(end - start).toFixed(2)}ms`)
      return value
    })
  } else {
    const end = performance.now()
    console.debug(`⏱️ ${name}: ${(end - start).toFixed(2)}ms`)
    return result
  }
}

// Throttle функция для ограничения частоты вызовов
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean
  
  return function (this: unknown, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

// Функция для предотвращения memory leaks в useEffect
export function createAbortablePromise<T>(
  promise: Promise<T>
): { promise: Promise<T>; abort: () => void } {
  let aborted = false
  
  return {
    promise: promise.then((value) => {
      if (aborted) {
        throw new Error('Promise was aborted')
      }
      return value
    }),
    abort: () => {
      aborted = true
    }
  }
}

// Хелпер для оптимизации re-renders
export function shallowEqual(obj1: Record<string, unknown>, obj2: Record<string, unknown>): boolean {
  const keys1 = Object.keys(obj1)
  const keys2 = Object.keys(obj2)

  if (keys1.length !== keys2.length) {
    return false
  }

  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) {
      return false
    }
  }

  return true
}
