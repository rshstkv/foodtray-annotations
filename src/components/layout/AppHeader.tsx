'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { UserNav } from '@/components/UserNav'
import { Breadcrumbs } from './Breadcrumbs'

interface AppHeaderProps {
  isAdmin?: boolean
  userName?: string
  userEmail?: string
}

export function AppHeader({ isAdmin, userName, userEmail }: AppHeaderProps) {
  const pathname = usePathname()

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Breadcrumbs */}
          <div className="flex items-center gap-6">
            <Link href="/tasks" className="flex items-center gap-3 group">
              <div className="relative w-10 h-10 transition-transform group-hover:scale-105">
                <Image
                  src="/logo.svg"
                  alt="RRS Logo"
                  width={40}
                  height={40}
                  priority
                />
              </div>
              <span className="text-lg font-semibold text-gray-900">
                RRS Annotations
              </span>
            </Link>
            
            <div className="h-6 w-px bg-gray-200" />
            
            <Breadcrumbs />
          </div>

          {/* Navigation and User */}
          <div className="flex items-center gap-4">
            {/* Navigation Links */}
            <nav className="flex items-center gap-2">
              <Link
                href="/tasks"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname.startsWith('/task') || pathname === '/tasks'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Задачи
              </Link>
              
              <Link
                href="/admin/statistics"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/admin/statistics'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Статистика
              </Link>
              
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname.startsWith('/admin') && pathname !== '/admin/statistics'
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Админ
                </Link>
              )}
            </nav>

            <div className="h-6 w-px bg-gray-200" />

            {/* User Menu */}
            {userName && userEmail && (
              <UserNav userName={userName} userEmail={userEmail} />
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

