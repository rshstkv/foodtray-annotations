import { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

/**
 * TaskLayout - общий layout для страниц задач аннотаторов
 * 
 * Предоставляет:
 * - Sticky header с информацией о задаче
 * - Progress bar
 * - Кнопки Skip/Complete
 * - Hotkeys hints
 * - Автоматический release при Esc
 */

interface TaskLayoutProps {
  // Header
  title: string
  recognitionId: string
  tier: number
  
  // Progress
  current: number
  total: number
  progressLabel?: string
  
  // Actions
  onSkip: () => void
  onComplete: () => void
  isCompleting?: boolean
  
  // Hotkeys hints
  hotkeysHint: string
  
  // Additional header content (badges, etc)
  headerExtra?: ReactNode
  
  // Children - основной контент
  children: ReactNode
}

export function TaskLayout({
  title,
  recognitionId,
  tier,
  current,
  total,
  progressLabel,
  onSkip,
  onComplete,
  isCompleting = false,
  hotkeysHint,
  headerExtra,
  children
}: TaskLayoutProps) {
  const progress = total > 0 ? (current / total) * 100 : 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-xl font-bold">{title}</h1>
              <p className="text-sm text-gray-600">
                Recognition {recognitionId} | Tier {tier}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              {headerExtra}
              <Button variant="outline" onClick={onSkip}>
                Пропустить (Esc)
              </Button>
              <Button
                onClick={onComplete}
                disabled={isCompleting}
                size="lg"
              >
                {isCompleting ? 'Сохранение...' : 'Готово →'}
              </Button>
            </div>
          </div>
          
          {/* Progress bar */}
          {total > 0 && (
            <>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {progressLabel || `${current} из ${total}`}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hotkeys hint */}
      <Card className="max-w-7xl mx-auto mx-6 mt-4 p-3 bg-blue-50 border-blue-200">
        <div className="text-sm">
          <span className="font-medium">Hotkeys:</span> {hotkeysHint}
        </div>
      </Card>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        {children}
      </div>
    </div>
  )
}

/**
 * TaskEmptyState - компонент для отображения когда нет доступных задач
 */
interface TaskEmptyStateProps {
  taskName: string
  tier?: string | null
  onReturn: () => void
}

export function TaskEmptyState({ taskName, tier, onReturn }: TaskEmptyStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="p-8 text-center max-w-md">
        <h2 className="text-2xl font-bold mb-4">Нет доступных задач</h2>
        <p className="text-gray-600 mb-6">
          Все задачи {taskName} {tier && `(Tier ${tier})`} выполнены!
        </p>
        <Button onClick={onReturn}>
          ← Вернуться к списку задач
        </Button>
      </Card>
    </div>
  )
}

/**
 * TaskLoadingState - компонент для отображения загрузки
 */
export function TaskLoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-lg">Загрузка задачи...</div>
    </div>
  )
}

