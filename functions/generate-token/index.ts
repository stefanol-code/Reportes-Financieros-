// Edge Function: generate-token
// POST { client_id: <integer> }
// Creates a one-time access token stored in `access_tokens` and returns a link.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE')
const PUBLIC_BASE_URL = Deno.env.get('PUBLIC_BASE_URL') || 'https://example.com'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

function generateToken() {
  return `TKN-${Math.random().toString(36).substring(2,10).toUpperCase()}`
}

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const body = await req.json().catch(() => ({}))
    const clientId = body?.client_id
    if (!clientId) return new Response(JSON.stringify({ error: 'client_id required' }), { status: 400 })

    // Verify client exists
    const { data: client, error: clientErr } = await supabase.from('clients').select('id,name').eq('id', clientId).single()
    if (clientErr || !client) return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404 })

    const token = generateToken()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { error: insErr } = await supabase.from('access_tokens').insert([{ token, client_id: clientId, expires_at: expiresAt }])
    if (insErr) {
      console.error('insert token error', insErr)
      return new Response(JSON.stringify({ error: 'Could not create token' }), { status: 500 })
    }

    // Optional: write a log (requires logs table)
    await supabase.from('logs').insert([{ action: 'LINK_GENERATED', detail: `Token ${token} for client ${clientId}` }])

    const link = `${PUBLIC_BASE_URL}?token=${encodeURIComponent(token)}`
    return new Response(JSON.stringify({ success: true, token, link, expires_at: expiresAt }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
