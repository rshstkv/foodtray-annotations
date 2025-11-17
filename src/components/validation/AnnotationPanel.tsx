'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertTriangle, XCircle, Eye, EyeOff, Trash2 } from 'lucide-react'
import type { AnnotationView, Image, TrayItem, RecipeLineOption } from '@/types/domain'
import { ITEM_TYPE_COLORS, ITEM_TYPE_LABELS } from '@/types/domain'

interface AnnotationPanelProps {
  selectedItem: TrayItem | null
  annotations: AnnotationView[]
  images: Image[]
  recipeLineOptions: RecipeLineOption[]
  onAnnotationSelect: (id: number | string) => void
  onAnnotationDelete: (id: number | string) => void
  onToggleOcclusion: (id: number | string) => void
  selectedAnnotationId: number | string | null
}

export function AnnotationPanel({
  selectedItem,
  annotations,
  images,
  recipeLineOptions,
  onAnnotationSelect,
  onAnnotationDelete,
  onToggleOcclusion,
  selectedAnnotationId,
}: AnnotationPanelProps) {
  if (!selectedItem) {
    return (
      <Card className="p-4">
        <p className="text-sm text-gray-500 text-center">
          Выберите объект для просмотра аннотаций
        </p>
      </Card>
    )
  }

  // Получить название объекта
  const getItemLabel = (): string => {
    if (selectedItem.recipe_line_option_id) {
      const option = recipeLineOptions.find((opt) => opt.id === selectedItem.recipe_line_option_id)
      if (option?.name) return option.name
    }
    if (selectedItem.metadata?.name) return String(selectedItem.metadata.name)
    if (selectedItem.menu_item_external_id) return selectedItem.menu_item_external_id
    return ITEM_TYPE_LABELS[selectedItem.item_type]
  }

  // Группировать аннотации по камерам
  const annotationsByCamera = new Map<number, AnnotationView[]>()
  annotations
    .filter((ann) => ann.tray_item_id === selectedItem.id && !ann.is_deleted)
    .forEach((ann) => {
      const existing = annotationsByCamera.get(ann.image_id) || []
      annotationsByCamera.set(ann.image_id, [...existing, ann])
    })

  // Проверка: есть ли аннотации на всех камерах
  const missingCameras = images.filter((img) => !annotationsByCamera.has(img.id))

  const itemColor = ITEM_TYPE_COLORS[selectedItem.item_type] || '#6B7280'

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: itemColor }}
          />
          <h3 className="font-semibold text-gray-900 truncate">{getItemLabel()}</h3>
        </div>
        <p className="text-xs text-gray-500">{ITEM_TYPE_LABELS[selectedItem.item_type]}</p>
      </div>

      {/* Warnings */}
      {missingCameras.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800">Неполная разметка</p>
              <p className="text-xs text-yellow-700 mt-1">
                Объект должен быть на всех камерах: {missingCameras.map((c) => c.camera_number).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Annotations by camera */}
      <div className="space-y-4">
        {images.map((image) => {
          const imageAnnotations = annotationsByCamera.get(image.id) || []
          const hasAnnotations = imageAnnotations.length > 0

          return (
            <div key={image.id} className="border-l-4 pl-3" style={{ borderColor: itemColor }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">
                    📷 Камера {image.camera_number}
                  </span>
                  {hasAnnotations ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                </div>
                <span className="text-xs text-gray-500">{imageAnnotations.length} шт.</span>
              </div>

              {imageAnnotations.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Нет аннотаций</p>
              ) : (
                <div className="space-y-2">
                  {imageAnnotations.map((ann) => {
                    const isSelected = ann.id === selectedAnnotationId
                    const isTemp = ann.is_temp

                    return (
                      <div
                        key={ann.id}
                        className={`p-2 rounded border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                            : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => onAnnotationSelect(ann.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-mono text-gray-600">
                                [{Math.round(ann.bbox.w)}×{Math.round(ann.bbox.h)}]
                              </span>
                              {ann.is_occluded && (
                                <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                                  перекрыта
                                </span>
                              )}
                              {isTemp && (
                                <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                  🔵 не сохранено
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 font-mono truncate">
                              x:{Math.round(ann.bbox.x)} y:{Math.round(ann.bbox.y)}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                onToggleOcclusion(ann.id)
                              }}
                              title={ann.is_occluded ? 'Убрать окклюзию' : 'Отметить как перекрыта'}
                            >
                              {ann.is_occluded ? (
                                <EyeOff className="w-3.5 h-3.5 text-red-600" />
                              ) : (
                                <Eye className="w-3.5 h-3.5 text-gray-400" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (confirm('Удалить аннотацию?')) {
                                  onAnnotationDelete(ann.id)
                                }
                              }}
                              title="Удалить"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Summary */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 bg-gray-50 rounded">
            <p className="text-gray-500">Всего аннотаций</p>
            <p className="font-semibold text-gray-900">
              {annotations.filter((a) => a.tray_item_id === selectedItem.id && !a.is_deleted).length}
            </p>
          </div>
          <div className="p-2 bg-gray-50 rounded">
            <p className="text-gray-500">Перекрытых</p>
            <p className="font-semibold text-red-600">
              {
                annotations.filter(
                  (a) =>
                    a.tray_item_id === selectedItem.id && !a.is_deleted && a.is_occluded
                ).length
              }
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}

