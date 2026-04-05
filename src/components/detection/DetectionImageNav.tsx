'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

interface DetectionImageNavProps {
  currentIndex: number
  totalImages: number
  onNavigate: (index: number) => void
  statusFilter: 'all' | 'pending' | 'done'
  onStatusFilterChange: (filter: 'all' | 'pending' | 'done') => void
}

export function DetectionImageNav({
  currentIndex,
  totalImages,
  onNavigate,
  statusFilter,
  onStatusFilterChange,
}: DetectionImageNavProps) {
  const [jumpTo, setJumpTo] = useState('')

  const handleJump = () => {
    const n = parseInt(jumpTo)
    if (!isNaN(n) && n >= 1 && n <= totalImages) {
      onNavigate(n - 1)
      setJumpTo('')
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleJump()
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="w-4 h-4" />
          <kbd className="text-xs text-gray-400 ml-0.5">&larr;</kbd>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate(Math.min(totalImages - 1, currentIndex + 1))}
          disabled={currentIndex >= totalImages - 1}
        >
          <kbd className="text-xs text-gray-400 mr-0.5">&rarr;</kbd>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Input
          type="number"
          placeholder="#"
          className="w-20 h-8 text-sm"
          value={jumpTo}
          onChange={(e) => setJumpTo(e.target.value)}
          onKeyDown={handleKeyDown}
          min={1}
          max={totalImages}
        />
        <Button variant="outline" size="sm" onClick={handleJump} className="h-8">
          Go
        </Button>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {(['all', 'pending', 'done'] as const).map((f) => (
          <Button
            key={f}
            variant={statusFilter === f ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onStatusFilterChange(f)}
            className="h-7 text-xs"
          >
            {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Done'}
          </Button>
        ))}
      </div>
    </div>
  )
}
