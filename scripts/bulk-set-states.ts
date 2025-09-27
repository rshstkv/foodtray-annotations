#!/usr/bin/env tsx
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local similarly to import-clarifications.ts
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

type Label = 'Right' | 'Wrong'
type State = 'yes' | 'no'

const labelToState = (label: Label): State => (label === 'Right' ? 'yes' : 'no')

// Input list: id -> label. The id may be pos_transaction_id (order) or clarification_id.
const entries: Array<{ id: string; label: Label }> = [
  { id: '003477202509101233075300530659', label: 'Right' },
  { id: '006327202509041351075300530684', label: 'Wrong' },
  { id: '010305202508121219075100510659', label: 'Right' },
  { id: '006092202509021425074800480656', label: 'Right' },
  { id: '006618202509101339075300530684', label: 'Wrong' },
  { id: '005861202509051907075100510850', label: 'Wrong' },
  { id: '004093202509191302075200520850', label: 'Right' },
  { id: '006805202509201206075200520659', label: 'Right' },
  { id: '012446202509101315074600460656', label: 'Right' },
  { id: '007004202509231259075100510850', label: 'Right' },
  { id: '012181202509062011074600460656', label: 'Right' },
  { id: '006030202508311327074800480656', label: 'Right' },
  { id: '011435202509071402075100510659', label: 'Right' },
  { id: '007045202509191331075300530684', label: 'Wrong' },
  { id: '006449202509071318075200520659', label: 'Wrong' },
  { id: '012084202509051312074600460656', label: 'Right' },
  { id: '005679202509022011075100510850', label: 'Right' },
  { id: '010095202509151252075100510684', label: 'Wrong' },
  { id: '011054202509211256075200520684', label: 'Right' },
  { id: '002348202509231250075300530850', label: 'Right' },
  { id: '011673202509121438075100510659', label: 'Right' },
  { id: '009503202508301324075200520684', label: 'Right' },
  { id: '002136202509101437075300530850', label: 'Right' },
  { id: '010928202509191350075200520684', label: 'Wrong' },
  { id: '003796202509111146075200520850', label: 'Right' },
  { id: '004275202509161231074900490656', label: 'Right' },
  { id: '006167202509011330075300530684', label: 'Right' },
  { id: '005654202509021429075100510850', label: 'Right' },
  { id: '007039202509191311075300530684', label: 'Right' },
  { id: '006761202509182029075100510850', label: 'Right' },
  { id: '012576202509121516074600460656', label: 'Right' },
  { id: '004032202509051415074900490656', label: 'Right' },
  { id: '004014202509172025075200520850', label: 'Right' },
  { id: '006643202509181310074800480656', label: 'Right' },
  { id: '012078202509051300074600460656', label: 'Right' },
  { id: '009447202509031425075100510684', label: 'Right' },
  { id: '004035202509181303075200520850', label: 'Right' },
  { id: '009432202509031325075100510684', label: 'Right' },
  { id: '012963202509181416074600460656', label: 'Wrong' },
  { id: '009500202509041347075100510684', label: 'Wrong' },
  { id: '010011202509061301075200520684', label: 'Right' },
  { id: '002050202509061330075300530850', label: 'Right' },
  { id: '010299202509101241075200520684', label: 'Right' },
  { id: '006272202509031313075300530684', label: 'Right' },
  { id: '002885202508091247075300530659', label: 'Right' },
  { id: '010201202509082023075200520684', label: 'Right' },
  { id: '006648202509111154075300530684', label: 'Right' },
  { id: '013274202509231347074600460656', label: 'Right' },
  { id: '004314202509181239074900490656', label: 'Right' },
  { id: '009234202509181226074500450656', label: 'Right' },
  { id: '009494202508301249075200520684', label: 'Right' },
  { id: '011844202509021244074600460656', label: 'Right' },
  { id: '005869202509171354074700470656', label: 'Right' },
  { id: '010625202509151220075200520684', label: 'Right' },
  { id: '005537202509011241075100510850', label: 'Wrong' },
  { id: '006187202509141238075400540659', label: 'Right' },
  { id: '005477202508311442075100510850', label: 'Right' },
  { id: '011149202509231158075200520684', label: 'Wrong' },
  { id: '008461202509021323074500450656', label: 'Right' },
  { id: '009676202509012006075200520684', label: 'Right' },
  { id: '004334202509191237074900490656', label: 'Wrong' },
  { id: '008963202509121229074500450656', label: 'Right' },
  { id: '004409202509231240074900490656', label: 'Right' },
  { id: '008378202508311346074500450656', label: 'Wrong' },
  { id: '012924202509181211074600460656', label: 'Right' },
  { id: '006126202508311519075300530684', label: 'Right' },
  { id: '006652202509151242075200520659', label: 'Right' },
  { id: '009849202509101452075100510684', label: 'Right' },
  { id: '003751202509091407075200520850', label: 'Right' },
  { id: '004138202509211311075200520850', label: 'Right' },
  { id: '003400202508311428075200520850', label: 'Right' },
  { id: '007004202509231259075100510850', label: 'Right' },
  { id: '006384202509121442075100510850', label: 'Right' },
  { id: '009899202509111402075100510684', label: 'Right' },
  { id: '011945202509031441074600460656', label: 'Right' },
  { id: '007054202509191422075300530684', label: 'Right' },
  { id: '009290202509191305074500450656', label: 'Right' },
  { id: '006126202509091236075100510850', label: 'Right' },
  { id: '006093202509011544075400540684', label: 'Right' },
  { id: '003357202509041307075300530659', label: 'Right' },
  { id: '009493202508301247075200520684', label: 'Right' },
  { id: '006893202509211256075100510850', label: 'Right' },
  { id: '013210202509221405074600460656', label: 'Right' },
  { id: '009515202509241315074500450656', label: 'Right' },
  { id: '008758202509081330074500450656', label: 'Right' },
  { id: '010375202509191236075100510684', label: 'Right' },
  { id: '005744202508091314075200520659', label: 'Right' },
  { id: '003509202509031216075200520850', label: 'Right' },
  { id: '010661202509151352075200520684', label: 'Wrong' },
  { id: '007000202509181345075300530684', label: 'Right' },
  { id: '010309202509181258075100510684', label: 'Right' },
  { id: '006860202509201541075100510850', label: 'Right' },
  { id: '005444202508311253075100510850', label: 'Right' },
  { id: '009529202509241408074500450656', label: 'Right' },
  { id: '005998202509081248075400540659', label: 'Right' },
  { id: '004218202509131232074900490656', label: 'Right' },
  { id: '002945202508121322075300530659', label: 'Right' },
  { id: '003303202509011310075300530659', label: 'Right' },
  { id: '013100202509211210074600460656', label: 'Right' },
  { id: '006967202509231215075400540684', label: 'Wrong' },
  { id: '003434202509081315075300530659', label: 'Right' },
  { id: '013068202509201315074600460656', label: 'Right' },
  { id: '006299202509011252075200520659', label: 'Right' },
  { id: '006281202509031344075300530684', label: 'Right' },
  { id: '008904202509111258074500450656', label: 'Right' },
  { id: '003487202509021355075200520850', label: 'Wrong' },
  { id: '011379202509061333075100510659', label: 'Right' },
  { id: '010850202509181258075200520684', label: 'Right' },
  { id: '003401202508311433075200520850', label: 'Right' },
  { id: '005986202509221307074700470656', label: 'Right' },
  { id: '006194202509101238075100510850', label: 'Wrong' },
  { id: '009158202509161312074500450656', label: 'Right' },
  { id: '012031202509211302075100510659', label: 'Right' },
  { id: '012179202509241244075100510659', label: 'Right' },
  { id: '013142202509211430074600460656', label: 'Right' },
  { id: '004251202509242043075200520850', label: 'Right' },
  { id: '006182202509031535075400540684', label: 'Right' },
  { id: '010198202508091504075100510659', label: 'Right' },
  { id: '003757202509091430075200520850', label: 'Right' },
  { id: '006261202509111234075100510850', label: 'Right' },
  { id: '002998202508151354075300530659', label: 'Right' },
  { id: '009702202509081259075100510684', label: 'Right' },
  { id: '011057202509211310075200520684', label: 'Right' },
  { id: '006129202509031324074800480656', label: 'Right' },
  { id: '009905202509111450075100510684', label: 'Right' },
  { id: '005324202508301251074700470656', label: 'Right' },
  { id: '006653202509111213075300530684', label: 'Right' },
  { id: '006089202509021330074800480656', label: 'Right' },
  { id: '004033202509051432074900490656', label: 'Right' },
  { id: '005186202508131429075400540659', label: 'Right' },
  { id: '012299202509081301074600460656', label: 'Right' },
  { id: '007079202509241421075100510850', label: 'Right' },
  { id: '012542202509121252074600460656', label: 'Right' },
  { id: '006603202509121343075200520659', label: 'Right' },
  { id: '004390202509221349074900490656', label: 'Right' },
  { id: '004098202509191327075200520850', label: 'Right' },
  { id: '005954202509211202074700470656', label: 'Right' },
  { id: '002125202509101253075300530850', label: 'Right' },
  { id: '006489202509131249074800480656', label: 'Right' },
  { id: '010854202509181308075200520684', label: 'Right' },
  { id: '005509202508312042075100510850', label: 'Right' },
  { id: '005798202509151312074700470656', label: 'Right' },
  { id: '011957202509191319075100510659', label: 'Right' },
  { id: '005649202509101258074700470656', label: 'Right' },
  { id: '012547202509121311074600460656', label: 'Right' },
  { id: '010625202509231309075100510684', label: 'Right' },
  { id: '013323202509241254074600460656', label: 'Right' },
  { id: '009655202509011352075200520684', label: 'Right' },
  { id: '006373202509121355075100510850', label: 'Wrong' },
  { id: '013144202509211436074600460656', label: 'Right' },
  { id: '006295202509111436075100510850', label: 'Wrong' },
  { id: '005599202509011938075100510850', label: 'Right' },
  { id: '009280202509011229075100510684', label: 'Right' },
  { id: '006497202509081308075300530684', label: 'Right' },
  { id: '006345202509091330074800480656', label: 'Right' },
  { id: '003878202508301240074900490656', label: 'Right' },
  { id: '009463202509231328074500450656', label: 'Right' },
  { id: '011862202509021335074600460656', label: 'Right' },
  { id: '006724202509211410074800480656', label: 'Right' },
  { id: '011739202508311307074600460656', label: 'Right' },
  { id: '012155202509231449075100510659', label: 'Wrong' },
  { id: '009429202509031315075100510684', label: 'Right' },
  { id: '008706202509071404074500450656', label: 'Right' },
  { id: '006837202509211401075200520659', label: 'Right' },
  { id: '012934202509181246074600460656', label: 'Right' },
  { id: '012963202509181416074600460656', label: 'Wrong' },
  { id: '009679202509012025075200520684', label: 'Right' },
  { id: '005397202508301414075100510850', label: 'Right' },
  { id: '006782202509181334075400540684', label: 'Right' },
  { id: '005644202509101226074700470656', label: 'Right' },
  { id: '009313202509201228074500450656', label: 'Right' },
  { id: '011705202509131339075100510659', label: 'Wrong' },
  { id: '007043202509191327075300530684', label: 'Right' },
  { id: '006695202509201215074800480656', label: 'Right' },
  { id: '005448202509031325074700470656', label: 'Right' },
  { id: '009346202509211219074500450656', label: 'Right' },
  { id: '006371202509191251075400540659', label: 'Right' },
  { id: '006494202509102100075400540684', label: 'Right' },
  { id: '003035202508181247075300530659', label: 'Right' },
  { id: '006421202509062031075300530684', label: 'Right' },
  { id: '011931202509031353074600460656', label: 'Wrong' },
  { id: '001935202509011437075300530850', label: 'Wrong' },
  { id: '005522202509011207075100510850', label: 'Right' },
  { id: '008667202509061351074500450656', label: 'Right' },
  { id: '002273202509181946075300530850', label: 'Wrong' },
  { id: '010767202509171215075200520684', label: 'Right' },
  { id: '006886202509161329075300530684', label: 'Right' },
  { id: '013217202509221456074600460656', label: 'Right' },
  { id: '006135202509031355074800480656', label: 'Right' },
  { id: '005201202508141222075400540659', label: 'Right' },
  { id: '011914202509031307074600460656', label: 'Right' },
  { id: '006215202509151257075400540659', label: 'Right' },
  { id: '012128202509231250075100510659', label: 'Right' },
  { id: '003041202508181346075300530659', label: 'Right' },
  { id: '001173202509061411075400540850', label: 'Right' },
  { id: '006293202509111428075100510850', label: 'Right' },
  { id: '005560202509011358075100510850', label: 'Right' },
  { id: '005829202509021340075400540659', label: 'Right' },
  { id: '012960202509181407074600460656', label: 'Right' },
  { id: '007036202509231859075100510850', label: 'Right' }
]

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

async function main() {
  console.log('🚀 Запуск массового обновления статусов...')

  // Дедупликация с приоритетом последнего значения
  const map = new Map<string, Label>()
  for (const e of entries) map.set(e.id, e.label)
  const unique = Array.from(map.entries()).map(([id, label]) => ({ id, label }))

  const ids = unique.map(e => e.id)
  const idToState = new Map<string, State>()
  unique.forEach(e => idToState.set(e.id, labelToState(e.label)))

  // 1) Проверяем какие id — это заказы (orders.pos_transaction_id)
  const orderMatches = new Map<string, number>() // pos_transaction_id -> orders.id
  const orderIdChunks = chunkArray(ids, 100)
  for (const ch of orderIdChunks) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, pos_transaction_id')
      .in('pos_transaction_id', ch)
    if (error) {
      console.error('Ошибка чтения orders:', error)
      continue
    }
    data?.forEach(row => orderMatches.set(row.pos_transaction_id as string, row.id as number))
  }

  // 2) Проверяем какие id — это кларификации (clarifications.clarification_id)
  const clarificationMatches = new Set<string>()
  const clarIdChunks = chunkArray(ids, 100)
  for (const ch of clarIdChunks) {
    const { data, error } = await supabase
      .from('clarifications')
      .select('clarification_id')
      .in('clarification_id', ch)
    if (error) {
      console.error('Ошибка чтения clarifications:', error)
      continue
    }
    data?.forEach(row => clarificationMatches.add(row.clarification_id as string))
  }

  // 3) Для найденных orders — находим их clarifications
  const orderIds = Array.from(orderMatches.values())
  const clarificationsByOrder = new Map<number, string[]>() // order_id -> clarification_ids[]
  for (const ch of chunkArray(orderIds, 100)) {
    if (ch.length === 0) break
    const { data, error } = await supabase
      .from('clarifications')
      .select('order_id, clarification_id')
      .in('order_id', ch)
    if (error) {
      console.error('Ошибка чтения clarifications по orders:', error)
      continue
    }
    data?.forEach(row => {
      const list = clarificationsByOrder.get(row.order_id as number) || []
      list.push(row.clarification_id as string)
      clarificationsByOrder.set(row.order_id as number, list)
    })
  }

  // 4) Формируем финальный список кларификаций для upsert
  const toUpsert: Array<{ clarification_id: string; state: State; updated_at: string }> = []

  // a) От заказов
  for (const [posTxnId, orderId] of orderMatches.entries()) {
    const clarIds = clarificationsByOrder.get(orderId) || []
    const state = idToState.get(posTxnId)!
    clarIds.forEach(cid => toUpsert.push({ clarification_id: cid, state, updated_at: new Date().toISOString() }))
  }

  // b) От непосредственных кларификаций
  for (const cid of clarificationMatches) {
    const state = idToState.get(cid)
    if (state) {
      toUpsert.push({ clarification_id: cid, state, updated_at: new Date().toISOString() })
    }
  }

  // Дедупликация по clarification_id (последнее значение выигрывает)
  const upsertMap = new Map<string, { clarification_id: string; state: State; updated_at: string }>()
  for (const row of toUpsert) upsertMap.set(row.clarification_id, row)
  const finalUpserts = Array.from(upsertMap.values())

  // 5) Upsert пачками
  let updated = 0
  for (const ch of chunkArray(finalUpserts, 1000)) {
    const { error, count } = await supabase
      .from('clarification_states')
      .upsert(ch, { onConflict: 'clarification_id' })
      .select('clarification_id', { count: 'exact' })
    if (error) {
      console.error('Ошибка upsert clarification_states:', error)
      continue
    }
    updated += count || ch.length
  }

  const foundOrders = orderMatches.size
  const foundClarifications = clarificationMatches.size
  const notFound = ids.filter(id => !orderMatches.has(id) && !clarificationMatches.has(id))

  console.log('—'.repeat(40))
  console.log(`Найдено в orders (по pos_transaction_id): ${foundOrders}`)
  console.log(`Найдено в clarifications (по clarification_id): ${foundClarifications}`)
  console.log(`Всего кларификаций обновлено: ${updated}`)
  console.log(`Не найдены (пропущены): ${notFound.length}`)
  if (notFound.length > 0) {
    console.log('Примеры не найденных (первые 10):', notFound.slice(0, 10))
  }
}

main().catch(err => {
  console.error('💥 Ошибка выполнения:', err)
  process.exitCode = 1
})


