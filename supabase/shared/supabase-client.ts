import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import type { Database } from '../types/database.types.ts'

export function getSupabaseEnv() {
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url) {
    throw new Error('Missing SUPABASE_URL environment variable')
  }

  return { url, anonKey, serviceRoleKey }
}

export function createAuthClient(req: Request) {
  const { url, anonKey } = getSupabaseEnv()
  const authHeader = req.headers.get('Authorization')

  return createClient<Database>(url, anonKey || '', {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
    auth: {
      persistSession: false,
    },
  })
}

export function createServiceRoleClient() {
  const { url, serviceRoleKey } = getSupabaseEnv()

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  })
}
export function createAnonClient() {
  const { url, anonKey } = getSupabaseEnv()
  return createClient<Database>(url, anonKey || '', {
    auth: {
      persistSession: false,
    },
  })
}
