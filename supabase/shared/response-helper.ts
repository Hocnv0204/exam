export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region, *',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  // Cho phép browser cache kết quả preflight 24h.
  // Thiếu header này, mỗi request (Authorization + Origin) đều phải preflight
  // thêm 1 round-trip tới Edge Function => +100~300ms mỗi lần gọi API.
  'Access-Control-Max-Age': '86400',
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}

export function jsonResponse<T = unknown>(data: T, status: any = 200): Response {
  const statusCode = typeof status === 'number' ? status : (typeof status === 'object' && status?.status ? Number(status.status) : 200)
  return new Response(
    JSON.stringify({
      success: true,
      data,
    }),
    {
      status: statusCode,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  )
}

export function errorResponse(
  message: string,
  status: any = 400,
  details: unknown = null
): Response {
  const statusCode = typeof status === 'number' ? status : (typeof status === 'object' && status?.status ? Number(status.status) : 400)
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      details,
    }),
    {
      status: statusCode,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  )
}
