'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Redirect to /admin/users
export default function AdminPage() {
  const router = useRouter()

  useEffect(() => {
    router.push('/admin/users')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  )
}

