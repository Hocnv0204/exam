import { createAuthClient, createServiceRoleClient, getSupabaseEnv } from './supabase-client.ts'
import type { UserRole } from '../types/database.types.ts'

export interface AuthenticatedUser {
  id: string
  email?: string
  username: string
  fullName: string
  role: UserRole
  classId: string | null
  classIds: string[]
}

/* ---------------------------------------------------------------------------
 * JWT verification NỘI BỘ tại Edge (0 round-trip mạng)
 *
 * Trước đây requireAuth() gọi supabaseClient.auth.getUser() -> 1 HTTP round-trip
 * tới GoTrue cho MỌI request. Trên hạ tầng Supabase, Edge Function chạy ở region
 * gần người dùng (vd: ap-northeast-2/Seoul) còn DB + GoTrue nằm ở region của
 * project (vd: ap-southeast-2/Sydney) => mỗi round-trip tốn ~160ms.
 *
 * Chữ ký JWT được verify cục bộ bằng WebCrypto + JWKS
 * (${SUPABASE_URL}/auth/v1/.well-known/jwks.json) được CACHE ở module scope
 * (sống theo isolate) nên các request sau gần như không tốn chi phí mạng.
 * - Hỗ trợ ES256/384/512 (project mới dùng ES256), RS256/384/512, PS256.
 * - Hỗ trợ HS256 qua SUPABASE_JWT_SECRET (legacy JWT secret).
 * - Nếu KHÔNG thể verify cục bộ (alg lạ / JWKS lỗi) => fallback về GoTrue như
 *   hành vi cũ, không bao giờ bỏ qua bước xác thực.
 * ------------------------------------------------------------------------- */
interface JwtPayload {
  sub?: string
  exp?: number
  email?: string
  user_metadata?: { role?: UserRole; username?: string }
}

type VerificationResult =
  | { ok: true; payload: JwtPayload }
  | { ok: false; reason: 'invalid' | 'unverifiable' }

const JWKS_TTL_MS = 60 * 60 * 1000 // 1 giờ

// Pre-seed khoá công khai mặc định của dự án để loại bỏ hoàn toàn 500ms fetch jwks.json khi cold start
const DEFAULT_PROJECT_JWKS: JsonWebKey[] = [
  {
    alg: 'ES256',
    crv: 'P-256',
    ext: true,
    key_ops: ['verify'],
    kid: '3e162d57-c5e2-4fc0-9278-9aef1a091b07',
    kty: 'EC',
    use: 'sig',
    x: 'S8eoZXp5dSKewyLBQ4ucODzE-fJqVF1FcGE9Km-Tw80',
    y: 'BH-dU4EnXA6JJOuE8Yapq56Ozc3hlIjAKC4qtwS7svk'
  }
]

let jwksCache: { keys: JsonWebKey[]; fetchedAt: number } | null = {
  keys: DEFAULT_PROJECT_JWKS,
  fetchedAt: Date.now()
}
let jwksInFlight: Promise<JsonWebKey[] | null> | null = null

const cryptoKeyCache = new Map<string, CryptoKey>()

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function decodeJsonSegment<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as T
}

async function loadJwks(force = false): Promise<JsonWebKey[] | null> {
  const now = Date.now()
  if (!force && jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys
  }
  if (!force && jwksInFlight) {
    return await jwksInFlight
  }

  jwksInFlight = (async (): Promise<JsonWebKey[] | null> => {
    try {
      const { url, anonKey } = getSupabaseEnv()
      const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`, {
        headers: anonKey ? { apikey: anonKey } : {},
      })
      if (!res.ok) return null
      const body = (await res.json()) as { keys?: JsonWebKey[] }
      const keys = Array.isArray(body?.keys) ? body.keys : []
      if (keys.length === 0) return null
      jwksCache = { keys, fetchedAt: Date.now() }
      return keys
    } catch (err) {
      console.error('[auth] Unable to fetch JWKS:', (err as Error).message)
      return null
    } finally {
      jwksInFlight = null
    }
  })()

  return await jwksInFlight
}

function verifyAlgorithm(alg: string): { importParams: RsaHashedImportParams | EcKeyImportParams; verifyParams: AlgorithmIdentifier | EcdsaParams | RsaPssParams } | null {
  switch (alg) {
    case 'ES256':
      return { importParams: { name: 'ECDSA', namedCurve: 'P-256' }, verifyParams: { name: 'ECDSA', hash: 'SHA-256' } }
    case 'ES384':
      return { importParams: { name: 'ECDSA', namedCurve: 'P-384' }, verifyParams: { name: 'ECDSA', hash: 'SHA-384' } }
    case 'ES512':
      return { importParams: { name: 'ECDSA', namedCurve: 'P-521' }, verifyParams: { name: 'ECDSA', hash: 'SHA-512' } }
    case 'RS256':
      return { importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verifyParams: { name: 'RSASSA-PKCS1-v1_5' } }
    case 'RS384':
      return { importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' }, verifyParams: { name: 'RSASSA-PKCS1-v1_5' } }
    case 'RS512':
      return { importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' }, verifyParams: { name: 'RSASSA-PKCS1-v1_5' } }
    case 'PS256':
      return { importParams: { name: 'RSA-PSS', hash: 'SHA-256' }, verifyParams: { name: 'RSA-PSS', saltLength: 32 } }
    default:
      return null
  }
}

async function importVerificationKey(jwk: JsonWebKey, alg: string): Promise<CryptoKey | null> {
  const spec = verifyAlgorithm(alg)
  if (!spec) return null

  const kid = (jwk as { kid?: string }).kid ?? 'default'
  const cacheKey = `${alg}:${kid}`
  const cached = cryptoKeyCache.get(cacheKey)
  if (cached) return cached

  try {
    const key = await crypto.subtle.importKey('jwk', jwk, spec.importParams, false, ['verify'])
    cryptoKeyCache.set(cacheKey, key)
    return key
  } catch {
    return null
  }
}

/** Trả về true/false nếu verify được, null nếu không đủ dữ liệu để verify cục bộ. */
async function verifyWithJwks(alg: string, kid: string | undefined, signature: Uint8Array, data: Uint8Array): Promise<boolean | null> {
  const spec = verifyAlgorithm(alg)
  if (!spec) return null

  let keys = await loadJwks()
  if (!keys) return null

  const pickKeys = (all: JsonWebKey[]): JsonWebKey[] =>
    kid ? all.filter((k) => (k as { kid?: string }).kid === kid) : all

  // Key rotation: cache không khớp kid => nạp lại JWKS đúng 1 lần
  if (kid && pickKeys(keys).length === 0) {
    keys = (await loadJwks(true)) || keys
  }

  const candidates = pickKeys(keys)
  if (candidates.length === 0) return null

  for (const jwk of candidates) {
    const key = await importVerificationKey(jwk, alg)
    if (!key) continue
    const valid = await crypto.subtle.verify(spec.verifyParams as EcdsaParams, key, signature, data)
    if (valid) return true
  }
  return false
}

async function verifyAccessToken(token: string): Promise<VerificationResult> {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'invalid' }

  const [headerSegment, payloadSegment, signatureSegment] = parts

  let header: { alg?: string; kid?: string }
  let payload: JwtPayload
  try {
    header = decodeJsonSegment<{ alg?: string; kid?: string }>(headerSegment)
    payload = decodeJsonSegment<JwtPayload>(payloadSegment)
  } catch {
    return { ok: false, reason: 'invalid' }
  }

  if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
    return { ok: false, reason: 'invalid' }
  }

  const data = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`)
  const signature = base64UrlToBytes(signatureSegment)
  const alg = header.alg || ''

  try {
    if (alg === 'HS256') {
      const secret = Deno.env.get('SUPABASE_JWT_SECRET')
      if (!secret) return { ok: false, reason: 'unverifiable' }
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
      const valid = await crypto.subtle.verify('HMAC', key, signature, data)
      return valid ? { ok: true, payload } : { ok: false, reason: 'invalid' }
    }

    const result = await verifyWithJwks(alg, header.kid, signature, data)
    if (result === null) return { ok: false, reason: 'unverifiable' }
    return result ? { ok: true, payload } : { ok: false, reason: 'invalid' }
  } catch (err) {
    console.error('[auth] Local JWT verification failed:', (err as Error).message)
    return { ok: false, reason: 'unverifiable' }
  }
}

export async function requireAuth(req: Request): Promise<{
  user: AuthenticatedUser
  supabaseClient: ReturnType<typeof createAuthClient>
  serviceRoleClient: ReturnType<typeof createServiceRoleClient>
}> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    throw new Error('Missing Authorization header')
  }

  const supabaseClient = createAuthClient(req)
  const serviceRoleClient = createServiceRoleClient()

  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    throw new Error('Missing Authorization header')
  }

  // Verify token CỤC BỘ (0 round-trip). Chỉ fallback về GoTrue khi không thể
  // verify cục bộ (thuật toán ký chưa hỗ trợ / JWKS tạm thời lỗi).
  let userId: string
  let userEmail: string | undefined

  const verification = await verifyAccessToken(token)
  if (verification.ok) {
    // JWT của user luôn có `sub`. Anon key / service_role key cũng được ký bằng
    // cùng khoá của project nhưng KHÔNG có `sub` => chặn luôn.
    if (!verification.payload.sub) {
      throw new Error('Unauthorized or invalid token')
    }
    userId = verification.payload.sub
    userEmail = verification.payload.email
  } else if (verification.reason === 'invalid') {
    throw new Error('Unauthorized or invalid token')
  } else {
    const { data: authData, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !authData.user) {
      throw new Error('Unauthorized or invalid token')
    }
    userId = authData.user.id
    userEmail = authData.user.email ?? undefined
  }

  // Retrieve User Profile and Student Classes in parallel using service role client
  const [profileRes, stClassesRes] = await Promise.all([
    serviceRoleClient
      .from('profiles')
      .select('id, username, full_name, role, class_id')
      .eq('id', userId)
      .single(),
    serviceRoleClient
      .from('student_classes')
      .select('class_id')
      .eq('student_id', userId)
  ])

  if (profileRes.error || !profileRes.data) {
    throw new Error('User profile not found')
  }

  const profile = profileRes.data
  const classIds = profile.role === 'STUDENT' ? (stClassesRes.data?.map((c) => c.class_id) || []) : []

  const user: AuthenticatedUser = {
    id: profile.id,
    email: userEmail,
    username: profile.username,
    fullName: profile.full_name,
    role: profile.role as UserRole,
    classId: profile.class_id || (classIds[0] || null),
    classIds,
  }

  return { user, supabaseClient, serviceRoleClient }
}

export async function requireAdmin(req: Request) {
  const context = await requireAuth(req)
  if (context.user.role !== 'ADMIN') {
    throw new Error('Forbidden: Admin access required')
  }
  return context
}

export async function requireStudent(req: Request) {
  const context = await requireAuth(req)
  if (context.user.role !== 'STUDENT') {
    throw new Error('Forbidden: Student access required')
  }
  return context
}
