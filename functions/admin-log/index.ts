// Edge Function: admin-log
// POST { action: '...', detail: '...' }
// Protected by ADMIN_API_KEY environment variable (header: x-admin-api-key)

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE')
const ADMIN_API_KEY = Deno.env.get('ADMIN_API_KEY')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const provided = req.headers.get('x-admin-api-key')
    if (!ADMIN_API_KEY || provided !== ADMIN_API_KEY) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

    const body = await req.json().catch(() => ({}))
    const action = body?.action || 'ADMIN_LOG'
    const detail = body?.detail || ''

    const { error } = await supabase.from('logs').insert([{ action, detail }])
    if (error) return new Response(JSON.stringify({ error: 'could not insert log' }), { status: 500, headers: { 'Content-Type': 'application/json' } })

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
