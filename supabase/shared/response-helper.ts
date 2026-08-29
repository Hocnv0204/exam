export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
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
