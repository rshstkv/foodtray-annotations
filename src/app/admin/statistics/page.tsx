'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'
import { Download, Eye, Check, X } from 'lucide-react'
import Link from 'next/link'
import type { RecognitionWithValidations, ValidationType, CompletedValidationInfo } from '@/types/domain'

interface User {
  id: string
  email: string
  full_name: string | null
}

const VALIDATION_TYPES: ValidationType[] = [
  'FOOD_VALIDATION',
  'PLATE_VALIDATION',
  'BUZZER_VALIDATION',
  'OCCLUSION_VALIDATION',
  'BOTTLE_ORIENTATION_VALIDATION',
]

const VALIDATION_TYPE_LABELS: Record<ValidationType, string> = {
  FOOD_VALIDATION: 'Блюда',
  PLATE_VALIDATION: 'Тарелки',
  BUZZER_VALIDATION: 'Пейджеры',
  OCCLUSION_VALIDATION: 'Окклюзии',
  BOTTLE_ORIENTATION_VALIDATION: 'Ориентация',
}

export default function AdminStatisticsPage() {
  const { user, isAdmin } = useUser()
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('all')
  const [selectedValidationTypes, setSelectedValidationTypes] = useState<Set<ValidationType>>(new Set())
  const [recognitions, setRecognitions] = useState<RecognitionWithValidations[]>([])
  const [selectedRecognitionIds, setSelectedRecognitionIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Инициализируем selectedUserId для обычного пользователя
  useEffect(() => {
    if (user && !isAdmin) {
      setSelectedUserId(user.id)
    }
  }, [user, isAdmin])

  useEffect(() => {
    if (isAdmin) {
      loadUsers()
    }
  }, [isAdmin])

  useEffect(() => {
    loadRecognitions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId])

  const loadUsers = async () => {
    try {
      const response = await apiFetch<{ users: User[] }>('/api/admin/users')
      if (response.success && response.data) {
        setUsers(response.data.users || [])
      }
    } catch (err) {
      console.error('Error loading users:', err)
    }
  }

  const loadRecognitions = async () => {
    try {
      setLoading(true)
      let url = '/api/admin/completed-validations'
      const params = new URLSearchParams()
      
      if (selectedUserId && selectedUserId !== 'all') {
        params.append('userId', selectedUserId)
      }
      
      if (params.toString()) {
        url += '?' + params.toString()
      }
      
      const response = await apiFetch<{ recognitions: RecognitionWithValidations[] }>(url)
      
      if (response.success && response.data) {
        setRecognitions(response.data.recognitions || [])
        // Сбросить выбор при изменении фильтров
        setSelectedRecognitionIds(new Set())
      }
    } catch (err) {
      console.error('Error loading recognitions:', err)
    } finally {
      setLoading(false)
    }
  }

  // Фильтрация recognitions на клиенте
  const filteredRecognitions = recognitions.filter(recognition => {
    // Если не выбраны типы валидаций - показываем все
    if (selectedValidationTypes.size === 0) {
      return true
    }
    
    // Проверяем, есть ли хотя бы одна из выбранных валидаций
    return recognition.completed_validations.some(val => 
      selectedValidationTypes.has(val.validation_type)
    )
  })

  const toggleValidationType = (type: ValidationType) => {
    setSelectedValidationTypes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(type)) {
        newSet.delete(type)
      } else {
        newSet.add(type)
      }
      return newSet
    })
  }

  const toggleRecognitionSelection = (recognitionId: number) => {
    const newSelected = new Set(selectedRecognitionIds)
    if (newSelected.has(recognitionId)) {
      newSelected.delete(recognitionId)
    } else {
      newSelected.add(recognitionId)
    }
    setSelectedRecognitionIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedRecognitionIds.size === filteredRecognitions.length) {
      setSelectedRecognitionIds(new Set())
    } else {
      setSelectedRecognitionIds(new Set(filteredRecognitions.map(r => r.recognition_id)))
    }
  }

  const handleExport = async () => {
    if (selectedRecognitionIds.size === 0) {
      alert('Выберите хотя бы один recognition для экспорта')
      return
    }

    try {
      setExporting(true)
      const ids = Array.from(selectedRecognitionIds).join(',')
      const url = `/api/admin/export?recognitionIds=${ids}`
      
      // Загрузка файла
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Export failed')
      }
      
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `annotations_export_${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(downloadUrl)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error exporting:', err)
      alert('Ошибка при экспорте данных')
    } finally {
      setExporting(false)
    }
  }

  const hasValidation = (validations: CompletedValidationInfo[], type: ValidationType): CompletedValidationInfo | null => {
    return validations.find(v => v.validation_type === type) || null
  }

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Статистика валидаций</h1>
        <p className="text-gray-600 text-base">
          {isAdmin ? 'Список завершенных валидаций с возможностью экспорта' : 'Ваши завершенные валидации'}
        </p>
      </div>

      {/* Фильтры */}
      <Card className="p-6 mb-6 rounded-xl shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* User filter - только для админа */}
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Фильтр по пользователю
              </label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue placeholder="Все пользователи" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все пользователи</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Validation type filter - множественный */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Фильтр по типу валидации
            </label>
            <div className="flex flex-wrap gap-2">
              {VALIDATION_TYPES.map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <Checkbox
                    checked={selectedValidationTypes.has(type)}
                    onCheckedChange={() => toggleValidationType(type)}
                  />
                  <span className="text-sm">{VALIDATION_TYPE_LABELS[type]}</span>
                </label>
              ))}
            </div>
            {selectedValidationTypes.size > 0 && (
              <button
                onClick={() => setSelectedValidationTypes(new Set())}
                className="text-xs text-blue-600 hover:text-blue-700 mt-2"
              >
                Сбросить фильтр
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Панель действий */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Checkbox
            id="select-all"
            checked={filteredRecognitions.length > 0 && selectedRecognitionIds.size === filteredRecognitions.length}
            onCheckedChange={toggleSelectAll}
          />
          <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
            Выбрать все ({selectedRecognitionIds.size} из {filteredRecognitions.length})
          </label>
        </div>

        <Button
          onClick={handleExport}
          disabled={selectedRecognitionIds.size === 0 || exporting}
          className="bg-green-600 hover:bg-green-700"
        >
          <Download className="w-4 h-4 mr-2" />
          {exporting ? 'Экспорт...' : `Экспортировать JSON (${selectedRecognitionIds.size})`}
        </Button>
      </div>

      {/* Таблица recognitions */}
      {loading ? (
        <Card className="p-12 text-center rounded-xl shadow-sm">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </Card>
      ) : filteredRecognitions.length === 0 ? (
        <Card className="p-12 text-center rounded-xl shadow-sm">
          <p className="text-gray-500">
            {recognitions.length === 0 
              ? 'Нет завершенных валидаций' 
              : 'Нет валидаций, соответствующих выбранным фильтрам'}
          </p>
        </Card>
      ) : (
        <Card className="rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={filteredRecognitions.length > 0 && selectedRecognitionIds.size === filteredRecognitions.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Recognition ID</TableHead>
                  {VALIDATION_TYPES.map((type) => (
                    <TableHead key={type} className="text-center">
                      {VALIDATION_TYPE_LABELS[type]}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecognitions.map((recognition) => (
                  <TableRow key={recognition.recognition_id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedRecognitionIds.has(recognition.recognition_id)}
                        onCheckedChange={() => toggleRecognitionSelection(recognition.recognition_id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {recognition.recognition_id}
                    </TableCell>
                    {VALIDATION_TYPES.map((type) => {
                      const validation = hasValidation(recognition.completed_validations, type)
                      return (
                        <TableCell key={type} className="text-center">
                          {validation ? (
                            <div className="flex items-center justify-center">
                              <Check className="w-5 h-5 text-green-600" />
                            </div>
                          ) : (
                            <div className="flex items-center justify-center">
                              <X className="w-5 h-5 text-gray-300" />
                            </div>
                          )}
                        </TableCell>
                      )
                    })}
                    <TableCell className="text-right">
                      {recognition.completed_validations.length > 0 && (
                        <Link
                          href={`/recognitions/${recognition.recognition_id}/view`}
                          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <Eye className="w-4 h-4" />
                          Просмотр
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  )
}
