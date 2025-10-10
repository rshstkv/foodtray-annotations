#!/usr/bin/env tsx
/**
 * Import clarifications from JSON file to clarifications_data_raw table
 * Usage: npx tsx scripts/import-raw-data.ts <path-to-json>
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const supabase = createClient(supabaseUrl, supabaseKey)

async function importRawData(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    process.exit(1)
  }

  console.log(`📖 Reading JSON file: ${filePath}`)
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  
  let data: any[]
  try {
    data = JSON.parse(fileContent)
  } catch (error) {
    console.error('❌ Failed to parse JSON:', error)
    process.exit(1)
  }

  if (!Array.isArray(data)) {
    console.error('❌ JSON must be an array of objects')
    process.exit(1)
  }

  console.log(`📦 Found ${data.length} records`)

  // Clear existing data
  console.log('🗑️  Clearing existing clarifications_data_raw...')
  const { error: deleteError } = await supabase
    .from('clarifications_data_raw')
    .delete()
    .neq('id', 0) // Delete all

  if (deleteError) {
    console.error('❌ Error clearing table:', deleteError)
  }

  // Insert in batches of 100
  const batchSize = 100
  let inserted = 0

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize)
    
    // Transform to match table structure: { data: jsonb }
    const records = batch.map(item => ({ data: item }))
    
    const { data: result, error } = await supabase
      .from('clarifications_data_raw')
      .insert(records)
      .select()

    if (error) {
      console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, error)
      continue
    }

    inserted += result?.length || 0
    console.log(`✅ Inserted batch ${i / batchSize + 1} (${inserted}/${data.length})`)
  }

  console.log(`\n🎉 Import complete! Inserted ${inserted} records into clarifications_data_raw`)

  // Show some stats
  const { count } = await supabase
    .from('clarifications_data_raw')
    .select('*', { count: 'exact', head: true })

  console.log(`📊 Total records in table: ${count}`)
}

// Get file path from command line argument
const filePath = process.argv[2]

if (!filePath) {
  console.error('❌ Usage: npx tsx scripts/import-raw-data.ts <path-to-json>')
  process.exit(1)
}

// Run import
importRawData(filePath).catch((error) => {
  console.error('❌ Import failed:', error)
  process.exit(1)
})

