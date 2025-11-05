#!/usr/bin/env tsx
/**
 * Populate original_annotations from recognition_images_raw
 * Sets has_modifications flag for recognitions with manual annotations
 * Usage: npx tsx scripts/populate-original-annotations.ts
 */

import { createClient } from '@supabase/supabase-js'

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const supabase = createClient(supabaseUrl, supabaseKey)

async function populateOriginalAnnotations() {
  console.log('🚀 Starting population of original_annotations...\n')

  // 1. Получить все recognition_images
  const { data: images, error: imagesError } = await supabase
    .from('recognition_images')
    .select('id, recognition_id, photo_type, storage_path')

  if (imagesError) {
    console.error('❌ Error fetching recognition_images:', imagesError)
    process.exit(1)
  }

  console.log(`📦 Found ${images?.length || 0} recognition_images`)

  let updated = 0
  let skipped = 0

  // 2. Для каждого изображения найти соответствующие QWEN данные
  for (const image of images || []) {
    // Найти raw данные по storage_path
    const { data: rawImage, error: rawError } = await supabase
      .from('recognition_images_raw')
      .select('qwen_dishes_detections, qwen_plates_detections')
      .eq('storage_path', image.storage_path)
      .single()

    if (rawError || !rawImage) {
      console.log(`⚠️  No raw data found for image ${image.id} (${image.storage_path})`)
      skipped++
      continue
    }

    // Объединяем dishes и plates детекции
    const originalAnnotations = {
      qwen_dishes_detections: rawImage.qwen_dishes_detections || [],
      qwen_plates_detections: rawImage.qwen_plates_detections || []
    }

    // Обновляем recognition_images
    const { error: updateError } = await supabase
      .from('recognition_images')
      .update({ original_annotations: originalAnnotations })
      .eq('id', image.id)

    if (updateError) {
      console.error(`❌ Error updating image ${image.id}:`, updateError)
      continue
    }

    updated++
    if (updated % 10 === 0) {
      console.log(`✅ Updated ${updated} images...`)
    }
  }

  console.log(`\n✅ Updated ${updated} images with original_annotations`)
  console.log(`⚠️  Skipped ${skipped} images (no raw data found)`)

  // 3. Установить has_modifications для recognitions с manual аннотациями
  console.log('\n🔄 Setting has_modifications flag...')

  // Получить все recognition с manual аннотациями
  const { data: recognitionsWithManual, error: manualError } = await supabase
    .from('annotations')
    .select('image_id')
    .eq('source', 'manual')

  if (manualError) {
    console.error('❌ Error fetching manual annotations:', manualError)
  } else {
    // Получить уникальные recognition_id через image_id
    const imageIds = [...new Set(recognitionsWithManual?.map(a => a.image_id) || [])]
    
    const { data: imagesWithManual, error: imagesErr } = await supabase
      .from('recognition_images')
      .select('recognition_id')
      .in('id', imageIds)

    if (imagesErr) {
      console.error('❌ Error fetching images:', imagesErr)
    } else {
      const recognitionIds = [...new Set(imagesWithManual?.map(i => i.recognition_id) || [])]
      
      console.log(`📝 Found ${recognitionIds.length} recognitions with manual annotations`)

      // Обновить has_modifications
      const { error: modError } = await supabase
        .from('recognitions')
        .update({ has_modifications: true })
        .in('recognition_id', recognitionIds)

      if (modError) {
        console.error('❌ Error updating has_modifications:', modError)
      } else {
        console.log(`✅ Updated ${recognitionIds.length} recognitions with has_modifications=true`)
      }
    }
  }

  console.log('\n🎉 Population complete!')
}

// Run script
populateOriginalAnnotations().catch((error) => {
  console.error('❌ Script failed:', error)
  process.exit(1)
})





