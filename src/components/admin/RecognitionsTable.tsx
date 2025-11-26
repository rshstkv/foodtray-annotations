'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Check, X, Eye, Minus, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import type { ExportPreviewData, ValidationType } from '@/types/domain'

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

interface RecognitionsTableProps {
  data: ExportPreviewData | null
  selectedIds: Set<number>
  onSelectionChange: (ids: Set<number>) => void
  onPreview: (recognitionId: number) => void
}

export function RecognitionsTable({
  data,
  selectedIds,
  onSelectionChange,
  onPreview,
}: RecognitionsTableProps) {
  const toggleSelection = (id: number) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    onSelectionChange(newSet)
  }

  const toggleSelectAll = () => {
    if (!data) return
    
    if (selectedIds.size === data.recognitions.length) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(data.recognitions.map(r => r.recognition_id)))
    }
  }

  const getStepIcon = (type: ValidationType, steps: any[]) => {
    const step = steps.find(s => s.type === type)
    
    if (!step || step.status === 'pending') {
      return (
        <div className="flex items-center justify-center">
          <Minus className="w-5 h-5 text-gray-300" />
        </div>
      )
    }
    
    if (step.status === 'completed') {
      return (
        <div className="flex items-center justify-center">
          <Check className="w-5 h-5 text-green-600" />
        </div>
      )
    }
    
    if (step.status === 'skipped') {
      return (
        <div className="flex items-center justify-center">
          <AlertCircle className="w-5 h-5 text-orange-500" />
        </div>
      )
    }
    
    return (
      <div className="flex items-center justify-center">
        <X className="w-5 h-5 text-gray-300" />
      </div>
    )
  }

  if (!data || data.recognitions.length === 0) {
    return (
      <Card className="p-12 text-center rounded-xl shadow-sm">
        <p className="text-gray-500">
          Нет данных для отображения. Примените фильтры.
        </p>
      </Card>
    )
  }

  const allSelected = selectedIds.size === data.recognitions.length

  return (
    <Card className="rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Checkbox
            id="select-all"
            checked={allSelected}
            onCheckedChange={toggleSelectAll}
          />
          <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
            Выбрать все ({selectedIds.size} из {data.recognitions.length})
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Recognition ID</TableHead>
              {VALIDATION_TYPES.map(type => (
                <TableHead key={type} className="text-center">
                  {VALIDATION_TYPE_LABELS[type]}
                </TableHead>
              ))}
              <TableHead>Items</TableHead>
              <TableHead>Annotations</TableHead>
              <TableHead>Пользователи</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.recognitions.map(recognition => {
              const itemsTotal = Object.values(recognition.items_by_type).reduce((a, b) => a + b, 0)
              const modifiedPercentage = recognition.annotations_count > 0
                ? Math.round((recognition.modified_annotations_count / recognition.annotations_count) * 100)
                : 0

              return (
                <TableRow key={recognition.recognition_id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(recognition.recognition_id)}
                      onCheckedChange={() => toggleSelection(recognition.recognition_id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium font-mono">
                    {recognition.recognition_id}
                  </TableCell>
                  {VALIDATION_TYPES.map(type => (
                    <TableCell key={type} className="text-center">
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <div className="cursor-help">
                            {getStepIcon(type, recognition.validation_steps)}
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-80">
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">
                              {VALIDATION_TYPE_LABELS[type]}
                            </h4>
                            {recognition.validation_steps.find(s => s.type === type) ? (
                              <>
                                <p className="text-sm text-gray-600">
                                  Статус: <Badge variant="outline">
                                    {recognition.validation_steps.find(s => s.type === type)?.status}
                                  </Badge>
                                </p>
                                {recognition.assigned_users.map(user => (
                                  <p key={user.user_id} className="text-xs text-gray-500">
                                    Пользователь: {user.email}
                                  </p>
                                ))}
                              </>
                            ) : (
                              <p className="text-sm text-gray-500">Не начат</p>
                            )}
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </TableCell>
                  ))}
                  <TableCell>
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <Badge variant="secondary" className="cursor-help">
                          {itemsTotal}
                        </Badge>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-64">
                        <div className="space-y-1">
                          <h4 className="text-sm font-semibold mb-2">Breakdown по типам:</h4>
                          {Object.entries(recognition.items_by_type).map(([type, count]) => (
                            count > 0 && (
                              <div key={type} className="flex justify-between text-sm">
                                <span className="text-gray-600">{type}:</span>
                                <span className="font-mono">{count}</span>
                              </div>
                            )
                          ))}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {recognition.annotations_count}
                      </Badge>
                      {recognition.modified_annotations_count > 0 && (
                        <Badge className="bg-green-600 text-xs">
                          {modifiedPercentage}% изм.
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {recognition.assigned_users.map(user => (
                        <span
                          key={user.user_id}
                          className="text-xs text-gray-600 truncate max-w-[120px]"
                          title={user.email}
                        >
                          {user.email}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onPreview(recognition.recognition_id)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Preview
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                      >
                        <Link
                          href={`/recognitions/${recognition.recognition_id}/view`}
                          target="_blank"
                        >
                          Открыть
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

