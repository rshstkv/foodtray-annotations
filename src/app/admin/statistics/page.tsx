'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'
import { useToast } from '@/hooks/use-toast'
import { Eye, Check, X, MoreVertical, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import type { RecognitionWithValidations, ValidationType, CompletedValidationInfo } from '@/types/domain'
import { SearchBar } from '@/components/admin/SearchBar'
import { Pagination } from '@/components/admin/Pagination'

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
  const { toast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('all')
  const [selectedValidationTypes, setSelectedValidationTypes] = useState<Set<ValidationType>>(new Set())
  const [recognitions, setRecognitions] = useState<RecognitionWithValidations[]>([])
  const [loading, setLoading] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [recognitionToReset, setRecognitionToReset] = useState<number | null>(null)
  const [resetting, setResetting] = useState(false)
  
  // Search & Pagination
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50

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
      }
    } catch (err) {
      console.error('Error loading recognitions:', err)
    } finally {
      setLoading(false)
    }
  }

  // Фильтрация recognitions на клиенте
  const filteredRecognitions = useMemo(() => {
    return recognitions.filter(recognition => {
      // Если не выбраны типы валидаций - показываем все
      if (selectedValidationTypes.size === 0) {
        return true
      }
      
      // Проверяем, что ВСЕ выбранные типы валидаций присутствуют
      // Это более строгая фильтрация - показываем только те recognitions,
      // у которых есть ВСЕ выбранные типы валидаций
      const completedTypes = new Set(
        recognition.completed_validations.map(v => v.validation_type)
      )
      
      return Array.from(selectedValidationTypes).every(type => 
        completedTypes.has(type)
      )
    })
  }, [recognitions, selectedValidationTypes])

  // Статистика по пользователям
  const userValidationStats = useMemo(() => {
    // Создаём карту id -> email из списка пользователей
    const userEmailMap = new Map(users.map(u => [u.id, u.email]))
    
    const stats = new Map<string, {
      email: string
      counts: Record<ValidationType, number>
      total: number
    }>()
    
    // Инициализируем всех пользователей из списка
    for (const user of users) {
      stats.set(user.id, {
        email: user.email,
        counts: {
          FOOD_VALIDATION: 0,
          PLATE_VALIDATION: 0,
          BUZZER_VALIDATION: 0,
          OCCLUSION_VALIDATION: 0,
          BOTTLE_ORIENTATION_VALIDATION: 0,
        },
        total: 0,
      })
    }
    
    // Добавляем данные из завершённых валидаций
    for (const rec of recognitions) {
      for (const val of rec.completed_validations) {
        if (!stats.has(val.assigned_to)) {
          // Пользователь не в списке users (возможно удалён)
          // Пытаемся взять email из userEmailMap, если нет - из валидации, если нет - Unknown
          stats.set(val.assigned_to, {
            email: userEmailMap.get(val.assigned_to) || val.assigned_to_email || 'Unknown',
            counts: {
              FOOD_VALIDATION: 0,
              PLATE_VALIDATION: 0,
              BUZZER_VALIDATION: 0,
              OCCLUSION_VALIDATION: 0,
              BOTTLE_ORIENTATION_VALIDATION: 0,
            },
            total: 0,
          })
        }
        const userStat = stats.get(val.assigned_to)!
        userStat.counts[val.validation_type]++
        userStat.total++
      }
    }
    
    return Array.from(stats.values()).sort((a, b) => b.total - a.total)
  }, [recognitions, users])

  // Фильтрация по поиску
  const searchFiltered = useMemo(() => {
    if (!searchQuery.trim()) return filteredRecognitions
    const query = searchQuery.trim().toLowerCase()
    return filteredRecognitions.filter(r => 
      r.recognition_id.toString().includes(query)
    )
  }, [filteredRecognitions, searchQuery])

  // Пагинация
  const paginatedRecognitions = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return searchFiltered.slice(start, start + pageSize)
  }, [searchFiltered, currentPage, pageSize])

  const totalPages = Math.ceil(searchFiltered.length / pageSize)

  // Reset to page 1 when search or filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedValidationTypes, selectedUserId])

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

      {/* User Statistics */}
      {isAdmin && userValidationStats.length > 0 && (
        <Card className="mb-6 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
            <h2 className="text-lg font-semibold text-gray-900">📊 Статистика по пользователям</h2>
            <p className="text-sm text-gray-600 mt-1">Количество выполненных валидаций каждого типа</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  {VALIDATION_TYPES.map((type) => (
                    <TableHead key={type} className="text-center">
                      {VALIDATION_TYPE_LABELS[type]}
                    </TableHead>
                  ))}
                  <TableHead className="text-center font-semibold">Всего</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userValidationStats.map((userStat) => (
                  <TableRow key={userStat.email}>
                    <TableCell className="font-medium">{userStat.email}</TableCell>
                    {VALIDATION_TYPES.map((type) => (
                      <TableCell key={type} className="text-center">
                        <span className={userStat.counts[type] > 0 ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                          {userStat.counts[type]}
                        </span>
                      </TableCell>
                    ))}
                    <TableCell className="text-center">
                      <span className="font-bold text-blue-600">{userStat.total}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Info Panel */}
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          💡 Для экспорта данных используйте специальную страницу{' '}
          <Link href="/admin/export" className="font-semibold underline hover:text-blue-900">
            Экспорт данных
          </Link>
          {' '}с расширенными фильтрами и контролем целостности.
        </p>
      </div>

      {/* Search and Count */}
      {recognitions.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-4">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Поиск по Recognition ID..."
            className="flex-1 max-w-md"
          />
          <div className="text-sm text-gray-600">
            Показано {paginatedRecognitions.length} из {searchFiltered.length} recognitions
            {searchFiltered.length !== filteredRecognitions.length && ` (всего: ${filteredRecognitions.length})`}
          </div>
        </div>
      )}

      {/* Таблица recognitions */}
      {loading ? (
        <Card className="p-12 text-center rounded-xl shadow-sm">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </Card>
      ) : searchFiltered.length === 0 ? (
        <Card className="p-12 text-center rounded-xl shadow-sm">
          <p className="text-gray-500">
            {recognitions.length === 0 
              ? 'Нет завершенных валидаций' 
              : searchQuery.trim() 
                ? `Нет recognitions с ID "${searchQuery}"`
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
                {paginatedRecognitions.map((recognition) => (
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

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          loading={loading}
          className="mt-6"
        />
      )}

      {/* Диалог подтверждения сброса */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отправить recognition на повторное распознавание?</DialogTitle>
            <DialogDescription>
              Это действие удалит все валидации и изменения для recognition #{recognitionToReset}.
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
  )
}
