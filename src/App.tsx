import { useEffect, useMemo, useState } from 'react'
import { BookHeart, Camera, CalendarDays, CloudUpload, Heart, ImagePlus, LogIn, LogOut, Plus, Search, Share2, Sparkles, Trash2, X, LockKeyhole, Link2, LoaderCircle, Images } from 'lucide-react'
import { isSupabaseConfigured, supabase, type Album, type Photo } from './lib/supabase'

const categories = ['Cumpleaños', 'Viajes', 'Día a día', 'Celebraciones', 'Primeros momentos', 'Otros']
const demoAlbums: Album[] = [
  { id: 'demo-1', title: 'Pequeños grandes momentos', description: 'Sonrisas que queremos guardar para siempre.', event_date: '2026-08-11', category: 'Primeros momentos', summary: 'Una colección de instantes cotidianos llenos de cariño, descubrimientos y sonrisas.', cover_path: null, created_at: new Date().toISOString(), owner_id: 'demo' },
  { id: 'demo-2', title: 'Celebraciones en familia', description: 'Días especiales rodeados de quienes más queremos.', event_date: '2026-09-20', category: 'Celebraciones', summary: 'Compartimos una fecha especial con abrazos, fotografías y recuerdos que nos acompañarán por mucho tiempo.', cover_path: null, created_at: new Date().toISOString(), owner_id: 'demo' },
  { id: 'demo-3', title: 'Domingos de aventura', description: 'Paseos, juegos y tiempo juntos.', event_date: '2026-10-04', category: 'Viajes', summary: 'Un pequeño álbum de salidas familiares y momentos espontáneos que hicieron especial el día.', cover_path: null, created_at: new Date().toISOString(), owner_id: 'demo' },
]
const palette = ['#dbe8e5', '#f0dedb', '#e7e1f1', '#f3e8c9', '#dce6f6', '#f4dfce']
const dateLabel = (date?: string | null) => date ? new Date(`${date.slice(0,10)}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Fecha por añadir'

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [albums, setAlbums] = useState<Album[]>(demoAlbums)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [activeAlbum, setActiveAlbum] = useState<Album | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Todos')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [create, setCreate] = useState({ title: '', description: '', event_date: '', category: categories[0] })
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null)
  const [photoCaption, setPhotoCaption] = useState('')
  const [sharedAlbum, setSharedAlbum] = useState<Album | null>(null)

  const demoMode = !isSupabaseConfigured
  const filteredAlbums = useMemo(() => albums.filter(a =>
    (category === 'Todos' || a.category === category) &&
    `${a.title} ${a.description ?? ''} ${a.summary ?? ''}`.toLowerCase().includes(search.toLowerCase())
  ), [albums, category, search])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) return
    void loadAlbums()
  }, [session])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('share')
    if (token && supabase) void loadSharedAlbum(token)
  }, [])

  async function loadAlbums() {
    if (!supabase) return
    setBusy(true)
    const { data, error } = await supabase.from('albums').select('*').order('event_date', { ascending: false, nullsFirst: false })
    if (error) setMessage(error.message)
    else setAlbums((data ?? []) as Album[])
    setBusy(false)
  }
  async function loadSharedAlbum(token: string) {
    if (!supabase) return
    const { data, error } = await supabase.rpc('get_shared_album', { share_token_input: token })
    if (error || !data?.length) { setMessage('Este enlace no es válido o ya no está compartido.'); return }
    setSharedAlbum(data[0] as Album)
    setActiveAlbum(data[0] as Album)
    await loadPhotos(data[0].id, true, token)
  }
  async function loadPhotos(albumId: string, isShared = false, shareToken?: string) {
    if (!supabase) return
    if (isShared && shareToken) {
      const endpoint = import.meta.env.VITE_SHARED_PHOTOS_FUNCTION_URL as string | undefined
      if (!endpoint) { setMessage('Falta configurar VITE_SHARED_PHOTOS_FUNCTION_URL para mostrar fotos compartidas.'); return }
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
          body: JSON.stringify({ shareToken, albumId }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las fotos compartidas.')
        setPhotos(result.photos as Photo[])
        setPhotoUrls(result.urls as Record<string, string>)
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'No se pudieron cargar las fotos compartidas.')
      }
      return
    }
    const { data, error } = await supabase.from('photos').select('*').eq('album_id', albumId).order('created_at', { ascending: false })
    if (error) { setMessage(error.message); return }
    const list = (data ?? []) as Photo[]
    setPhotos(list)
    const urls: Record<string, string> = {}
    for (const photo of list) {
      const { data: signed } = await supabase.storage.from('family-photos').createSignedUrl(photo.storage_path, 900)
      if (signed?.signedUrl) urls[photo.id] = signed.signedUrl
    }
    setPhotoUrls(urls)
  }
  async function login(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setMessage(error ? error.message : 'Sesión iniciada.')
    setBusy(false)
    if (!error) setShowLogin(false)
  }
  async function createAccount() {
    if (!supabase) return
    const { error } = await supabase.auth.signUp({ email, password })
    setMessage(error ? error.message : 'Revisa tu correo para confirmar la cuenta, si la confirmación está activada.')
  }
  async function logout() { if (supabase) await supabase.auth.signOut(); setActiveAlbum(null); setSharedAlbum(null) }

  async function saveAlbum(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !session) { setMessage('Configura Supabase e inicia sesión para crear álbumes.'); return }
    setBusy(true)
    const { data, error } = await supabase.from('albums').insert({
      title: create.title, description: create.description || null, event_date: create.event_date || null,
      category: create.category, owner_id: session.user.id,
    }).select().single()
    if (error) setMessage(error.message)
    else { setAlbums(prev => [data as Album, ...prev]); setShowCreate(false); setCreate({ title: '', description: '', event_date: '', category: categories[0] }); setMessage('Álbum creado.'); }
    setBusy(false)
  }

  async function uploadPhotos(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !session || !activeAlbum || !uploadFiles?.length) return
    setBusy(true)
    let uploaded = 0
    for (const file of Array.from(uploadFiles)) {
      if (!file.type.startsWith('image/')) { setMessage(`${file.name}: solo se permiten imágenes.`); continue }
      if (file.size > 15 * 1024 * 1024) { setMessage(`${file.name}: supera el límite de 15 MB.`); continue }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `${session.user.id}/${activeAlbum.id}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('family-photos').upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) { setMessage(`No se pudo subir ${file.name}: ${uploadError.message}`); continue }
      const { error: rowError } = await supabase.from('photos').insert({
        album_id: activeAlbum.id, owner_id: session.user.id, storage_path: path,
        title: file.name.replace(/\.[^.]+$/, ''), caption: photoCaption || null,
      })
      if (rowError) { setMessage(`Foto subida pero no se pudo guardar su ficha: ${rowError.message}`); continue }
      uploaded++
    }
    setMessage(uploaded ? `Se subieron ${uploaded} fotografía(s).` : 'No se subieron fotografías.')
    setUploadFiles(null); setPhotoCaption('')
    await loadPhotos(activeAlbum.id)
    setBusy(false)
  }

  async function generateSummary() {
    if (!supabase || !activeAlbum || !session) { setMessage('Inicia sesión y configura Supabase para generar resúmenes con IA.'); return }
    const fnUrl = import.meta.env.VITE_SUMMARY_FUNCTION_URL as string | undefined
    if (!fnUrl) { setMessage('Falta VITE_SUMMARY_FUNCTION_URL en .env.local.'); return }
    setBusy(true)
    try {
      const { data: { session: current } } = await supabase.auth.getSession()
      const response = await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${current?.access_token}` }, body: JSON.stringify({ albumId: activeAlbum.id }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo generar el resumen.')
      setActiveAlbum(result.album)
      setAlbums(prev => prev.map(a => a.id === result.album.id ? result.album : a))
      setMessage('Resumen actualizado.')
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Error al generar resumen.') }
    setBusy(false)
  }

  async function shareAlbum(album: Album) {
    if (!supabase || !session) { setMessage('Debes iniciar sesión para compartir un álbum.'); return }
    const { data, error } = await supabase.rpc('create_album_share', { album_id_input: album.id })
    if (error) { setMessage(error.message); return }
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('share', data as string)
    try { await navigator.clipboard.writeText(url.toString()); setMessage('Enlace privado copiado. Quien lo tenga podrá ver este álbum hasta que revoques el enlace.'); }
    catch { setMessage(url.toString()) }
  }
  async function revokeShare(album: Album) {
    if (!supabase) return
    const { error } = await supabase.rpc('revoke_album_share', { album_id_input: album.id })
    setMessage(error ? error.message : 'Enlace compartido revocado.')
    if (!error) await loadAlbums()
  }
  async function deletePhoto(photo: Photo) {
    if (!supabase || !activeAlbum || !confirm('¿Eliminar esta fotografía? Esta acción no se puede deshacer.')) return
    const { error: storageError } = await supabase.storage.from('family-photos').remove([photo.storage_path])
    const { error } = await supabase.from('photos').delete().eq('id', photo.id)
    if (error || storageError) setMessage(error?.message || storageError?.message || 'No se pudo eliminar.')
    else { setPhotos(prev => prev.filter(p => p.id !== photo.id)); setMessage('Fotografía eliminada.'); }
  }

  const openAlbum = async (album: Album) => { setActiveAlbum(album); setSharedAlbum(null); setPhotos([]); setPhotoUrls({}); if (!album.id.startsWith('demo-')) await loadPhotos(album.id) }
  const closeAlbum = () => { setActiveAlbum(null); if (sharedAlbum) { setSharedAlbum(null); window.history.replaceState({}, '', window.location.pathname) } }
  const countPhotos = (id: string) => photos.filter(p => p.album_id === id).length

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href={window.location.pathname} onClick={e => { e.preventDefault(); closeAlbum() }}>
        <span className="brand-mark"><BookHeart size={23}/></span>
        <span><strong>Nuestro Álbum</strong><small>un lugar para volver</small></span>
      </a>
      <nav><a href="#albums" onClick={() => closeAlbum()}>Álbumes</a><a href="#about">Nuestra historia</a></nav>
      <div className="account-actions">
        {session ? <><span className="user-email">{session.user.email}</span><button className="icon-button" title="Cerrar sesión" onClick={logout}><LogOut size={18}/></button></> :
          <button className="button button-soft" onClick={() => setShowLogin(true)}><LogIn size={16}/> Ingresar</button>}
      </div>
    </header>

    {message && <div className="toast" role="status"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Cerrar mensaje"><X size={16}/></button></div>}

    {activeAlbum ? <main className="album-view">
      <button className="back-link" onClick={closeAlbum}>← Volver a los álbumes</button>
      <div className="album-heading">
        <div><span className="eyebrow">{activeAlbum.category || 'Recuerdo familiar'}</span><h1>{activeAlbum.title}</h1><p>{activeAlbum.description || 'Un capítulo bonito de nuestra historia.'}</p><div className="date-line"><CalendarDays size={16}/>{dateLabel(activeAlbum.event_date)}</div></div>
        <div className="album-controls">
          {!sharedAlbum && session && <button className="button button-soft" onClick={() => shareAlbum(activeAlbum)}><Share2 size={16}/> Compartir enlace</button>}
          {!sharedAlbum && session && <button className="button button-primary" disabled={busy} onClick={generateSummary}><Sparkles size={16}/> {busy ? 'Procesando…' : 'Crear resumen IA'}</button>}
        </div>
      </div>
      {activeAlbum.summary && <div className="summary-card"><Sparkles size={18}/><div><strong>La historia de este álbum</strong><p>{activeAlbum.summary}</p></div></div>}
      {!sharedAlbum && session && <form className="upload-panel" onSubmit={uploadPhotos}>
        <div className="upload-icon"><CloudUpload size={24}/></div><div className="upload-copy"><strong>Añade nuevas fotografías</strong><span>JPG, PNG, WebP · máximo 15 MB por imagen</span></div>
        <input type="file" accept="image/*" multiple onChange={e => setUploadFiles(e.target.files)}/>
        <input className="caption-input" value={photoCaption} onChange={e => setPhotoCaption(e.target.value)} placeholder="Descripción opcional para estas fotos"/>
        <button className="button button-primary" type="submit" disabled={busy || !uploadFiles?.length}><ImagePlus size={16}/> Subir fotos</button>
      </form>}
      <div className="photo-grid">
        {photos.map((photo, i) => <article className="photo-card" key={photo.id}>
          {photoUrls[photo.id] ? <img src={photoUrls[photo.id]} alt={photo.caption || photo.title || 'Fotografía familiar'} loading="lazy"/> : <div className="photo-placeholder" style={{ background: palette[i % palette.length] }}><Camera size={30}/></div>}
          <div className="photo-caption"><div><strong>{photo.title || 'Un recuerdo'}</strong><span>{photo.caption || dateLabel(photo.taken_at || photo.created_at)}</span></div>{session && !sharedAlbum && <button className="icon-button danger" onClick={() => deletePhoto(photo)} title="Eliminar foto"><Trash2 size={16}/></button>}</div>
        </article>)}
        {demoMode && !photos.length && <div className="empty-state"><Images size={30}/><strong>Tu historia empieza aquí</strong><p>Configura Supabase, inicia sesión y sube las primeras fotografías de este álbum.</p></div>}
        {!demoMode && !photos.length && <div className="empty-state"><Images size={30}/><strong>Aún no hay fotografías</strong><p>Sube las imágenes que quieras conservar en este recuerdo.</p></div>}
      </div>
    </main> : <main>
      <section className="hero">
        <div className="hero-text"><span className="eyebrow"><Heart size={14} fill="currentColor"/> LOS MOMENTOS QUE NOS UNEN</span>
          <h1>Una vida de recuerdos,<br/><em>una historia en familia.</em></h1>
          <p>Un rincón especial para guardar sonrisas, celebrar pequeños momentos y volver a ellos cuando queramos.</p>
          <div className="hero-actions"><a className="button button-primary" href="#albums"><Images size={17}/> Explorar álbumes</a>{session && <button className="button button-outline" onClick={() => setShowCreate(true)}><Plus size={17}/> Crear álbum</button>}</div>
          <div className="hero-note"><LockKeyhole size={15}/> Tus recuerdos merecen un lugar seguro.</div>
        </div>
        <div className="hero-art" aria-label="Ilustración decorativa de fotografías"><div className="art-blob"></div><div className="photo-frame frame-back"><div className="fake-photo sky"><span>✦</span></div><small>un día bonito</small></div><div className="photo-frame frame-front"><div className="fake-photo garden"><span>♡</span></div><small>juntos es mejor</small></div><div className="art-sticker sticker-heart">♡</div><div className="art-sticker sticker-flower">✿</div></div>
      </section>

      <section className="stats-strip">
        <div><span className="stat-icon peach"><Images size={19}/></span><span><strong>{demoMode ? 'Tus próximos' : albums.length}</strong><small>álbumes familiares</small></span></div>
        <div><span className="stat-icon sage"><Heart size={19}/></span><span><strong>Mil y un</strong><small>motivos para recordar</small></span></div>
        <div><span className="stat-icon lilac"><CalendarDays size={19}/></span><span><strong>Siempre</strong><small>cerca de nosotros</small></span></div>
      </section>

      <section className="albums-section" id="albums">
        <div className="section-heading"><div><span className="eyebrow">NUESTRA COLECCIÓN</span><h2>Recuerdos para atesorar</h2><p>Cada álbum guarda un pedacito de nuestra historia.</p></div>
          {session && <button className="button button-primary" onClick={() => setShowCreate(true)}><Plus size={17}/> Nuevo álbum</button>}
        </div>
        {!session && <div className="demo-banner"><LockKeyhole size={17}/><span><strong>Vista de bienvenida.</strong> Los álbumes de muestra son ilustrativos. Inicia sesión para acceder a tus recuerdos privados.</span><button onClick={() => setShowLogin(true)}>Ingresar</button></div>}
        <div className="filters"><label className="search-box"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar un recuerdo…"/></label><select value={category} onChange={e => setCategory(e.target.value)}><option>Todos</option>{categories.map(c => <option key={c}>{c}</option>)}</select></div>
        <div className="album-grid">
          {filteredAlbums.map((album, i) => <article className="album-card" key={album.id} onClick={() => openAlbum(album)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && openAlbum(album)}>
            <div className={`album-cover cover-${i % 6}`}><div className="cover-decoration decor-one"></div><div className="cover-decoration decor-two"></div><span className="cover-emoji">{['☼','♡','✿','✦','❀','☁'][i % 6]}</span><span className="cover-label">{album.category || 'Recuerdos'}</span><span className="cover-count"><Camera size={13}/>{album.id.startsWith('demo-') ? 'Vista previa' : 'Ver fotos'}</span></div>
            <div className="album-info"><span className="album-date">{dateLabel(album.event_date)}</span><h3>{album.title}</h3><p>{album.description || 'Un recuerdo especial para nuestra familia.'}</p><div className="album-footer"><span><Heart size={14}/> Guardado con cariño</span><span className="round-arrow">↗</span></div></div>
          </article>)}
        </div>
        {!filteredAlbums.length && <div className="empty-state"><Search size={26}/><strong>No encontramos ese recuerdo</strong><p>Prueba con otra palabra o categoría.</p></div>}
      </section>
      <section className="quote-section" id="about"><span>“</span><blockquote>Los días pasan, pero los recuerdos que hacemos juntos se quedan con nosotros.</blockquote><small>CON TODO NUESTRO CARIÑO</small></section>
    </main>}

    <footer><div className="footer-brand"><BookHeart size={19}/><strong>Nuestro Álbum Familiar</strong></div><span>Hecho con cariño, para volver a los momentos que importan.</span><span className="footer-lock"><LockKeyhole size={14}/> Un espacio cuidado por nuestra familia</span></footer>

    {showLogin && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setShowLogin(false)}><div className="modal"><button className="modal-close" onClick={() => setShowLogin(false)}><X size={19}/></button><span className="modal-icon"><BookHeart size={24}/></span><span className="eyebrow">QUÉ ALEGRÍA TENERTE AQUÍ</span><h2>Entrar a nuestro álbum</h2><p>Inicia sesión para ver, crear y compartir recuerdos.</p>{demoMode && <div className="setup-warning">La aplicación está en modo demostración. Configura Supabase siguiendo el README para activar el acceso.</div>}<form onSubmit={login}><label>Correo electrónico<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com"/></label><label>Contraseña<input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Tu contraseña"/></label><button className="button button-primary full" disabled={busy || demoMode}><LogIn size={16}/> Ingresar</button><button className="text-button" type="button" disabled={demoMode || password.length < 6 || !email} onClick={createAccount}>Crear cuenta con este correo</button></form></div></div>}

    {showCreate && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setShowCreate(false)}><div className="modal"><button className="modal-close" onClick={() => setShowCreate(false)}><X size={19}/></button><span className="modal-icon"><ImagePlus size={24}/></span><span className="eyebrow">UN NUEVO CAPÍTULO</span><h2>Crear un álbum</h2><p>Ponle nombre a ese recuerdo que quieres conservar.</p><form onSubmit={saveAlbum}><label>Nombre del álbum<input required maxLength={100} value={create.title} onChange={e => setCreate({ ...create, title: e.target.value })} placeholder="Ej. Un cumpleaños inolvidable"/></label><label>Descripción<textarea maxLength={500} value={create.description} onChange={e => setCreate({ ...create, description: e.target.value })} placeholder="¿Qué hace especial este día?"/></label><div className="form-row"><label>Fecha<input type="date" value={create.event_date} onChange={e => setCreate({ ...create, event_date: e.target.value })}/></label><label>Categoría<select value={create.category} onChange={e => setCreate({ ...create, category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label></div><button className="button button-primary full" disabled={busy}><Plus size={16}/> Guardar álbum</button></form></div></div>}
    {busy && <div className="busy-indicator"><LoaderCircle size={16}/> Procesando…</div>}
    {sharedAlbum && <div className="shared-ribbon"><Link2 size={15}/> Estás viendo un álbum compartido mediante enlace.</div>}
  </div>
}