import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { RootLayout } from '@/components/layouts/RootLayout'
import { AdminLayout as AdminLayoutComponent } from '@/components/layouts/AdminLayout'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    redirect('/work')
  }

  return (
    <RootLayout 
      userName={profile.full_name || user.email || ''} 
      userEmail={user.email || ''} 
      isAdmin={true}
    >
      <AdminLayoutComponent>
        {children}
      </AdminLayoutComponent>
    </RootLayout>
  )
}

