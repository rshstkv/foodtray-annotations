/**
 * StepStateMachine - машина состояний для управления этапами задачи
 * 
 * Состояния:
 * - idle: начальное состояние, никаких изменений не было
 * - editing: пользователь редактирует аннотации
 * - dirty: есть несохраненные изменения
 * - validating: идет валидация перед завершением
 * - ready: валидация пройдена, можно завершить этап
 * - completed: этап завершен
 * 
 * Переходы:
 * idle → editing (начало редактирования)
 * editing → dirty (внесены изменения)
 * dirty → validating (запрос валидации)
 * validating → ready (валидация успешна)
 * validating → editing (валидация провалена)
 * ready → completed (завершение этапа)
 * * → idle (reset - откат к snapshot)
 */

export type StepState = 
  | 'idle'        // Начальное состояние
  | 'editing'     // Редактирование
  | 'dirty'       // Есть несохраненные изменения
  | 'validating'  // Валидация
  | 'ready'       // Готов к завершению
  | 'completed'   // Завершен

export interface StepStateMachineConfig {
  initialState?: StepState
  onStateChange?: (oldState: StepState, newState: StepState) => void
  onValidate?: () => Promise<boolean>
  onComplete?: () => Promise<void>
  onReset?: () => Promise<void>
}

export class StepStateMachine {
  private currentState: StepState
  private config: StepStateMachineConfig
  private history: StepState[] = []

  constructor(config: StepStateMachineConfig = {}) {
    this.currentState = config.initialState || 'idle'
    this.config = config
    this.history.push(this.currentState)
  }

  /**
   * Получить текущее состояние
   */
  getState(): StepState {
    return this.currentState
  }

  /**
   * Проверить, находится ли машина в данном состоянии
   */
  is(state: StepState): boolean {
    return this.currentState === state
  }

  /**
   * Переход в новое состояние (внутренний)
   */
  private transition(newState: StepState): boolean {
    if (!this.isValidTransition(this.currentState, newState)) {
      console.warn(`Invalid transition from ${this.currentState} to ${newState}`)
      return false
    }

    const oldState = this.currentState
    this.currentState = newState
    this.history.push(newState)

    if (this.config.onStateChange) {
      this.config.onStateChange(oldState, newState)
    }

    return true
  }

  /**
   * Проверка валидности перехода
   */
  private isValidTransition(from: StepState, to: StepState): boolean {
    const validTransitions: Record<StepState, StepState[]> = {
      idle: ['editing', 'completed'], // Можно сразу пометить как completed если нечего делать
      editing: ['dirty', 'idle'],
      dirty: ['validating', 'editing', 'idle'],
      validating: ['ready', 'editing', 'idle'],
      ready: ['completed', 'editing', 'idle'],
      completed: ['idle'], // Можно сбросить и начать заново
    }

    return validTransitions[from]?.includes(to) || to === 'idle'
  }

  /**
   * Начать редактирование
   */
  startEditing(): boolean {
    if (this.is('idle') || this.is('editing')) {
      return this.transition('editing')
    }
    return false
  }

  /**
   * Пометить как "грязное" (есть изменения)
   */
  markDirty(): boolean {
    if (this.is('editing') || this.is('dirty')) {
      return this.transition('dirty')
    }
    return false
  }

  /**
   * Запустить валидацию
   */
  async validate(): Promise<boolean> {
    if (!this.is('dirty') && !this.is('ready')) {
      return false
    }

    this.transition('validating')

    try {
      const isValid = this.config.onValidate 
        ? await this.config.onValidate() 
        : true

      if (isValid) {
        this.transition('ready')
        return true
      } else {
        this.transition('editing')
        return false
      }
    } catch (error) {
      console.error('Validation error:', error)
      this.transition('editing')
      return false
    }
  }

  /**
   * Завершить этап
   */
  async complete(): Promise<boolean> {
    if (!this.is('ready')) {
      // Пытаемся сначала провалидировать
      const isValid = await this.validate()
      if (!isValid) {
        return false
      }
    }

    try {
      if (this.config.onComplete) {
        await this.config.onComplete()
      }
      
      this.transition('completed')
      return true
    } catch (error) {
      console.error('Complete error:', error)
      return false
    }
  }

  /**
   * Сбросить состояние (откат к snapshot)
   */
  async reset(): Promise<boolean> {
    try {
      if (this.config.onReset) {
        await this.config.onReset()
      }
      
      this.transition('idle')
      return true
    } catch (error) {
      console.error('Reset error:', error)
      return false
    }
  }

  /**
   * Можно ли завершить этап в текущем состоянии
   */
  canComplete(): boolean {
    return this.is('ready') || this.is('completed')
  }

  /**
   * Есть ли несохраненные изменения
   */
  isDirty(): boolean {
    return this.is('dirty') || this.is('editing')
  }

  /**
   * Получить историю переходов
   */
  getHistory(): StepState[] {
    return [...this.history]
  }

  /**
   * Очистить историю (для отладки)
   */
  clearHistory(): void {
    this.history = [this.currentState]
  }
}

/**
 * Хелперы для UI
 */
export function getStateLabel(state: StepState): string {
  const labels: Record<StepState, string> = {
    idle: 'Не начат',
    editing: 'Редактирование',
    dirty: 'Есть изменения',
    validating: 'Валидация...',
    ready: 'Готов к завершению',
    completed: 'Завершен',
  }
  return labels[state]
}

export function getStateColor(state: StepState): string {
  const colors: Record<StepState, string> = {
    idle: '#9CA3AF',        // gray
    editing: '#3B82F6',     // blue
    dirty: '#F59E0B',       // amber
    validating: '#8B5CF6',  // purple
    ready: '#10B981',       // green
    completed: '#059669',   // dark green
  }
  return colors[state]
}

export function getStateIcon(state: StepState): string {
  const icons: Record<StepState, string> = {
    idle: '⚪',
    editing: '✏️',
    dirty: '⚠️',
    validating: '🔄',
    ready: '✅',
    completed: '✓',
  }
  return icons[state]
}

