'use client'

import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface TaskHeaderProps {
  taskId: string
  recognitionId: string
}

export function TaskHeader({ taskId, recognitionId }: TaskHeaderProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  return (
    <div className="flex items-center gap-4 px-6 py-2 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-medium">Задача:</span>
        <code className="text-xs font-mono text-gray-700 bg-white px-2 py-1 rounded border">
          {taskId.substring(0, 8)}...
        </code>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => handleCopy(taskId, 'task')}
        >
          {copiedField === 'task' ? (
            <Check className="h-3 w-3 text-green-600" />
          ) : (
            <Copy className="h-3 w-3 text-gray-400" />
          )}
        </Button>
      </div>

      <div className="h-4 w-px bg-gray-300" />

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-medium">Recognition:</span>
        <code className="text-xs font-mono text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200">
          {recognitionId}
        </code>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => handleCopy(recognitionId, 'recognition')}
        >
          {copiedField === 'recognition' ? (
            <Check className="h-3 w-3 text-green-600" />
          ) : (
            <Copy className="h-3 w-3 text-gray-400" />
          )}
        </Button>
      </div>
    </div>
  )
}

