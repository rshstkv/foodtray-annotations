import { createClient } from '@supabase/supabase-js'

// Normalize Supabase URL: if user accidentally sets Studio port (54323), use API port (54321)
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
const supabaseUrl = rawUrl.replace(':54323', ':54321')
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTYwMzk2ODgzNCwiZXhwIjoyNTUwNjUzNjM0LCJyb2xlIjoiYW5vbiJ9.36fUebxgx1mcBo4s19v0SzqmzunP--hm_hep0uLX0ew'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
