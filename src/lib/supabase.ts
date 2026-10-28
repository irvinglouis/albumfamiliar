import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && key && !url.includes('TU-PROYECTO') && !key.startsWith('TU_'))
export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null

export type Album = {
  id: string
  title: string
  description: string | null
  event_date: string | null
  category: string | null
  summary: string | null
  cover_path: string | null
  created_at: string
  owner_id: string
  share_token?: string | null
  is_shared?: boolean
}
export type Photo = {
  id: string
  album_id: string
  owner_id: string
  storage_path: string
  title: string | null
  caption: string | null
  taken_at: string | null
  created_at: string
}