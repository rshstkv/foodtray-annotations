'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { User, Settings, LogOut, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RootLayoutProps {
  children: ReactNode
  userName?: string
  userEmail?: string
  isAdmin?: boolean
}

export function RootLayout({ children, userName, userEmail, isAdmin }: RootLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3">
              <Image 
                src="/logo.svg" 
                alt="RRS Logo" 
                width={32} 
                height={32}
                className="rounded-lg"
              />
              <span className="text-xl font-semibold text-gray-900">
                RRS Annotation
              </span>
            </Link>

            {/* User Menu */}
            {(userName || userEmail) && (
              <div className="flex items-center gap-4">
                <Link href="/my-validations">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className={cn(
                      pathname === '/my-validations' && 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700'
                    )}
                  >
                    <ClipboardList className="w-4 h-4 mr-2" />
                    Мои валидации
                  </Button>
                </Link>

                {isAdmin && (
                  <Link href="/admin">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className={cn(
                        pathname?.startsWith('/admin') && 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700'
                      )}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Админ
                    </Button>
                  </Link>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <User className="w-4 h-4 mr-2" />
                      {userName || userEmail}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-2">
                      <p className="text-sm font-medium text-gray-900">
                        {userName || 'Пользователь'}
                      </p>
                      <p className="text-xs text-gray-500">{userEmail}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="w-4 h-4 mr-2" />
                      Выйти
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="min-h-[calc(100vh-73px)]">{children}</main>
    </div>
  )
}

