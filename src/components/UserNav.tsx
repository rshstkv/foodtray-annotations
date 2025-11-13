'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUser } from '@/hooks/useUser'

interface UserNavProps {
  userName?: string
  userEmail?: string
}

export function UserNav({ userName: propUserName, userEmail: propUserEmail }: UserNavProps = {}) {
  const { user, loading } = useUser()
  const router = useRouter()
  
  const userName = propUserName || user?.full_name || user?.email
  const userEmail = propUserEmail || user?.email

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse"></div>
      </div>
    )
  }

  if (!user && !userName) {
    return (
      <Button variant="outline" onClick={() => router.push('/login')}>
        Войти
      </Button>
    )
  }

  const displayName = userName || userEmail || 'User'
  const initials = userName && userName.includes(' ')
    ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : (userName || userEmail || 'U')[0].toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium text-sm">
            {initials}
          </div>
          <div className="hidden md:flex flex-col items-start">
            <span className="text-sm font-medium">{displayName}</span>
            <span className="text-xs text-gray-500">{user?.role === 'admin' ? 'Администратор' : 'Аннотатор'}</span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/tasks')}>
          📋 Задачи
        </DropdownMenuItem>
        {user?.role === 'admin' && (
          <DropdownMenuItem onClick={() => router.push('/admin')}>
            ⚙️ Админ панель
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-red-600">
          🚪 Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

