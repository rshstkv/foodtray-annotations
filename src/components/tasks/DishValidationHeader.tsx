/**
 * Header компонент для Dish Validation страницы
 * Отображает заголовок, селектор очереди, счетчики и кнопки действий
 */

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface DishValidationHeaderProps {
  queue: 'pending' | 'requires_correction'
  onQueueChange: (value: 'pending' | 'requires_correction') => void
  recognitionId: string
  tier: number
  mode: 'quick_validation' | 'edit_mode'
  expectedCount: number
  mainCount: number
  qualCount: number
  isAligned: boolean
  completing: boolean
  selectedAnnotation: { id: number } | null
  onBBoxError: () => void
  onCheckError: () => void
  onBuzzerPresent: () => void
  onComplete: () => void
  onDelete?: () => void
  onSkip: () => void
}

export function DishValidationHeader({
  queue,
  onQueueChange,
  recognitionId,
  tier,
  mode,
  expectedCount,
  mainCount,
  qualCount,
  isAligned,
  completing,
  selectedAnnotation,
  onBBoxError,
  onCheckError,
  onBuzzerPresent,
  onComplete,
  onDelete,
  onSkip,
}: DishValidationHeaderProps) {
  return (
    <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
      <div className="max-w-[1920px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-4 mb-1">
              <h1 className="text-xl font-bold">Проверка блюд и количества</h1>
              <Select value={queue} onValueChange={onQueueChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">📝 Новые задачи</SelectItem>
                  <SelectItem value="requires_correction">⚠️ Требуют исправления</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-gray-600">
              Recognition {recognitionId} | Tier {tier} |{' '}
              <span className={
                queue === 'requires_correction'
                  ? 'text-red-600 font-medium'
                  : mode === 'quick_validation'
                    ? 'text-green-600 font-medium'
                    : 'text-orange-600 font-medium'
              }>
                {queue === 'requires_correction' 
                  ? '⚠️ Требуют исправления' 
                  : mode === 'quick_validation' 
                    ? 'Быстрая проверка' 
                    : 'Редактирование'}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Count comparison */}
            <div className="flex items-center gap-3 text-sm">
              <div className="text-center">
                <div className="text-xs text-gray-500">Ожидается</div>
                <div className="text-2xl font-bold">{expectedCount}</div>
              </div>
              <div className="text-gray-400">=</div>
              <div className="text-center">
                <div className="text-xs text-gray-500">Main</div>
                <div
                  className={`text-2xl font-bold ${
                    mainCount === expectedCount
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {mainCount}
                </div>
              </div>
              <div className="text-gray-400">&</div>
              <div className="text-center">
                <div className="text-xs text-gray-500">Qualifying</div>
                <div
                  className={`text-2xl font-bold ${
                    qualCount === expectedCount
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {qualCount}
                </div>
              </div>
            </div>

            {/* Actions */}
            {mode === 'quick_validation' ? (
              <div className="border-l pl-4 flex items-center gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={onBBoxError}
                  disabled={completing}
                >
                  ❌ Неверные bbox
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={onCheckError}
                  disabled={completing}
                >
                  ⚠️ Ошибка в чеке
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={onBuzzerPresent}
                  disabled={completing}
                >
                  🔔 Есть баззер
                </Button>
                <Button
                  onClick={onComplete}
                  disabled={completing}
                  size="lg"
                  className="bg-green-600 hover:bg-green-700"
                >
                  {completing ? 'Сохранение...' : '✅ ВСЁ ВЕРНО'}
                </Button>
              </div>
            ) : (
              <div className="border-l pl-4 flex items-center gap-2">
                {selectedAnnotation && onDelete && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={onDelete}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    🗑️ Удалить bbox
                  </Button>
                )}
                <Button variant="outline" onClick={onSkip}>
                  Пропустить (Esc)
                </Button>
                {isAligned && (
                  <Button
                    onClick={onComplete}
                    disabled={completing}
                    size="lg"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {completing ? 'Сохранение...' : '✅ Готово'}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


