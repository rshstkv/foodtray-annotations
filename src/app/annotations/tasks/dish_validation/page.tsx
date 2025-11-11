import { redirect } from 'next/navigation'
import { DishValidationClient } from './DishValidationClient'

type DishValidationPageProps = {
  searchParams?: Promise<{
    mode?: string
  }> | {
    mode?: string
  }
}

export default async function DishValidationPage({ searchParams }: DishValidationPageProps) {
  const params = searchParams instanceof Promise ? await searchParams : searchParams
  const modeParam = params?.mode

  if (modeParam !== 'quick' && modeParam !== 'edit') {
    redirect('/annotations/tasks/dish_validation?mode=quick')
  }

  return <DishValidationClient mode={modeParam} />
}

