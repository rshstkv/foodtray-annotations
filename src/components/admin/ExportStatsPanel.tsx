'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download } from 'lucide-react'
import type { ExportPreviewStats } from '@/types/domain'

interface ExportStatsPanelProps {
  stats: ExportPreviewStats | null
  selectedCount: number
  onExport: () => void
  onVerifyIntegrity: () => void
  exporting?: boolean
  verifying?: boolean
}

export function ExportStatsPanel({
  stats,
  selectedCount,
  onExport,
  onVerifyIntegrity,
  exporting = false,
  verifying = false,
}: ExportStatsPanelProps) {
  if (!stats) {
    return (
      <Card className="p-6 rounded-xl shadow-sm">
        <div className="text-center text-gray-500">
          <p>Примените фильтры для просмотра данных</p>
        </div>
      </Card>
    )
  }

  const totalItems = Object.values(stats.total_items).reduce((a, b) => a + b, 0)
  const modifiedPercentage = stats.total_annotations > 0 
    ? Math.round((stats.modified_annotations / stats.total_annotations) * 100)
    : 0

  return (
    <Card className="p-6 rounded-xl shadow-sm space-y-6">
      {/* Header */}
      <div className="text-center pb-4 border-b">
        <h3 className="text-2xl font-bold text-gray-900 mb-1">
          {stats.total_recognitions}
        </h3>
        <p className="text-sm text-gray-600">recognitions</p>
      </div>

      {/* Key Metrics */}
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="text-sm font-medium text-gray-700">Всего items:</span>
          <Badge className="text-lg font-bold bg-blue-600">
            {totalItems}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="text-sm font-medium text-gray-700">Аннотации:</span>
          <Badge className="text-lg font-bold" variant="secondary">
            {stats.total_annotations}
          </Badge>
        </div>

        <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
          <span className="text-sm font-medium text-green-700">Изменено:</span>
          <Badge className="text-lg font-bold bg-green-600">
            {stats.modified_annotations}
          </Badge>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-4 border-t space-y-2">
        <Button
          onClick={onExport}
          disabled={exporting || verifying || selectedCount === 0}
          className="w-full bg-green-600 hover:bg-green-700 h-12 text-base font-semibold"
        >
          <Download className="w-5 h-5 mr-2" />
          {exporting ? 'Экспорт...' : 'Скачать JSON'}
        </Button>
        
        <Button
          onClick={onVerifyIntegrity}
          disabled={verifying || exporting}
          variant="outline"
          className="w-full"
          size="sm"
        >
          {verifying ? 'Проверка...' : 'Проверить целостность'}
        </Button>
      </div>
    </Card>
  )
}

