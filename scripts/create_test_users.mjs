#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read .env.local manually
function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env.local')
    const envFile = readFileSync(envPath, 'utf-8')
    const env = {}
    
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const value = match[2].trim().replace(/^["']|["']$/g, '')
        env[key] = value
      }
    })
    
    return env
  } catch (error) {
    console.error('❌ Cannot read .env.local:', error.message)
    process.exit(1)
  }
}

const env = loadEnv()
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const TEST_USERS = [
  {
    email: 'rshstkv@gmail.com',
    password: '16208075',
    role: 'admin',
    full_name: 'Roman Shestakov'
  },
  {
    email: 'a@test.com',
    password: '11111111',
    role: 'annotator',
    full_name: 'Test Annotator'
  }
]

async function createTestUsers() {
  console.log('🚀 Creating test users...\n')

  for (const userData of TEST_USERS) {
    try {
      // 1. Создать пользователя через Auth API
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true,
        user_metadata: {
          full_name: userData.full_name
        }
      })

      if (authError) {
        if (authError.message.includes('already exists') || authError.message.includes('already registered')) {
          console.log(`⚠️  User ${userData.email} already exists, updating...`)
          
          // Получить существующего пользователя
          const { data: users } = await supabase.auth.admin.listUsers()
          const existingUser = users.users.find(u => u.email === userData.email)
          
          if (existingUser) {
            // Обновить пароль
            await supabase.auth.admin.updateUserById(existingUser.id, {
              password: userData.password
            })
            
            // Обновить профиль
            await supabase
              .from('profiles')
              .update({
                role: userData.role,
                full_name: userData.full_name
              })
              .eq('id', existingUser.id)
            
            console.log(`✅ Updated user: ${userData.email} (${userData.role})`)
          }
        } else {
          throw authError
        }
        continue
      }

      const userId = authData.user.id

      // 2. Создать/обновить профиль в таблице profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email: userData.email,
          role: userData.role,
          full_name: userData.full_name
        }, {
          onConflict: 'id'
        })

      if (profileError) {
        throw profileError
      }

      console.log(`✅ Created user: ${userData.email} (${userData.role})`)

    } catch (error) {
      console.error(`❌ Error creating ${userData.email}:`, error.message)
    }
  }

  console.log('\n✅ Test users ready!')
  console.log('\nLogin credentials:')
  TEST_USERS.forEach(u => {
    console.log(`  ${u.email} / ${u.password} (${u.role})`)
  })
}

createTestUsers()
