'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

export interface Breadcrumb {
  label: string
  href?: string
}

interface AnnotationHeaderProps {
  breadcrumbs?: Breadcrumb[]
  title: string
  subtitle?: string
  actions?: React.ReactNode
  info?: React.ReactNode
}

export function AnnotationHeader({
  breadcrumbs = [],
  title,
  subtitle,
  actions,
  info
}: AnnotationHeaderProps) {
  const pathname = usePathname()
  
  // Генерируем базовые breadcrumbs если не переданы
  const defaultBreadcrumbs: Breadcrumb[] = [
    { label: 'Главная', href: '/' },
    { label: 'Аннотации', href: '/annotations' }
  ]

  const finalBreadcrumbs = breadcrumbs.length > 0 ? breadcrumbs : defaultBreadcrumbs

  return (
    <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
      <div className="max-w-[1920px] mx-auto px-6 py-3">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 text-sm mb-2">
          {finalBreadcrumbs.map((crumb, index) => (
            <div key={index} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="w-4 h-4 text-gray-400" />}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-gray-400">{crumb.label}</span>
              )}
            </div>
          ))}
        </nav>

        {/* Header Content */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-4 mb-1">
              <h1 className="text-xl font-bold text-gray-900">{title}</h1>
              {info}
            </div>
            {subtitle && (
              <p className="text-sm text-gray-600">{subtitle}</p>
            )}
          </div>

          {actions && (
            <div className="flex items-center gap-4">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


