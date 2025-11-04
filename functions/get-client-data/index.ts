// Edge Function: get-client-data
// POST { token: '<token>' } OR GET ?token=...
// Validates token in `access_tokens` and returns client + projects + payments

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url)
    const token = req.method === 'GET' ? url.searchParams.get('token') : (await req.json().catch(() => ({})))?.token
    if (!token) return new Response(JSON.stringify({ error: 'token required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    // Check token
    const now = new Date().toISOString()
    const { data: tk, error: tkErr } = await supabase.from('access_tokens').select('token,client_id,expires_at').eq('token', token).single()
    if (tkErr || !tk) return new Response(JSON.stringify({ error: 'Token not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

    if (new Date(tk.expires_at) < new Date()) {
      // Optional: log expiration
      await supabase.from('logs').insert([{ action: 'ACCESS_DENIED', detail: `Expired token ${token}` }])
      return new Response(JSON.stringify({ error: 'Token expired' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }

    // Fetch client
    const { data: client } = await supabase.from('clients').select('id,name,email').eq('id', tk.client_id).single()
    const { data: projects } = await supabase.from('projects').select('id,client_id,name,status,budget,balance').eq('client_id', tk.client_id).order('id')
    const projectIds = (projects || []).map(p => p.id)
    const { data: payments } = await supabase.from('payments').select('id,project_id,date,amount,type').in('project_id', projectIds)

    // Log access
    await supabase.from('logs').insert([{ action: 'CLIENT_ACCESS', detail: `Token ${token} used for client ${tk.client_id}` }])

    return new Response(JSON.stringify({ success: true, data: { client, projects, payments } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
