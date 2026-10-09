# Hướng dẫn chi tiết cho AI (Implementation Plan: Migrate PDF to Cloudflare R2)

Bạn đang được giao nhiệm vụ thực thi việc chuyển đổi lưu trữ file PDF từ Supabase Storage sang Cloudflare R2 cho dự án này. Hệ thống đã được cấu hình sẵn các biến môi trường cho Cloudflare R2 trong file `.env`. 

Hãy thực hiện chính xác các bước dưới đây:

## Nhiệm vụ 1: Tạo Supabase Edge Function `upload-r2`
Tạo một Edge Function mới tại `supabase/functions/upload-r2/index.ts` để cấp phát Pre-signed URL cho quá trình upload.

**Chi tiết file `supabase/functions/upload-r2/index.ts`:**
1. Import thư viện từ esm.sh:
   - `@aws-sdk/client-s3`: dùng class `S3Client`, `PutObjectCommand`.
   - `@aws-sdk/s3-request-presigner`: dùng hàm `getSignedUrl`.
   - Các helper có sẵn của project: `serve` (từ deno), `handleCors`, `jsonResponse`, `errorResponse` (từ `../../shared/response-helper.ts`), `requireAuth` (từ `../../shared/auth-middleware.ts`).
2. Xử lý CORS bằng `handleCors(req)`.
3. Yêu cầu xác thực `requireAuth(req)` (chỉ có giáo viên/admin mới được phép upload).
4. Khởi tạo `S3Client`:
   ```typescript
   const s3 = new S3Client({
     region: 'auto',
     endpoint: Deno.env.get('R2_S3_API_URL'),
     credentials: {
       accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID') || '',
       secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY') || '',
     },
   })
   ```
5. Nhận body từ request (`fileName`, `contentType`).
6. Tạo `PutObjectCommand`:
   ```typescript
   const bucketName = Deno.env.get('R2_BUCKET_NAME')
   const command = new PutObjectCommand({
     Bucket: bucketName,
     Key: fileName,
     ContentType: contentType
   })
   ```
7. Tạo Presigned URL: `const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })`
8. Trả về `uploadUrl` và `publicUrl`:
   ```typescript
   const publicDomain = Deno.env.get('R2_PUBLIC_URL')
   const publicUrl = `${publicDomain}/${fileName}`
   return jsonResponse({ uploadUrl, publicUrl })
   ```

## Nhiệm vụ 2: Chỉnh sửa Frontend (`fe/src/js/api.js`)
Tìm đến object `export const api = { ... }`, sửa lại phương thức `uploadFile` như sau:

```javascript
  uploadFile: async (file) => {
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
    showLoading()
    try {
      // 1. Lấy Pre-signed URL từ Edge Function mới
      const result = await request('upload-r2', {
        method: 'POST',
        body: JSON.stringify({ fileName, contentType: file.type })
      })

      if (!result || !result.uploadUrl) {
        throw new Error('Không thể lấy đường dẫn upload (Pre-signed URL) từ server.')
      }

      // 2. Upload file trực tiếp lên R2 bằng Pre-signed URL
      const uploadRes = await fetch(result.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type
        },
        body: file
      })

      if (!uploadRes.ok) {
        const errText = await uploadRes.text()
        throw new Error(`Upload to R2 failed: ${errText}`)
      }

      // 3. Trả về publicUrl thay vì fileName
      return result.publicUrl
    } finally {
      hideLoading()
    }
  }
```

## Nhiệm vụ 3: Đảm bảo tương thích với tính năng tạo/sửa bài tập
Ở các file view tạo bài tập (ví dụ `create-hw.js`), vì `uploadFile` bây giờ trả về toàn bộ `https://...` link, nên `pdf_path` khi lưu vào table `homeworks` sẽ tự động là một Full HTTP URL. Các file code Backend hiện hành (`homework-detail`, v.v) đã có sẵn block check `!pdfUrl.startsWith('http')` nên sẽ tự động bypass luồng lấy Supabase Signed URL, giúp view file mượt mà. Đảm bảo rằng việc đổi giá trị trả về của `uploadFile` (từ `fileName` sang URL đầy đủ) không phá vỡ logic giao diện đang gán tên file.

## Các lệnh terminal cần chạy để kiểm tra:
1. `supabase functions new upload-r2` (Nếu chưa có folder)
2. Viết code vào `supabase/functions/upload-r2/index.ts`.
3. Kiểm tra lại hoạt động cục bộ hoặc báo cáo hoàn thành.
