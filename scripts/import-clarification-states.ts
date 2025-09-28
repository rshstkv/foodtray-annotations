#!/usr/bin/env tsx
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

function loadEnvFromFile(envPath: string) {
  try {
    if (!fs.existsSync(envPath)) return
    const raw = fs.readFileSync(envPath, 'utf8')
    raw.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) return
      const key = trimmed.slice(0, eqIdx).trim()
      let value = trimmed.slice(eqIdx + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    })
  } catch (_) {
    // ignore
  }
}

loadEnvFromFile(path.resolve(__dirname, '..', '.env.local'))

const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseUrl = rawUrl.replace('localhost', '127.0.0.1').replace(':54323', ':54321')
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || ''
if (!supabaseServiceKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY не найден. Использую анонимный ключ; права могут быть ограничены.')
}
const supabase = createClient(supabaseUrl, supabaseServiceKey)

type State = 'yes' | 'no'

function labelToState(label: string): State | null {
  const t = (label || '').trim().toLowerCase()
  if (t === 'right') return 'yes'
  if (t === 'wrong') return 'no'
  return null
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

async function importStates() {
  console.log('🚀 Starting clarification states import (CSV)...')

  const cliArgPath = process.argv[2]
  if (!cliArgPath) {
    console.error('❌ CSV file path is required as first argument')
    return
  }
  const filePath = path.resolve(cliArgPath)
  if (!fs.existsSync(filePath)) {
    console.error('❌ File not found:', filePath)
    return
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)

  type Row = { clarification_id: string; state: State }
  const rows: Row[] = []
  let skipped = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Разделители: запятая, точка с запятой, таб
    const parts = trimmed.split(/[;,\t]/).map(s => s.trim()).filter(Boolean)
    if (parts.length < 2) { skipped++; continue }
    const clarification_id = parts[0]
    const state = labelToState(parts[1])
    if (!clarification_id || !state) { skipped++; continue }
    rows.push({ clarification_id, state })
  }

  // Дедупликация: последнее значение выигрывает
  const map = new Map<string, Row>()
  for (const r of rows) map.set(r.clarification_id, r)
  const finalUpserts = Array.from(map.values()).map(r => ({
    clarification_id: r.clarification_id,
    state: r.state,
    updated_at: new Date().toISOString()
  }))

  console.log(`📊 Parsed rows: ${rows.length}, unique: ${finalUpserts.length}, skipped: ${skipped}`)

  let updated = 0
  for (const ch of chunkArray(finalUpserts, 1000)) {
    const { error, data } = await supabase
      .from('clarification_states')
      .upsert(ch, { onConflict: 'clarification_id' })
      .select('clarification_id')
    if (error) {
      console.error('❌ Upsert error:', error)
      continue
    }
    updated += data?.length || ch.length
    console.log(`✅ Upserted ${updated}/${finalUpserts.length}`)
  }

  // Итоговые метрики
  const report = {
    parsed: rows.length,
    unique: finalUpserts.length,
    skipped,
    updated
  }
  const reportPath = path.join(__dirname, '..', 'import-states-report.json')
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(`🧾 Report saved: ${reportPath}`)
  } catch (_) {}

  console.log('🎉 States import completed!')
}

importStates().catch(err => {
  console.error('💥 Import failed:', err)
})


