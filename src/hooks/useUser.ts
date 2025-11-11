'use client'

import { useEffect, useState } from 'react'

interface User {
  id: string
  email: string
  role: 'admin' | 'annotator'
  full_name?: string | null
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchUser()
  }, [])

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/session', {
        cache: 'no-store',
        credentials: 'include',
      })
      
      if (res.ok) {
        const data = await res.json()
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch (err) {
      console.error('Failed to fetch user:', err)
      setError('Failed to load user')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const refetch = () => {
    setLoading(true)
    fetchUser()
  }

  return {
    user,
    loading,
    error,
    refetch,
    isAdmin: user?.role === 'admin',
  }
}

