'use client'

import { useState } from 'react'
import { RootLayout } from '@/components/layouts/RootLayout'
import { DetectionTaskList } from '@/components/detection/DetectionTaskList'
import { DetectionImageTable } from '@/components/detection/DetectionImageTable'
import { DetectionWorkspace } from '@/components/detection/DetectionWorkspace'
import { useUser } from '@/hooks/useUser'
import type { DetectionTaskWithStats } from '@/types/detection'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

type Screen =
  | { type: 'tasks' }
  | { type: 'table'; task: DetectionTaskWithStats }
  | { type: 'editor'; task: DetectionTaskWithStats; imageId: number; allImageIds: number[] }

export default function DetectionFoodPlatePage() {
  const { user, loading, isAdmin } = useUser()
  const [screen, setScreen] = useState<Screen>({ type: 'tasks' })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner />
      </div>
    )
  }

  if (screen.type === 'editor') {
    return (
      <DetectionWorkspace
        task={screen.task}
        initialImageId={screen.imageId}
        allImageIds={screen.allImageIds}
        onBack={() => setScreen({ type: 'table', task: screen.task })}
      />
    )
  }

  if (screen.type === 'table') {
    return (
      <RootLayout
        userName={user?.full_name ?? undefined}
        userEmail={user?.email}
        isAdmin={isAdmin}
      >
        <DetectionImageTable
          task={screen.task}
          onBack={() => setScreen({ type: 'tasks' })}
          onOpenImage={(imageId, allImageIds) =>
            setScreen({ type: 'editor', task: screen.task, imageId, allImageIds })
          }
        />
      </RootLayout>
    )
  }

  return (
    <RootLayout
      userName={user?.full_name ?? undefined}
      userEmail={user?.email}
      isAdmin={isAdmin}
    >
      <DetectionTaskList
        onSelectTask={(task) => setScreen({ type: 'table', task })}
      />
    </RootLayout>
  )
}
