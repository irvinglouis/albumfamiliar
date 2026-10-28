import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  let input: { shareToken?: string; albumId?: string }
  try { input = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }
  if (!input.shareToken || !input.albumId) return json({ error: 'shareToken y albumId son obligatorios' }, 400)
  if (!/^[a-f0-9]{48}$/.test(input.shareToken)) return json({ error: 'Token inválido' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceKey)

  // Valida token activo y que corresponda exactamente al álbum solicitado.
  const { data: album, error: albumError } = await admin.from('albums')
    .select('id, share_enabled, share_token')
    .eq('id', input.albumId)
    .eq('share_token', input.shareToken)
    .eq('share_enabled', true)
    .maybeSingle()
  if (albumError || !album) return json({ error: 'Enlace inválido o revocado' }, 403)

  const { data: photos, error: photosError } = await admin.from('photos')
    .select('id, album_id, owner_id, storage_path, title, caption, taken_at, created_at')
    .eq('album_id', album.id)
    .order('created_at', { ascending: false })
    .limit(200)
  if (photosError) return json({ error: 'No se pudieron consultar las fotografías' }, 500)

  const urls: Record<string, string> = {}
  for (const photo of photos || []) {
    const { data, error } = await admin.storage.from('family-photos').createSignedUrl(photo.storage_path, 300)
    if (!error && data?.signedUrl) urls[photo.id] = data.signedUrl
  }
  return json({ photos: photos || [], urls })
})