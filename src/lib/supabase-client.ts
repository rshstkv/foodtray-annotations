import { createBrowserClient } from '@supabase/ssr'

/**
 * Клиентский Supabase клиент для Next.js App Router
 * Использует @supabase/ssr для правильной синхронизации cookies
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

