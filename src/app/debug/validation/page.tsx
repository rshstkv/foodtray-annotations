'use client'

import { useState } from 'react'
import { RootLayout } from '@/components/layouts/RootLayout'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api-response'
import { useUser } from '@/hooks/useUser'

export default function ValidationDebugPage() {
  const { user, isAdmin } = useUser()
  const [loading, setLoading] = useState(false)
  const [debugData, setDebugData] = useState<any>(null)

  const loadDebugInfo = async () => {
    try {
      setLoading(true)
      const response = await apiFetch('/api/debug/validation-state')
      if (response.success && response.data) {
        setDebugData(response.data)
      }
    } catch (error) {
      console.error('Error loading debug info:', error)
      alert('Ошибка загрузки диагностики')
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <RootLayout>
        <div className="p-8">
          <p>Загрузка...</p>
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
      <div className="p-8 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Диагностика системы валидации</h1>
        
        <Button 
          onClick={loadDebugInfo} 
          disabled={loading}
          className="mb-6"
        >
          {loading ? 'Загрузка...' : 'Запустить диагностику'}
        </Button>

        {debugData && (
          <div className="space-y-6">
            {/* Analysis Summary */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">📊 Анализ</h2>
              <div className="space-y-2">
                <div className={`p-3 rounded ${debugData.analysis.has_recognitions ? 'bg-green-50' : 'bg-red-50'}`}>
                  <strong>Recognitions в БД:</strong> {debugData.analysis.has_recognitions ? '✅ Есть' : '❌ Нет'}
                  <div className="text-sm text-gray-600 mt-1">
                    Всего: {debugData.database.recognitions.total}
                  </div>
                </div>
                
                <div className={`p-3 rounded ${debugData.analysis.has_active_config ? 'bg-green-50' : 'bg-red-50'}`}>
                  <strong>Активная конфигурация:</strong> {debugData.analysis.has_active_config ? '✅ Есть' : '❌ Нет'}
                  <div className="text-sm text-gray-600 mt-1">
                    Активных типов валидации: {debugData.database.validation_config.active?.length || 0}
                  </div>
                </div>
                
                <div className={`p-3 rounded ${debugData.analysis.blocking_work_logs === 0 ? 'bg-green-50' : 'bg-yellow-50'}`}>
                  <strong>Блокирующие work_logs:</strong> {debugData.analysis.blocking_work_logs}
                  <div className="text-sm text-gray-600 mt-1">
                    {debugData.analysis.blocking_work_logs === 0 ? 'Нет блокировок' : 'Есть work_logs блокирующие recognitions'}
                  </div>
                </div>

                <div className={`p-3 rounded ${debugData.acquire_test.success ? 'bg-green-50' : 'bg-red-50'}`}>
                  <strong>Тест захвата задачи:</strong> {debugData.acquire_test.success ? '✅ Успешно' : '❌ Не удалось'}
                  {debugData.acquire_test.error && (
                    <div className="text-sm text-red-600 mt-1">
                      Ошибка: {debugData.acquire_test.error}
                    </div>
                  )}
                  {debugData.acquire_test.data && (
                    <div className="text-sm text-gray-600 mt-1">
                      Recognition ID: {debugData.acquire_test.data.recognition_id}, 
                      Steps: {debugData.acquire_test.data.steps_count}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Recognitions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">🗂️ Recognitions</h2>
              <div className="mb-2">
                <strong>Всего:</strong> {debugData.database.recognitions.total}
              </div>
              {debugData.database.recognitions.error && (
                <div className="text-red-600 mb-2">
                  Ошибка: {debugData.database.recognitions.error}
                </div>
              )}
              {debugData.database.recognitions.samples && debugData.database.recognitions.samples.length > 0 && (
                <div className="mt-4">
                  <strong className="text-sm text-gray-600">Примеры (первые 5):</strong>
                  <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto">
                    {JSON.stringify(debugData.database.recognitions.samples, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Validation Config */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">⚙️ Конфигурация валидации</h2>
              <div className="space-y-2 mb-4">
                <div>Всего типов: {debugData.database.validation_config.all?.length || 0}</div>
                <div className="text-green-600">Активных: {debugData.database.validation_config.active?.length || 0}</div>
                <div className="text-gray-500">Неактивных: {debugData.database.validation_config.inactive?.length || 0}</div>
              </div>
              <pre className="p-3 bg-gray-50 rounded text-xs overflow-auto">
                {JSON.stringify(debugData.database.validation_config.all, null, 2)}
              </pre>
            </div>

            {/* Work Logs */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">📝 Work Logs</h2>
              <div className="space-y-2 mb-4">
                <div>Всего: {debugData.database.work_logs.total}</div>
                <div className="text-orange-600">In Progress: {debugData.database.work_logs.by_status.in_progress}</div>
                <div className="text-green-600">Completed: {debugData.database.work_logs.by_status.completed}</div>
                <div className="text-gray-500">Abandoned: {debugData.database.work_logs.by_status.abandoned}</div>
              </div>
              
              {debugData.database.work_logs.total > 0 && (
                <>
                  <h3 className="font-semibold mt-4 mb-2">Детали:</h3>
                  <div className="space-y-4">
                    {Object.entries(debugData.database.work_logs.details).map(([status, logs]: [string, any]) => (
                      logs.length > 0 && (
                        <div key={status}>
                          <strong className="text-sm capitalize">{status}:</strong>
                          <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto max-h-64">
                            {JSON.stringify(logs, null, 2)}
                          </pre>
                        </div>
                      )
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Raw Data */}
            <details className="bg-white rounded-lg shadow p-6">
              <summary className="text-xl font-semibold cursor-pointer">🔍 Полные данные (JSON)</summary>
              <pre className="mt-4 p-3 bg-gray-50 rounded text-xs overflow-auto max-h-96">
                {JSON.stringify(debugData, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </RootLayout>
  )
}

