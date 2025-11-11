/**
 * Скрипт для создания admin пользователя через Supabase Auth
 * Email: rshstkv@gmail.com
 * Password: 16208075
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment')
  console.log('For local development, use:')
  console.log('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function createAdminUser() {
  const email = 'rshstkv@gmail.com'
  const password = '16208075'

  console.log('🔐 Creating admin user...')
  console.log(`   Email: ${email}`)

  try {
    // 1. Создать пользователя через Auth Admin API
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'admin'
      }
    })

    if (createError) {
      if (createError.message.includes('already been registered')) {
        console.log('⚠️  User already exists, updating role...')
        
        // Получить существующего пользователя
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
        if (listError) throw listError
        
        const existingUser = users.find(u => u.email === email)
        if (!existingUser) throw new Error('User not found after creation')
        
        // Обновить роль в profiles
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ role: 'admin' })
          .eq('id', existingUser.id)
        
        if (profileError) throw profileError
        
        console.log('✅ Admin role updated successfully!')
        console.log(`   User ID: ${existingUser.id}`)
        return
      }
      throw createError
    }

    console.log('✅ Admin user created successfully!')
    console.log(`   User ID: ${userData.user.id}`)

    // 2. Обновить роль в profiles (trigger должен был создать profile, но обновим роль)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', userData.user.id)

    if (profileError) {
      console.log('⚠️  Warning: Could not update profile role:', profileError.message)
    } else {
      console.log('✅ Admin role set in profiles')
    }

    // 3. Проверка
    const { data: profile, error: checkError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userData.user.id)
      .single()

    if (checkError) {
      console.log('⚠️  Warning: Could not verify profile:', checkError.message)
    } else {
      console.log('✅ Profile verified:')
      console.log(`   Email: ${profile.email}`)
      console.log(`   Role: ${profile.role}`)
      console.log(`   Active: ${profile.is_active}`)
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

createAdminUser()

