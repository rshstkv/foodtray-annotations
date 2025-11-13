'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, BarChart3, Download, ClipboardList } from 'lucide-react'

interface AdminLayoutProps {
  children: React.ReactNode
}

const navItems = [
  { 
    href: '/admin/assign', 
    label: 'Назначение задач', 
    icon: ClipboardList 
  },
  { 
    href: '/admin/users', 
    label: 'Пользователи', 
    icon: Users 
  },
  { 
    href: '/admin/statistics', 
    label: 'Статистика', 
    icon: BarChart3 
  },
  { 
    href: '/admin/export', 
    label: 'Экспорт', 
    icon: Download 
  },
]

export function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname()

  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href
    }
    return pathname.startsWith(href)
  }

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 bg-white p-6">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  )
}

