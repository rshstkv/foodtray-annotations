'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RootLayout } from '@/components/layouts/RootLayout'
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'
import { useToast } from '@/hooks/use-toast'
import { Eye, Check, X, MoreVertical, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import type { RecognitionWithValidations, ValidationType, CompletedValidationInfo } from '@/types/domain'

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

export default function MyValidationsPage() {
  const { user, isAdmin } = useUser()
  const { toast } = useToast()
  const [selectedValidationTypes, setSelectedValidationTypes] = useState<Set<ValidationType>>(new Set())
  const [recognitions, setRecognitions] = useState<RecognitionWithValidations[]>([])
  const [loading, setLoading] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [recognitionToReset, setRecognitionToReset] = useState<number | null>(null)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (user) {
      loadRecognitions()
    }
     
  }, [user])

  const loadRecognitions = async () => {
    try {
      setLoading(true)
      const url = '/api/user/my-validations'
      
      const response = await apiFetch<{ recognitions: RecognitionWithValidations[] }>(url)
      
      if (response.success && response.data) {
        setRecognitions(response.data.recognitions || [])
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
    
    // Проверяем, что ВСЕ выбранные типы валидаций присутствуют
    const completedTypes = new Set(
      recognition.completed_validations.map(v => v.validation_type)
    )
    
    return Array.from(selectedValidationTypes).every(type => 
      completedTypes.has(type)
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

  const hasValidation = (validations: CompletedValidationInfo[], type: ValidationType): CompletedValidationInfo | null => {
    return validations.find(v => v.validation_type === type) || null
  }

  const handleResetClick = (recognitionId: number) => {
    setRecognitionToReset(recognitionId)
    setResetDialogOpen(true)
  }

  const handleResetConfirm = async () => {
    if (!recognitionToReset) return

    try {
      setResetting(true)
      const response = await apiFetch<{ success: boolean; message: string }>(
        `/api/admin/recognition/${recognitionToReset}/reset`,
        {
          method: 'POST',
        }
      )

      if (response.success && response.data) {
        toast({
          title: 'Успех',
          description: response.data.message || 'Recognition отправлен на повторное распознавание',
        })
        
        // Обновить список recognitions
        await loadRecognitions()
      } else {
        const errorMessage = !response.success && 'error' in response ? response.error : 'Не удалось отправить recognition на повторное распознавание'
        toast({
          title: 'Ошибка',
          description: errorMessage,
          variant: 'destructive',
        })
      }
    } catch (err) {
      console.error('Error resetting recognition:', err)
      toast({
        title: 'Ошибка',
        description: 'Произошла ошибка при сбросе recognition',
        variant: 'destructive',
      })
    } finally {
      setResetting(false)
      setResetDialogOpen(false)
      setRecognitionToReset(null)
    }
  }

  if (!user) {
    return (
      <RootLayout>
        <div className="p-8">
          <Card className="p-12 text-center rounded-xl shadow-sm">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </Card>
        </div>
      </RootLayout>
    )
  }

  return (
    <RootLayout
      userName={user.full_name || undefined}
      userEmail={user.email}
      isAdmin={isAdmin}
    >
      <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Мои валидации</h1>
        <p className="text-gray-600 text-base">
          Список завершенных вами валидаций с возможностью просмотра и повторной отправки
        </p>
      </div>

      {/* Фильтры */}
      <Card className="p-6 mb-6 rounded-xl shadow-sm">
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
      </Card>

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
                  <TableHead>Recognition ID</TableHead>
                  {VALIDATION_TYPES.map((type) => (
                    <TableHead 
                      key={type} 
                      className={`text-center ${selectedValidationTypes.has(type) ? 'bg-blue-50 font-semibold' : ''}`}
                    >
                      {VALIDATION_TYPE_LABELS[type]}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecognitions.map((recognition) => (
                  <TableRow key={recognition.recognition_id}>
                    <TableCell className="font-medium">
                      {recognition.recognition_id}
                    </TableCell>
                    {VALIDATION_TYPES.map((type) => {
                      const validation = hasValidation(recognition.completed_validations, type)
                      const isFiltered = selectedValidationTypes.has(type)
                      return (
                        <TableCell 
                          key={type} 
                          className={`text-center ${isFiltered ? 'bg-blue-50' : ''}`}
                        >
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/recognitions/${recognition.recognition_id}/view`}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <Eye className="w-4 h-4" />
                                Просмотр / Редактирование
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleResetClick(recognition.recognition_id)}
                              className="flex items-center gap-2 text-orange-600 focus:text-orange-600"
                            >
                              <RotateCcw className="w-4 h-4" />
                              Отправить заново
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Диалог подтверждения сброса */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отправить recognition на повторное распознавание?</DialogTitle>
            <DialogDescription>
              Это действие удалит все ваши валидации и изменения для recognition #{recognitionToReset}.
              Изначальные данные от Qwen будут сохранены. Recognition вернется в очередь доступных задач.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetDialogOpen(false)}
              disabled={resetting}
            >
              Отмена
            </Button>
            <Button
              onClick={handleResetConfirm}
              disabled={resetting}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {resetting ? 'Сброс...' : 'Отправить заново'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </RootLayout>
  )
}

