import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.540.0'
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3.540.0'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    // Require authentication (only ADMIN / teacher can upload files)
    const { user } = await requireAuth(req)
    if (user.role !== 'ADMIN') {
      return errorResponse('Forbidden: Admin access required', 403)
    }

    const body = await req.json().catch(() => ({}))
    const { fileName, contentType } = body

    if (!fileName || typeof fileName !== 'string') {
      return errorResponse('Missing or invalid required parameter: fileName', 400)
    }

    const endpoint = Deno.env.get('R2_S3_API_URL')
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID') || ''
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY') || ''
    const bucketName = Deno.env.get('R2_BUCKET_NAME')
    const publicDomain = Deno.env.get('R2_PUBLIC_URL')

    if (!endpoint || !bucketName || !publicDomain) {
      return errorResponse('Cloudflare R2 is not properly configured on server', 500)
    }

    const s3 = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })

    const finalContentType = contentType || 'application/pdf'

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      ContentType: finalContentType,
    })

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })

    const cleanPublicDomain = publicDomain.replace(/\/+$/, '')
    const cleanFileName = fileName.replace(/^\/+/, '')
    const publicUrl = `${cleanPublicDomain}/${cleanFileName}`

    return jsonResponse({ uploadUrl, publicUrl })
  } catch (err: unknown) {
    const error = err as Error
    const message = error.message || 'Internal server error'
    const status = message.includes('Forbidden')
      ? 403
      : (message.includes('Authorization') || message.includes('token') || message.includes('User profile not found'))
        ? 401
        : 500
    return errorResponse(message, status)
  }
})
