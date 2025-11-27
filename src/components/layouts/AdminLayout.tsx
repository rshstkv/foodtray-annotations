'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, ListOrdered, BarChart3, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdminLayoutProps {
  children: ReactNode
}

const adminNav = [
  {
    href: '/admin',
    label: 'Обзор',
    icon: BarChart3,
    exact: true,
  },
  {
    href: '/admin/users',
    label: 'Пользователи',
    icon: Users,
  },
  {
    href: '/admin/priorities',
    label: 'Приоритеты',
    icon: ListOrdered,
  },
  {
    href: '/admin/statistics',
    label: 'Статистика',
    icon: BarChart3,
  },
  {
    href: '/admin/export',
    label: 'Экспорт данных',
    icon: Download,
  },
]

export function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname()

  return (
    <div className="flex h-[calc(100vh-73px)]">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200">
        <nav className="p-4 space-y-1">
          {adminNav.map((item) => {
            const Icon = item.icon
            const isActive = item.exact
              ? pathname === item.href
              : pathname?.startsWith(item.href) && item.href !== '/admin'

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                )}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-gray-50">
        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}

