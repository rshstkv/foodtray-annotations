'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

interface BreadcrumbItem {
  label: string
  href?: string
}

export function Breadcrumbs() {
  const pathname = usePathname()
  
  const items = getBreadcrumbItems(pathname)
  
  return (
    <nav className="flex items-center gap-2 text-sm text-gray-600">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          {index > 0 && <ChevronRight className="w-4 h-4 text-gray-400" />}
          {item.href ? (
            <Link 
              href={item.href}
              className="hover:text-gray-900 transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  )
}

function getBreadcrumbItems(pathname: string): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = []

  if (pathname === '/tasks') {
    // На главной странице задач показываем только "Задачи"
    items.push({ label: 'Задачи' })
  } else if (pathname.startsWith('/task/')) {
    // Для отдельной задачи показываем ссылку назад на список
    const taskId = pathname.split('/')[2]
    const shortId = taskId.split('-')[0] // Показываем только первую часть UUID
    items.push(
      { label: 'Задачи', href: '/tasks' },
      { label: `Задача #${shortId}` }
    )
  } else if (pathname.startsWith('/admin')) {
    items.push({ label: 'Админ', href: '/admin' })
    
    if (pathname === '/admin/users') {
      items.push({ label: 'Пользователи' })
    } else if (pathname === '/admin/statistics') {
      items.push({ label: 'Статистика' })
    } else if (pathname === '/admin/export') {
      items.push({ label: 'Экспорт' })
    } else if (pathname.match(/\/admin\/users\/[^/]+$/)) {
      const userId = pathname.split('/')[3]
      items.push(
        { label: 'Пользователи', href: '/admin/users' },
        { label: userId }
      )
    }
  }

  return items
}

