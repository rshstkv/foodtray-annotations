import { createClient } from '@supabase/supabase-js'

/**
 * Supabase клиент для API routes (серверные роуты)
 * 
 * НЕ использовать в клиентских компонентах!
 * Для клиентских компонентов используйте @/lib/supabase-client
 * Для серверных компонентов и middleware используйте @/lib/supabase-server
 */

// Normalize Supabase URL: if user accidentally sets Studio port (54323), use API port (54321)
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseUrl = rawUrl.replace(':54323', ':54321')
// Default anon key for local Supabase development
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      clarification_states: {
        Row: {
          id: number
          clarification_id: string
          state: 'yes' | 'no' | 'bbox_error' | 'unknown'
          created_at: string
          updated_at: string
        }
        Insert: {
          clarification_id: string
          state: 'yes' | 'no' | 'bbox_error' | 'unknown'
        }
        Update: {
          clarification_id?: string
          state?: 'yes' | 'no'
        }
      }
    }
  }
}
