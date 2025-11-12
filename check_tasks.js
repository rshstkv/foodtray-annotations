const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkTasks() {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, assigned_to, status')
    .limit(10)
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  console.log('Total tasks found:', tasks.length)
  console.log('Sample tasks:', JSON.stringify(tasks, null, 2))
  
  // Count by status
  const { data: stats } = await supabase
    .from('tasks')
    .select('status, assigned_to')
  
  console.log('\nStats:', stats?.length, 'total')
  console.log('By user:', stats?.reduce((acc, t) => {
    acc[t.assigned_to] = (acc[t.assigned_to] || 0) + 1
    return acc
  }, {}))
}

checkTasks().then(() => process.exit(0))

