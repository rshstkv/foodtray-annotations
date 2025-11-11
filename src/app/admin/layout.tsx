import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  
  const { data: { user }, error } = await supabase.auth.getUser()

  // Если не авторизован - middleware перенаправит на login
  if (error || !user) {
    redirect('/login')
  }

  // Проверяем роль
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Если не админ - перенаправляем на задачи
  if (!profile || profile.role !== 'admin') {
    redirect('/annotations/tasks')
  }

  return <>{children}</>
}

