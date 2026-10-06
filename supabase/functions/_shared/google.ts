// Module gọi Google Meet REST API dùng chung cho meet-create / meet-sync.
// - Xin access_token từ refresh_token qua https://oauth2.googleapis.com/token
// - Wrap fetch tới https://meet.googleapis.com/v2/...
// - Tự động gộp phân trang (pageToken) theo meet.md §2.1

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const MEET_API_BASE = 'https://meet.googleapis.com'

export interface GoogleEnv {
  clientId: string
  clientSecret: string
  refreshToken: string
}

export function getGoogleEnv(): GoogleEnv {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN') || ''
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Google OAuth env (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN). ' +
        'Run: supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REFRESH_TOKEN=...',
    )
  }
  return { clientId, clientSecret, refreshToken }
}

// Cache access_token ở module scope (sống theo isolate) để cron quét 20
// sessions không phải xin token lại cho mỗi session (token sống ~1h).
let cachedToken: { value: string; expiresAt: number } | null = null

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value
  }
  const { clientId, clientSecret, refreshToken } = getGoogleEnv()
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google OAuth refresh failed (${res.status}): ${text}`)
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string }
  if (!body.access_token) {
    throw new Error(`Google OAuth refresh returned no access_token: ${JSON.stringify(body)}`)
  }
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in || 3600) * 1000,
  }
  return cachedToken.value
}

export async function meetApiFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<unknown> {
  const res = await fetch(`${MEET_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Meet API ${path} failed (${res.status}): ${text}`)
  }
  if (res.status === 204) return null
  return await res.json()
}

interface PagedListResponse {
  nextPageToken?: string
  [key: string]: unknown
}

// GET một list endpoint và tự động gộp mọi trang qua pageToken.
async function fetchAllPages<T>(
  buildPath: (pageToken?: string) => string,
  accessToken: string,
  itemsKey: string,
): Promise<T[]> {
  const all: T[] = []
  let pageToken: string | undefined = undefined
  for (let page = 0; page < 20; page++) {
    const data = (await meetApiFetch(buildPath(pageToken), accessToken)) as PagedListResponse
    const items = (data?.[itemsKey] as T[] | undefined) || []
    all.push(...items)
    pageToken = data?.nextPageToken
    if (!pageToken) break
  }
  return all
}

export interface ConferenceRecord {
  name: string // "conferenceRecords/xxxx"
  space?: { name?: string }
  startTime?: string
  endTime?: string
  expireTime?: string
}

export interface MeetRecording {
  name: string // "conferenceRecords/xxxx/recordings/yyyy" (khóa upsert)
  state: string // ENDED | FILE_GENERATED | ...
  startTime?: string
  endTime?: string
  driveDestination?: {
    file?: string
    folder?: string
    exportUri?: string
  }
}

// Lọc conference records theo space: GET /v2/conferenceRecords?filter=space.name="spaces/xxxx"
export async function listConferenceRecordsForSpace(
  spaceName: string,
  accessToken: string,
): Promise<ConferenceRecord[]> {
  const filter = `space.name="${spaceName}"`
  return await fetchAllPages<ConferenceRecord>(
    (pageToken) => {
      const params = new URLSearchParams({ filter, pageSize: '50' })
      if (pageToken) params.set('pageToken', pageToken)
      return `/v2/conferenceRecords?${params.toString()}`
    },
    accessToken,
    'conferenceRecords',
  )
}

export async function listRecordings(
  conferenceRecordName: string,
  accessToken: string,
): Promise<MeetRecording[]> {
  return await fetchAllPages<MeetRecording>(
    (pageToken) => {
      const params = new URLSearchParams({ pageSize: '50' })
      if (pageToken) params.set('pageToken', pageToken)
      return `/v2/${conferenceRecordName}/recordings?${params.toString()}`
    },
    accessToken,
    'recordings',
  )
}
