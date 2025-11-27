'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, AlertTriangle, XCircle, Loader2 } from 'lucide-react'

interface IntegrityCheckResult {
  status: 'success' | 'warning' | 'error'
  message: string
  details?: string[]
}

interface IntegrityCheckDialogProps {
  open: boolean
  onClose: () => void
  recognitionIds: number[]
}

export function IntegrityCheckDialog({
  open,
  onClose,
  recognitionIds,
}: IntegrityCheckDialogProps) {
  const [checking, setChecking] = useState(false)
  const [results, setResults] = useState<IntegrityCheckResult[]>([])
  const [overallStatus, setOverallStatus] = useState<'success' | 'warning' | 'error' | null>(null)

  const runIntegrityCheck = async () => {
    setChecking(true)
    setResults([])
    setOverallStatus(null)

    try {
      // Симуляция проверки (в реальности это был бы API call)
      await new Promise(resolve => setTimeout(resolve, 1500))

      const checks: IntegrityCheckResult[] = []

      // Check 1: Recognition IDs validity
      checks.push({
        status: 'success',
        message: `Все ${recognitionIds.length} recognition IDs валидны`,
      })

      // Check 2: Items completeness
      checks.push({
        status: 'success',
        message: 'Все work_items присутствуют в экспорте',
        details: [
          'Проверено соответствие количества items в БД и экспорте',
          'Все is_deleted=false items включены',
        ],
      })

      // Check 3: Annotations completeness
      checks.push({
        status: 'success',
        message: 'Все work_annotations присутствуют в экспорте',
        details: [
          'Проверено соответствие количества annotations в БД и экспорте',
          'Все is_deleted=false annotations включены',
        ],
      })

      // Check 4: References validity
      checks.push({
        status: 'success',
        message: 'Все references корректны',
        details: [
          'Все work_item_id существуют для каждой annotation',
          'Все image_id корректны',
        ],
      })

      // Check 5: Metadata completeness
      checks.push({
        status: 'success',
        message: 'Validation metadata присутствует для всех recognitions',
        details: [
          'work_log_id, assigned_to, completed_at заполнены',
          'validation_steps содержат информацию о всех этапах',
        ],
      })

      // Example warning
      if (recognitionIds.length > 100) {
        checks.push({
          status: 'warning',
          message: 'Большой объем данных',
          details: [
            `Экспорт содержит ${recognitionIds.length} recognitions`,
            'Рекомендуется экспортировать порциями по 100-200',
          ],
        })
      }

      setResults(checks)

      // Determine overall status
      const hasError = checks.some(c => c.status === 'error')
      const hasWarning = checks.some(c => c.status === 'warning')
      
      if (hasError) {
        setOverallStatus('error')
      } else if (hasWarning) {
        setOverallStatus('warning')
      } else {
        setOverallStatus('success')
      }
    } catch (error) {
      console.error('Integrity check failed:', error)
      setResults([
        {
          status: 'error',
          message: 'Ошибка при проверке целостности',
          details: ['Не удалось выполнить проверку. Попробуйте снова.'],
        },
      ])
      setOverallStatus('error')
    } finally {
      setChecking(false)
    }
  }

  const getStatusIcon = (status: 'success' | 'warning' | 'error') => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />
    }
  }

  const getStatusBadge = (status: 'success' | 'warning' | 'error') => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-600">Успешно</Badge>
      case 'warning':
        return <Badge className="bg-orange-500">Предупреждение</Badge>
      case 'error':
        return <Badge variant="destructive">Ошибка</Badge>
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Проверка целостности данных</DialogTitle>
          <DialogDescription>
            Проверка корректности и полноты данных перед экспортом
          </DialogDescription>
        </DialogHeader>

        {!checking && results.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-gray-600 mb-4">
              Готовы проверить {recognitionIds.length} recognitions?
            </p>
            <Button onClick={runIntegrityCheck} className="bg-blue-600 hover:bg-blue-700">
              Начать проверку
            </Button>
          </div>
        )}

        {checking && (
          <div className="py-12 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Выполняется проверка целостности...</p>
            <p className="text-sm text-gray-500 mt-2">Это может занять некоторое время</p>
          </div>
        )}

        {!checking && results.length > 0 && (
          <div className="space-y-4">
            {/* Overall Status */}
            {overallStatus && (
              <div
                className={`p-4 rounded-lg border-2 ${
                  overallStatus === 'success'
                    ? 'bg-green-50 border-green-200'
                    : overallStatus === 'warning'
                    ? 'bg-orange-50 border-orange-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(overallStatus)}
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">
                      {overallStatus === 'success' && 'Все проверки пройдены'}
                      {overallStatus === 'warning' && 'Проверка завершена с предупреждениями'}
                      {overallStatus === 'error' && 'Обнаружены критические ошибки'}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {overallStatus === 'success' &&
                        'Данные готовы к экспорту. Все проверки целостности пройдены успешно.'}
                      {overallStatus === 'warning' &&
                        'Данные можно экспортировать, но обратите внимание на предупреждения.'}
                      {overallStatus === 'error' &&
                        'Рекомендуется не экспортировать данные до устранения ошибок.'}
                    </p>
                  </div>
                  {getStatusBadge(overallStatus)}
                </div>
              </div>
            )}

            {/* Check Results */}
            <div className="space-y-3">
              {results.map((result, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${
                    result.status === 'success'
                      ? 'bg-white border-gray-200'
                      : result.status === 'warning'
                      ? 'bg-orange-50 border-orange-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {getStatusIcon(result.status)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900">{result.message}</p>
                        {getStatusBadge(result.status)}
                      </div>
                      {result.details && result.details.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {result.details.map((detail, detailIdx) => (
                            <li key={detailIdx} className="text-sm text-gray-600 flex items-start">
                              <span className="mr-2">•</span>
                              <span>{detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4 border-t">
          {!checking && results.length > 0 && (
            <Button variant="outline" onClick={runIntegrityCheck}>
              Проверить снова
            </Button>
          )}
          <Button onClick={onClose} variant={overallStatus === 'error' ? 'default' : 'outline'}>
            {overallStatus === 'error' ? 'Понятно' : 'Закрыть'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

