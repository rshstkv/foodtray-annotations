import { AppHeader } from './AppHeader'

interface MainLayoutProps {
  children: React.ReactNode
  isAdmin?: boolean
  userName?: string
  userEmail?: string
}

export function MainLayout({ 
  children, 
  isAdmin, 
  userName, 
  userEmail 
}: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AppHeader 
        isAdmin={isAdmin} 
        userName={userName} 
        userEmail={userEmail} 
      />
      
      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t border-gray-200 bg-white px-6 py-4">
        <div className="text-xs text-gray-500">
          RRS Annotation System v1.0.0
        </div>
      </footer>
    </div>
  )
}

