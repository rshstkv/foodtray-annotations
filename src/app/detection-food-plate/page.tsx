'use client'

import { useState } from 'react'
import { RootLayout } from '@/components/layouts/RootLayout'
import { DetectionTaskList } from '@/components/detection/DetectionTaskList'
import { DetectionWorkspace } from '@/components/detection/DetectionWorkspace'
import { useUser } from '@/hooks/useUser'
import type { DetectionTaskWithStats } from '@/types/detection'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function DetectionFoodPlatePage() {
  const { user, loading, isAdmin } = useUser()
  const [selectedTask, setSelectedTask] = useState<DetectionTaskWithStats | null>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner />
      </div>
    )
  }

  if (selectedTask) {
    return (
      <DetectionWorkspace
        task={selectedTask}
        onBack={() => setSelectedTask(null)}
      />
    )
  }

  return (
    <RootLayout
      userName={user?.full_name ?? undefined}
      userEmail={user?.email}
      isAdmin={isAdmin}
    >
      <DetectionTaskList onSelectTask={setSelectedTask} />
    </RootLayout>
  )
}
