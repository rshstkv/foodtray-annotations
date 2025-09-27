import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Normalize Supabase URL: Studio (54323) -> API (54321); localhost -> 127.0.0.1
const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseUrl = rawUrl.replace(':54323', ':54321').replace('localhost', '127.0.0.1')

// Prefer Service Role on server; fall back to anon only for local/dev
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})

export type Database = {
  public: {
    Tables: {
      clarification_states: {
        Row: {
          id: number
          clarification_id: string
          state: 'yes' | 'no'
          created_at: string
          updated_at: string
        }
        Insert: {
          clarification_id: string
          state: 'yes' | 'no'
        }
        Update: {
          clarification_id?: string
          state?: 'yes' | 'no'
        }
      }
    }
  }
}
