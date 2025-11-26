'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Copy, Download, Check, X, AlertCircle, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface RecognitionPreviewModalProps {
  recognitionId: number | null
  open: boolean
  onClose: () => void
}

export function RecognitionPreviewModal({
  recognitionId,
  open,
  onClose,
}: RecognitionPreviewModalProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<'json' | 'summary' | 'changes'>('summary')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open && recognitionId) {
      loadData()
    } else {
      setData(null)
      setActiveTab('summary')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recognitionId])

  const loadData = async () => {
    if (!recognitionId) return

    try {
      setLoading(true)
      const response = await fetch(`/api/admin/export?recognitionIds=${recognitionId}`)
      
      if (!response.ok) {
        throw new Error('Failed to load data')
      }

      const jsonData = await response.json()
      setData(jsonData.recognitions[0] || null)
    } catch (error) {
      console.error('Error loading recognition data:', error)
      toast({
        title: 'Ошибка',
        description: 'Не удалось загрузить данные recognition',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async () => {
    if (!data) return

    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setCopied(true)
      toast({
        title: 'Скопировано',
        description: 'JSON скопирован в буфер обмена',
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось скопировать в буфер обмена',
        variant: 'destructive',
      })
    }
  }

  const downloadJSON = () => {
    if (!data) return

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recognition_${recognitionId}.json`
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const getChangedAnnotations = () => {
    if (!data) return []
    
    const changed = []
    for (const image of data.images || []) {
      for (const annotation of image.annotations || []) {
        if (annotation.was_modified) {
          changed.push({
            ...annotation,
            image_name: image.image_name,
            camera_number: image.camera_number,
          })
        }
      }
    }
    return changed
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Preview Recognition #{recognitionId}
          </DialogTitle>
          <DialogDescription>
            Предпросмотр экспортируемых данных для одного recognition
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : !data ? (
          <div className="text-center py-12 text-gray-500">
            Данные не загружены
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex items-center gap-2 border-b">
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'summary'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Сводка
              </button>
              <button
                onClick={() => setActiveTab('changes')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'changes'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Изменения
              </button>
              <button
                onClick={() => setActiveTab('json')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'json'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                JSON
              </button>
            </div>

            {/* Content */}
            <div className="mt-4">
              {activeTab === 'summary' && (
                <div className="space-y-4">
                  {/* Metadata */}
                  {data.validation_metadata && (
                    <Card className="p-4">
                      <h3 className="text-sm font-semibold mb-3">Метаданные валидации</h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Work Log ID:</span>
                          <span className="ml-2 font-mono">{data.validation_metadata.work_log_id}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Пользователь:</span>
                          <span className="ml-2">{data.validation_metadata.assigned_to_email}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Завершено:</span>
                          <span className="ml-2">
                            {new Date(data.validation_metadata.completed_at).toLocaleString('ru-RU')}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Batch ID:</span>
                          <span className="ml-2 font-mono">{data.batch_id || '-'}</span>
                        </div>
                      </div>
                      <div className="mt-3">
                        <span className="text-sm text-gray-600">Этапы валидации:</span>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {data.validation_metadata.validation_steps.map((step: any) => (
                            <Badge
                              key={step.type}
                              variant={step.status === 'completed' ? 'default' : 'outline'}
                              className={
                                step.status === 'skipped'
                                  ? 'border-orange-500 text-orange-600'
                                  : ''
                              }
                            >
                              {step.status === 'completed' && <Check className="w-3 h-3 mr-1" />}
                              {step.status === 'skipped' && <AlertCircle className="w-3 h-3 mr-1" />}
                              {step.type.replace('_VALIDATION', '')}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* Items */}
                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-3">
                      Items ({data.recipe?.items?.length || 0})
                    </h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {data.recipe?.items?.map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{item.item_type}</Badge>
                              <span className="text-sm font-medium">{item.name || 'Unnamed'}</span>
                            </div>
                            {item.external_id && (
                              <p className="text-xs text-gray-500 mt-1">
                                ID: {item.external_id}
                              </p>
                            )}
                          </div>
                          <Badge variant="secondary">x{item.quantity}</Badge>
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Annotations */}
                  <Card className="p-4">
                    <h3 className="text-sm font-semibold mb-3">Аннотации</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {data.images?.map((image: any) => {
                        const modifiedCount = image.annotations.filter((a: any) => a.was_modified).length
                        return (
                          <div key={image.camera_number} className="p-3 bg-gray-50 rounded">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">{image.image_name}</span>
                              <Badge variant="secondary">{image.annotations.length}</Badge>
                            </div>
                            {modifiedCount > 0 && (
                              <Badge className="bg-green-600 text-xs">
                                {modifiedCount} изменено
                              </Badge>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                </div>
              )}

              {activeTab === 'changes' && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold mb-3">
                    Измененные аннотации ({getChangedAnnotations().length})
                  </h3>
                  {getChangedAnnotations().length === 0 ? (
                    <p className="text-center text-gray-500 py-8">
                      Нет измененных аннотаций
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {getChangedAnnotations().map((annotation: any, idx: number) => (
                        <Card key={idx} className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <Badge variant="outline" className="mb-1">
                                {annotation.image_name}
                              </Badge>
                              <p className="text-xs text-gray-600">
                                Item ID: {annotation.item_id}
                              </p>
                            </div>
                            {annotation.is_occluded && (
                              <Badge variant="outline" className="bg-orange-50 text-orange-600">
                                Окклюзия
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-gray-600 mb-1">Original BBox:</p>
                              {annotation.original_bbox ? (
                                <code className="block p-1 bg-red-50 rounded text-red-700">
                                  {JSON.stringify(annotation.original_bbox)}
                                </code>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </div>
                            <div>
                              <p className="text-gray-600 mb-1">Current BBox:</p>
                              <code className="block p-1 bg-green-50 rounded text-green-700">
                                {JSON.stringify(annotation.bbox)}
                              </code>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'json' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">JSON Structure</h3>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyToClipboard}
                        disabled={copied}
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4 mr-1" />
                            Скопировано
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-1" />
                            Копировать
                          </>
                        )}
                      </Button>
                      <Button variant="outline" size="sm" onClick={downloadJSON}>
                        <Download className="w-4 h-4 mr-1" />
                        Скачать
                      </Button>
                    </div>
                  </div>
                  <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-x-auto max-h-[500px] overflow-y-auto">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose} variant="outline">
            Закрыть
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

