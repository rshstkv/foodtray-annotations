'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUser } from '@/hooks/useUser'
import { apiFetch } from '@/lib/api-response'
import { Download } from 'lucide-react'

interface User {
  id: string
  email: string
  full_name: string | null
}

export default function AdminExportPage() {
  const { user, isAdmin } = useUser()
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('completed')
  const [exporting, setExporting] = useState(false)
  const [preview, setPreview] = useState<{ count: number } | null>(null)

  useEffect(() => {
    if (isAdmin) {
      loadUsers()
    }
  }, [isAdmin])

  useEffect(() => {
    loadPreview()
  }, [selectedUserId, selectedStatus])

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

  const loadPreview = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedUserId && selectedUserId !== 'all') params.append('userId', selectedUserId)
      if (selectedStatus && selectedStatus !== 'all') params.append('status', selectedStatus)

      const response = await apiFetch<{ tasks: unknown[]; stats: unknown }>(
        `/api/tasks/list?${params.toString()}`
      )
      
      if (response.success && response.data) {
        setPreview({ count: response.data.tasks.length })
      }
    } catch (err) {
      console.error('Error loading preview:', err)
    }
  }

  const handleExport = async () => {
    try {
      setExporting(true)

      const params = new URLSearchParams()
      if (selectedUserId && selectedUserId !== 'all') params.append('userId', selectedUserId)
      if (selectedStatus && selectedStatus !== 'all') params.append('status', selectedStatus)

      // TODO: Implement export API
      const response = await fetch(`/api/admin/export?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error('Export failed')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export_${selectedUserId || 'all'}_${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error exporting:', err)
      alert('Ошибка экспорта данных')
    } finally {
      setExporting(false)
    }
  }

  if (!user || !isAdmin) {
    return <div>Loading...</div>
  }

  return (
    <div className="p-8 max-w-4xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Экспорт данных</h1>
            <p className="text-gray-600 text-base">Экспорт завершенных задач в JSON формате</p>
          </div>

          <Card className="p-6 rounded-xl shadow-sm">
            {/* Filters */}
            <div className="space-y-6 mb-8">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Пользователь
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Статус задач
                </label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Только завершенные</SelectItem>
                    <SelectItem value="in_progress">В работе</SelectItem>
                    <SelectItem value="all">Все статусы</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preview */}
            {preview && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm text-blue-900">
                  <strong>{preview.count}</strong> {preview.count === 1 ? 'задача' : 'задач'} будет экспортировано
                </div>
              </div>
            )}

            {/* Export button */}
            <Button
              onClick={handleExport}
              disabled={exporting || !preview || preview.count === 0}
              className="w-full h-10 rounded-lg"
            >
              <Download className="w-4 h-4 mr-2" />
              {exporting ? 'Экспорт...' : 'Скачать JSON'}
            </Button>

            {/* Info */}
            <div className="mt-6 text-xs text-gray-500">
              <p className="mb-2">Экспортируемые данные включают:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Recognitions (recognition_id, correct_dishes, menu_all)</li>
                <li>Images (storage_path, width, height)</li>
                <li>Annotations (bbox, object_type, dish_index, etc.)</li>
              </ul>
            </div>
          </Card>
        </div>
  )
}

