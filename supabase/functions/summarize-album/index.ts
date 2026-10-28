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

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Se requiere iniciar sesión' }, 401)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openAiKey) return json({ error: 'Falta configurar OPENAI_API_KEY como secreto de la función' }, 500)

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Sesión inválida' }, 401)

  let payload: { albumId?: string }
  try { payload = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }
  if (!payload.albumId) return json({ error: 'albumId es obligatorio' }, 400)

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: album, error: albumError } = await admin.from('albums').select('*')
    .eq('id', payload.albumId).eq('owner_id', userData.user.id).single()
  if (albumError || !album) return json({ error: 'Álbum no encontrado o no autorizado' }, 404)

  const { data: photos } = await admin.from('photos').select('title,caption,taken_at')
    .eq('album_id', album.id).eq('owner_id', userData.user.id).order('created_at', { ascending: true }).limit(100)
  const source = [
    `Título del álbum: ${album.title}`,
    `Descripción aportada por el usuario: ${album.description || 'No indicada'}`,
    `Categoría: ${album.category || 'No indicada'}`,
    `Fecha: ${album.event_date || 'No indicada'}`,
    `Datos aportados para las fotografías: ${(photos || []).map(p => [p.title, p.caption, p.taken_at].filter(Boolean).join(' — ')).filter(Boolean).join('\n') || 'No hay descripciones de fotos.'}`,
  ].join('\n')

  // El modelo solo recibe texto/metadatos, no se envían imágenes a un proveedor de IA.
  const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini',
      temperature: 0.5,
      max_tokens: 180,
      messages: [
        { role: 'system', content: 'Escribes resúmenes cálidos en español para álbumes familiares. Redacta 2 a 3 frases breves y naturales basadas EXCLUSIVAMENTE en los datos proporcionados. No inventes nombres, parentescos, lugares, edades, emociones concretas ni acontecimientos no mencionados. Si faltan datos, escribe una descripción general y prudente. No incluyas datos sensibles innecesarios.' },
        { role: 'user', content: source },
      ],
    }),
  })
  const aiJson = await aiResponse.json()
  if (!aiResponse.ok) return json({ error: aiJson?.error?.message || 'Falló el servicio de IA' }, 502)
  const summary = aiJson.choices?.[0]?.message?.content?.trim()
  if (!summary) return json({ error: 'La IA no devolvió un resumen' }, 502)

  const { data: updated, error: updateError } = await admin.from('albums').update({ summary, updated_at: new Date().toISOString() })
    .eq('id', album.id).eq('owner_id', userData.user.id).select('*').single()
  if (updateError) return json({ error: 'No se pudo guardar el resumen' }, 500)
  return json({ album: updated })
})