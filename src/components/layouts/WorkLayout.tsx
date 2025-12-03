'use client'

import { ReactNode } from 'react'

interface WorkLayoutProps {
  sidebar: ReactNode
  images: ReactNode
  header?: ReactNode
  actions?: ReactNode
}

/**
 * Layout для validation session
 * 2-колоночная структура: Sidebar | Images
 */
export function WorkLayout({
  sidebar,
  images,
  header,
  actions,
}: WorkLayoutProps) {
  return (
    <div className="h-[calc(100vh-73px)] flex flex-col">
      {/* Header */}
      {header && (
        <div className="flex-none bg-white border-b border-gray-200">
          {header}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Sidebar - Items List */}
        <div className="w-80 flex-none bg-white border-r border-gray-200 overflow-y-auto">
          {sidebar}
        </div>

        {/* Images - Main work area */}
        <div className="flex-1 bg-gray-100 overflow-auto p-4 min-h-0">
          {images}
        </div>
      </div>

      {/* Actions */}
      {actions && (
        <div className="flex-none bg-white border-t border-gray-200 px-6 py-4">
          {actions}
        </div>
      )}
    </div>
  )
}

