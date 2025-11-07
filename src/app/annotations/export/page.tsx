'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

export default function ExportPage() {
  const router = useRouter()
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [tier, setTier] = useState<string>('')
  const [workflowState, setWorkflowState] = useState<string>('')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [includeHistory, setIncludeHistory] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    try {
      setExporting(true)
      
      const params = new URLSearchParams({ format })
      if (tier) params.append('tier', tier)
      if (workflowState) params.append('workflow_state', workflowState)
      if (fromDate) params.append('from_date', fromDate)
      if (toDate) params.append('to_date', toDate)
      if (includeHistory) params.append('include_history', 'true')

      const url = `/api/annotations/export?${params.toString()}`
      
      if (format === 'csv') {
        // Для CSV скачиваем файл
        const response = await fetch(url)
        const blob = await response.blob()
        const downloadUrl = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = `annotations_export_${new Date().toISOString()}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(downloadUrl)
        document.body.removeChild(a)
      } else {
        // Для JSON открываем в новом окне
        window.open(url, '_blank')
      }
    } catch (error) {
      console.error('Export error:', error)
      alert('Ошибка при экспорте. Проверьте консоль.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Экспорт датасета</h1>
              <p className="text-gray-600 mt-2">
                Скачайте результаты аннотаций для Data Science
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push('/annotations/tasks')}>
              ← Назад к задачам
            </Button>
          </div>
        </div>

        <Card className="p-6">
          <div className="space-y-6">
            {/* Format Selection */}
            <div>
              <Label className="text-base font-semibold mb-3 block">Формат экспорта</Label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  className={`p-4 border-2 rounded-lg transition-all ${
                    format === 'csv' 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setFormat('csv')}
                >
                  <div className="text-2xl mb-2">📊</div>
                  <div className="font-semibold">CSV</div>
                  <div className="text-xs text-gray-600">Для анализа в Excel/Python</div>
                </button>
                <button
                  className={`p-4 border-2 rounded-lg transition-all ${
                    format === 'json' 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setFormat('json')}
                >
                  <div className="text-2xl mb-2">📦</div>
                  <div className="font-semibold">JSON</div>
                  <div className="text-xs text-gray-600">Полные данные с структурой</div>
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="border-t pt-6">
              <Label className="text-base font-semibold mb-3 block">Фильтры (опционально)</Label>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Tier */}
                <div>
                  <Label htmlFor="tier" className="text-sm mb-2 block">Уровень сложности</Label>
                  <Select value={tier} onValueChange={setTier}>
                    <SelectTrigger>
                      <SelectValue placeholder="Все tier'ы" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Все tier'ы</SelectItem>
                      <SelectItem value="1">Tier 1</SelectItem>
                      <SelectItem value="2">Tier 2</SelectItem>
                      <SelectItem value="3">Tier 3</SelectItem>
                      <SelectItem value="4">Tier 4</SelectItem>
                      <SelectItem value="5">Tier 5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Workflow State */}
                <div>
                  <Label htmlFor="workflow_state" className="text-sm mb-2 block">Статус</Label>
                  <Select value={workflowState} onValueChange={setWorkflowState}>
                    <SelectTrigger>
                      <SelectValue placeholder="Все статусы" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Все статусы</SelectItem>
                      <SelectItem value="pending">В очереди</SelectItem>
                      <SelectItem value="in_progress">В работе</SelectItem>
                      <SelectItem value="completed">Завершено</SelectItem>
                      <SelectItem value="requires_correction">Требует исправления</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date From */}
                <div>
                  <Label htmlFor="from_date" className="text-sm mb-2 block">Дата от</Label>
                  <Input
                    id="from_date"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>

                {/* Date To */}
                <div>
                  <Label htmlFor="to_date" className="text-sm mb-2 block">Дата до</Label>
                  <Input
                    id="to_date"
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Include History */}
              <div className="flex items-center space-x-2 mt-4">
                <Checkbox
                  id="include_history"
                  checked={includeHistory}
                  onCheckedChange={(checked) => setIncludeHistory(checked as boolean)}
                />
                <label
                  htmlFor="include_history"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Включить историю изменений
                </label>
              </div>
            </div>

            {/* Export Button */}
            <div className="border-t pt-6">
              <Button
                size="lg"
                className="w-full"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Экспортируем...
                  </>
                ) : (
                  <>
                    {format === 'csv' ? '📥 Скачать CSV' : '🔗 Открыть JSON'}
                  </>
                )}
              </Button>
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
              <div className="font-semibold text-blue-900 mb-2">ℹ️ Информация</div>
              <ul className="space-y-1 text-blue-800">
                <li>• CSV: Одна строка = одна аннотация (bbox)</li>
                <li>• JSON: Полная структура (recognition → images → annotations)</li>
                <li>• Фильтры можно комбинировать</li>
                <li>• История содержит все изменения и версии</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

