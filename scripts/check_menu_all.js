#!/usr/bin/env node

// Скрипт для проверки recognition с непустым menu_all

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Читаем .env.local
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    envVars[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
})

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
)

async function checkMenuAll() {
  console.log('Проверяем recognitions_raw для menu_all...\n')

  // Запрос к recognitions_raw
  const { data, error } = await supabase
    .from('recognitions_raw')
    .select('recognition_id, menu_all')
    .not('menu_all', 'is', null)
    .order('recognition_id', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Ошибка:', error)
    return
  }

  if (!data || data.length === 0) {
    console.log('❌ Не найдено ни одного recognition с menu_all')
    return
  }

  console.log(`✅ Найдено ${data.length} recognitions с menu_all:\n`)

  const withData = []
  const withoutData = []

  for (const row of data) {
    const menuAll = row.menu_all || []
    const count = Array.isArray(menuAll) ? menuAll.length : 0
    
    if (count > 0) {
      withData.push({ id: row.recognition_id, count })
    } else {
      withoutData.push(row.recognition_id)
    }
  }

  if (withData.length > 0) {
    console.log('📋 Recognitions с непустым menu_all:')
    withData.forEach(({ id, count }) => {
      console.log(`  ✓ Recognition ID: ${id} (${count} элементов в меню)`)
    })
    console.log(`\n🔗 Ссылка для тестирования:`)
    console.log(`   http://localhost:3000/annotations/${withData[0].id}`)
  } else {
    console.log('⚠️  Все recognition имеют пустой menu_all')
  }

  if (withoutData.length > 0) {
    console.log(`\n❌ Recognitions с пустым menu_all: ${withoutData.join(', ')}`)
  }
}

checkMenuAll().catch(console.error)

