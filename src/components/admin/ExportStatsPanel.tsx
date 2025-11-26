'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, AlertCircle, CheckCircle, X } from 'lucide-react'
import type { ExportPreviewStats, ValidationType, ItemType } from '@/types/domain'

const VALIDATION_TYPE_LABELS: Record<ValidationType, string> = {
  FOOD_VALIDATION: 'Блюда',
  PLATE_VALIDATION: 'Тарелки',
  BUZZER_VALIDATION: 'Пейджеры',
  OCCLUSION_VALIDATION: 'Окклюзии',
  BOTTLE_ORIENTATION_VALIDATION: 'Ориентация',
}

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  FOOD: 'Блюда',
  PLATE: 'Тарелки',
  BUZZER: 'Пейджеры',
  BOTTLE: 'Бутылки',
  OTHER: 'Другое',
}

interface ExportStatsPanelProps {
  stats: ExportPreviewStats | null
  selectedCount: number
  onExport: () => void
  onVerifyIntegrity: () => void
  exporting?: boolean
  verifying?: boolean
  onExcludeUser?: (userId: string) => void
}

export function ExportStatsPanel({
  stats,
  selectedCount,
  onExport,
  onVerifyIntegrity,
  exporting = false,
  verifying = false,
  onExcludeUser,
}: ExportStatsPanelProps) {
  if (!stats) {
    return (
      <Card className="p-6 rounded-xl shadow-sm">
        <div className="text-center text-gray-500">
          <p>Примените фильтры для просмотра статистики</p>
        </div>
      </Card>
    )
  }

  const modifiedPercentage = stats.total_annotations > 0 
    ? Math.round((stats.modified_annotations / stats.total_annotations) * 100)
    : 0

  return (
    <Card className="p-6 rounded-xl shadow-sm space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          Статистика экспорта
        </h3>
        <p className="text-sm text-gray-600">
          Выбрано: {selectedCount} из {stats.total_recognitions} recognitions
        </p>
      </div>

      {/* Items Breakdown */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Items по типам</h4>
        <div className="space-y-2">
          {Object.entries(stats.total_items).map(([type, count]) => (
            <div key={type} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {ITEM_TYPE_LABELS[type as ItemType]}:
              </span>
              <Badge variant="secondary" className="font-mono">
                {count}
              </Badge>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t flex items-center justify-between font-semibold">
          <span className="text-sm text-gray-900">Всего items:</span>
          <Badge className="font-mono bg-blue-600">
            {Object.values(stats.total_items).reduce((a, b) => a + b, 0)}
          </Badge>
        </div>
      </div>

      {/* Annotations */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Аннотации</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Всего:</span>
            <Badge variant="secondary" className="font-mono">
              {stats.total_annotations}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-green-600">Изменено:</span>
            <Badge className="font-mono bg-green-600">
              {stats.modified_annotations} ({modifiedPercentage}%)
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Не изменено:</span>
            <Badge variant="outline" className="font-mono">
              {stats.unmodified_annotations}
            </Badge>
          </div>
        </div>
      </div>

      {/* Users Breakdown */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">
          Распределение по пользователям
        </h4>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {stats.users_breakdown
            .sort((a, b) => b.recognitions_count - a.recognitions_count)
            .map(user => {
              const percentage = Math.round(
                (user.recognitions_count / stats.total_recognitions) * 100
              )
              return (
                <div
                  key={user.user_id}
                  className="p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate" title={user.email}>
                        {user.email}
                      </p>
                      <p className="text-xs text-gray-500">
                        {user.recognitions_count} recognitions ({percentage}%)
                      </p>
                    </div>
                    {onExcludeUser && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onExcludeUser(user.user_id)}
                        className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Исключить
                      </Button>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                    <span>Items: {user.items_count}</span>
                    <span>Annotations: {user.annotations_count}</span>
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* Validation Steps */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">
          Статус этапов валидации
        </h4>
        <div className="space-y-2">
          {Object.entries(stats.validation_steps_breakdown).map(([type, counts]) => {
            const total = counts.completed + counts.skipped + counts.pending
            if (total === 0) return null
            
            return (
              <div key={type} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {VALIDATION_TYPE_LABELS[type as ValidationType]}:
                  </span>
                  <div className="flex items-center gap-2">
                    {counts.completed > 0 && (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {counts.completed}
                      </Badge>
                    )}
                    {counts.skipped > 0 && (
                      <Badge variant="outline" className="text-orange-600 border-orange-600">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        {counts.skipped} пропущено
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Export Note */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
        <p className="text-blue-800 font-medium mb-1">Экспорт включает:</p>
        <ul className="text-blue-700 space-y-0.5 text-xs">
          <li>✓ Все items и annotations с изменениями</li>
          <li>✓ Метаданные: пользователь, дата, статусы этапов</li>
          <li>✓ Original bbox для измененных аннотаций</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="pt-4 border-t space-y-2">
        <Button
          onClick={onVerifyIntegrity}
          disabled={verifying || exporting}
          variant="outline"
          className="w-full"
        >
          {verifying ? 'Проверка...' : 'Проверить целостность данных'}
        </Button>
        <Button
          onClick={onExport}
          disabled={exporting || verifying || selectedCount === 0}
          className="w-full bg-green-600 hover:bg-green-700 text-base font-semibold"
        >
          <Download className="w-5 h-5 mr-2" />
          {exporting ? 'Экспорт...' : `Скачать JSON (${selectedCount})`}
        </Button>
      </div>
    </Card>
  )
}

