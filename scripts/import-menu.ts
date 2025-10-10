#!/usr/bin/env tsx
/**
 * Import menu items from CSV file to menu_items table
 * Usage: npx tsx scripts/import-menu.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const supabase = createClient(supabaseUrl, supabaseKey)

interface MenuRow {
  proto_name: string
  ID: string
  EAN: string
  index: string
  'super class': string
  'Product Name': string
  'English name': string
  'Number of photos': string
  Image: string
  'Image.1': string
  'Comment RRS': string
  Countable: string
  '': string
  '.1': string
}

async function importMenu() {
  // Get CSV path from command line argument or use default
  const csvPath = process.argv[2] || '/Users/romanshestakov/Downloads/Pingo Doce menu (new) - Reference menu (2).csv'
  
  console.log(`📁 CSV file path: ${csvPath}`)
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`)
    console.log('Usage: npm run import:menu [path/to/menu.csv]')
    process.exit(1)
  }

  console.log('📖 Reading CSV file...')
  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const lines = csvContent.split('\n')
  const headers = lines[0].split(',')

  console.log(`Found ${lines.length - 1} rows`)

  const menuItems: Array<{
    proto_name: string
    ean: string | null
    super_class: string | null
    product_name: string
    english_name: string | null
    index_order: number
  }> = []

  // Parse CSV (skip header)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = line.split(',')
    
    const protoName = values[0]?.trim()
    const ean = values[2]?.trim()
    const indexOrder = values[3]?.trim()
    const superClass = values[4]?.trim()
    const productName = values[5]?.trim()
    const englishName = values[6]?.trim()

    // Skip rows without proto_name or product_name
    if (!protoName || !productName) {
      continue
    }

    menuItems.push({
      proto_name: protoName,
      ean: ean || null,
      super_class: superClass || null,
      product_name: productName,
      english_name: englishName || null,
      index_order: parseInt(indexOrder) || i
    })
  }

  console.log(`📦 Parsed ${menuItems.length} valid menu items`)

  // Clear existing data
  console.log('🗑️  Clearing existing menu_items...')
  const { error: deleteError } = await supabase
    .from('menu_items')
    .delete()
    .neq('id', 0) // Delete all

  if (deleteError) {
    console.error('❌ Error clearing menu_items:', deleteError)
  }

  // Insert in batches of 100
  const batchSize = 100
  let inserted = 0

  for (let i = 0; i < menuItems.length; i += batchSize) {
    const batch = menuItems.slice(i, i + batchSize)
    
    const { data, error } = await supabase
      .from('menu_items')
      .insert(batch)
      .select()

    if (error) {
      console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, error)
      continue
    }

    inserted += data?.length || 0
    console.log(`✅ Inserted batch ${i / batchSize + 1} (${inserted}/${menuItems.length})`)
  }

  console.log(`\n🎉 Import complete! Inserted ${inserted} menu items`)

  // Show some stats
  const { data: stats } = await supabase
    .from('menu_items')
    .select('super_class', { count: 'exact' })

  if (stats) {
    const superClasses = new Set(stats.map(s => s.super_class).filter(Boolean))
    console.log(`📊 Found ${superClasses.size} unique super classes`)
  }
}

// Run import
importMenu().catch((error) => {
  console.error('❌ Import failed:', error)
  process.exit(1)
})

