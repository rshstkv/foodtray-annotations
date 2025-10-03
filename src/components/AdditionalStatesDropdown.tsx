"use client"

import { MoreHorizontal, AlertTriangle, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface AdditionalStatesDropdownProps {
  onStateChange: (state: 'bbox_error' | 'unknown') => void
}

export function AdditionalStatesDropdown({ onStateChange }: AdditionalStatesDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-gray-400 hover:text-gray-600"
          title="Дополнительные опции"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() => onStateChange('bbox_error')}
          className="flex items-center gap-2 cursor-pointer"
        >
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <span>Ошибка границ</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onStateChange('unknown')}
          className="flex items-center gap-2 cursor-pointer"
        >
          <HelpCircle className="h-4 w-4 text-gray-500" />
          <span>Неизвестно</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
