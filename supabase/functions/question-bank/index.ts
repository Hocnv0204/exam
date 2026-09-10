import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin, requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { user, serviceRoleClient } = await requireAuth(req)
    if (user.role !== 'ADMIN') {
      return errorResponse('Forbidden: Chỉ quản trị viên mới có quyền truy cập ngân hàng câu hỏi', 403)
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // ========================================================
    // GET: Truy vấn danh sách câu hỏi trong ngân hàng & Thống kê
    // ========================================================
    if (req.method === 'GET') {
      const subject = url.searchParams.get('subject')
      const gradeLevel = url.searchParams.get('gradeLevel')
      const classId = url.searchParams.get('classId')
      const chapterId = url.searchParams.get('chapterId')
      const lessonId = url.searchParams.get('lessonId')
      const questionType = url.searchParams.get('questionType')
      const difficulty = url.searchParams.get('difficulty')
      const search = url.searchParams.get('search')
      const statsOnly = url.searchParams.get('stats') === 'true'

      // Nếu chỉ yêu cầu thống kê
      if (statsOnly) {
        let baseQuery = serviceRoleClient.from('question_bank').select('id, subject, question_type, difficulty')
        if (subject) baseQuery = baseQuery.eq('subject', subject)
        if (gradeLevel) baseQuery = baseQuery.eq('grade_level', parseInt(gradeLevel, 10))
        if (chapterId) baseQuery = baseQuery.eq('chapter_id', chapterId)

        const { data: qData, error: qErr } = await baseQuery
        if (qErr) return errorResponse(qErr.message, 500)

        const total = (qData || []).length
        const mc = (qData || []).filter(q => q.question_type === 'MULTIPLE_CHOICE').length
        const tf = (qData || []).filter(q => q.question_type === 'TRUE_FALSE').length
        const sa = (qData || []).filter(q => q.question_type === 'SHORT_ANSWER').length

        const diffCounts = {
          NHAN_BIET: (qData || []).filter(q => q.difficulty === 'NHAN_BIET').length,
          THONG_HIEU: (qData || []).filter(q => q.difficulty === 'THONG_HIEU').length,
          VAN_DUNG: (qData || []).filter(q => q.difficulty === 'VAN_DUNG').length,
          VAN_DUNG_CAO: (qData || []).filter(q => q.difficulty === 'VAN_DUNG_CAO').length,
        }

        return jsonResponse({ total, mc, tf, sa, diffCounts })
      }

      // Truy vấn chi tiết câu hỏi kèm thông tin Chương, Bài học, Lớp
      let query = serviceRoleClient
        .from('question_bank')
        .select(`
          id,
          subject,
          grade_level,
          class_id,
          chapter_id,
          lesson_id,
          question_type,
          difficulty,
          prompt,
          mc_answer,
          tf_answers,
          sa_answer,
          sa_tolerance,
          points,
          tags,
          usage_count,
          created_at,
          chapters (
            id,
            title,
            classes (
              id,
              name
            )
          ),
          lessons (
            id,
            title
          )
        `)
        .order('created_at', { ascending: false })

      if (subject) query = query.eq('subject', subject)
      if (gradeLevel) query = query.eq('grade_level', parseInt(gradeLevel, 10))
      if (classId) query = query.eq('class_id', classId)
      if (chapterId) query = query.eq('chapter_id', chapterId)
      if (lessonId) query = query.eq('lesson_id', lessonId)
      if (questionType) query = query.eq('question_type', questionType)
      if (difficulty) query = query.eq('difficulty', difficulty)

      const limit = parseInt(url.searchParams.get('limit') || '100', 10)
      query = query.limit(limit)

      const { data: questions, error } = await query
      if (error) return errorResponse(error.message, 500)

      let result = questions || []
      if (search && search.trim()) {
        const term = search.trim().toLowerCase()
        result = result.filter((q: any) => {
          return (q.prompt || '').toLowerCase().includes(term) ||
            (q.tags || []).some((t: string) => t.toLowerCase().includes(term))
        })
      }

      return jsonResponse(result)
    }

    // ========================================================
    // POST: Xử lý Bulk Import, Bốc đề ngẫu nhiên, Tạo câu lẻ
    // ========================================================
    if (req.method === 'POST') {
      const body = await req.json()

      // Action 1: Nhập hàng loạt câu hỏi từ Markdown
      if (action === 'import') {
        const {
          subject = 'TOAN',
          gradeLevel = 12,
          classId = null,
          chapterId = null,
          lessonId = null,
          defaultDifficulty = 'THONG_HIEU',
          questions = []
        } = body

        if (!Array.isArray(questions) || questions.length === 0) {
          return errorResponse('Danh sách câu hỏi nhập vào trống!', 400)
        }

        const rowsToInsert = questions.map((q: any) => {
          const promptPayload = {
            isInteractive: true,
            text: q.promptText || '',
            imageUrl: q.imageUrl || '',
            options: (q.options || []).map((o: any) => ({
              id: o.id || o.key,
              key: o.id || o.key,
              text: o.text || ''
            })),
            explanation: q.explanation || ''
          }

          return {
            subject,
            grade_level: gradeLevel,
            class_id: classId || null,
            chapter_id: chapterId || null,
            lesson_id: lessonId || null,
            question_type: q.questionType,
            difficulty: q.difficulty || defaultDifficulty,
            prompt: JSON.stringify(promptPayload),
            mc_answer: q.mcAnswer || null,
            tf_answers: q.tfAnswers || null,
            sa_answer: q.saAnswer !== undefined ? String(q.saAnswer) : null,
            sa_tolerance: q.saTolerance || 0,
            points: q.points || (q.questionType === 'TRUE_FALSE' ? 1.0 : (q.questionType === 'SHORT_ANSWER' ? 0.5 : 0.25)),
            tags: q.tags || [],
            usage_count: 0
          }
        })

        const { data: inserted, error: insertError } = await serviceRoleClient
          .from('question_bank')
          .insert(rowsToInsert)
          .select('id')

        if (insertError) return errorResponse(insertError.message, 500)

        return jsonResponse({
          success: true,
          importedCount: (inserted || []).length,
          message: `Đã nhập thành công ${(inserted || []).length} câu hỏi vào Ngân hàng đề!`
        })
      }

      // Action 2: Tạo đề ngẫu nhiên từ Ngân hàng đề (hoặc Preview bốc câu)
      if (action === 'generate-exam') {
        const {
          subject,
          gradeLevel,
          chapterIds = [],
          classId,
          targetLessonId,
          title,
          durationMinutes = 60,
          passScore = 5.0,
          maxScore = 10.0,
          type = 'PRACTICE',
          matrix = { mcCount: 12, tfCount: 4, saCount: 6 },
          previewOnly = false
        } = body

        if (!previewOnly && (!targetLessonId || !title)) {
          return errorResponse('Vui lòng chọn bài học đích và nhập tiêu đề đề thi!', 400)
        }

        // Lấy toàn bộ câu hỏi thỏa mãn tiêu chí từ Ngân hàng
        let candidateQuery = serviceRoleClient
          .from('question_bank')
          .select('*')

        if (subject) candidateQuery = candidateQuery.eq('subject', subject)
        if (gradeLevel) candidateQuery = candidateQuery.eq('grade_level', gradeLevel)
        if (Array.isArray(chapterIds) && chapterIds.length > 0) {
          candidateQuery = candidateQuery.in('chapter_id', chapterIds)
        }

        const { data: candidates, error: candError } = await candidateQuery
        if (candError) return errorResponse(candError.message, 500)

        const allCandidates = candidates || []
        const mcPool = allCandidates.filter(q => q.question_type === 'MULTIPLE_CHOICE')
        const tfPool = allCandidates.filter(q => q.question_type === 'TRUE_FALSE')
        const saPool = allCandidates.filter(q => q.question_type === 'SHORT_ANSWER')

        const mcRequested = Number(matrix.mcCount) || 0
        const tfRequested = Number(matrix.tfCount) || 0
        const saRequested = Number(matrix.saCount) || 0

        if (mcPool.length < mcRequested) {
          return errorResponse(`Không đủ câu hỏi Trắc nghiệm ABCD trong ngân hàng (yêu cầu ${mcRequested} câu, hiện có ${mcPool.length} câu)`, 400)
        }
        if (tfPool.length < tfRequested) {
          return errorResponse(`Không đủ câu hỏi Đúng/Sai trong ngân hàng (yêu cầu ${tfRequested} câu, hiện có ${tfPool.length} câu)`, 400)
        }
        if (saPool.length < saRequested) {
          return errorResponse(`Không đủ câu hỏi Trả lời ngắn trong ngân hàng (yêu cầu ${saRequested} câu, hiện có ${saPool.length} câu)`, 400)
        }

        // Thuật toán bốc ngẫu nhiên có trọng số ưu tiên câu có usage_count thấp
        const pickRandomWeighted = (pool: any[], count: number) => {
          // Sắp xếp tăng dần theo usage_count, thêm yếu tố ngẫu nhiên
          const shuffled = [...pool].sort((a, b) => {
            const weightA = (a.usage_count || 0) + Math.random() * 0.8
            const weightB = (b.usage_count || 0) + Math.random() * 0.8
            return weightA - weightB
          })
          return shuffled.slice(0, count)
        }

        const pickedMC = pickRandomWeighted(mcPool, mcRequested)
        const pickedTF = pickRandomWeighted(tfPool, tfRequested)
        const pickedSA = pickRandomWeighted(saPool, saRequested)

        const combinedQuestions = [...pickedMC, ...pickedTF, ...pickedSA]

        // Nếu chỉ là Preview bốc ngẫu nhiên để giáo viên xem thử trước khi tạo
        if (previewOnly) {
          return jsonResponse({
            previewQuestions: combinedQuestions,
            summary: {
              mcPicked: pickedMC.length,
              tfPicked: pickedTF.length,
              saPicked: pickedSA.length,
              total: combinedQuestions.length
            }
          })
        }

        // Tạo bài tập mới trong bảng homeworks
        const { data: newHw, error: hwCreateError } = await serviceRoleClient
          .from('homeworks')
          .insert({
            lesson_id: targetLessonId,
            title,
            pdf_path: '',
            duration_minutes: durationMinutes,
            pass_score: passScore,
            max_score: maxScore,
            is_published: true,
            type: type || 'PRACTICE',
            max_attempts: type === 'EXAM' ? 1 : 3
          })
          .select('id')
          .single()

        if (hwCreateError) return errorResponse(hwCreateError.message, 500)
        const homeworkId = newHw.id

        // Tạo các câu hỏi và đáp án cho bài tập mới
        const questionsToInsert: any[] = []
        const answersToInsert: any[] = []

        combinedQuestions.forEach((qbQ, idx) => {
          const qNum = idx + 1
          const questionId = crypto.randomUUID()

          questionsToInsert.push({
            id: questionId,
            homework_id: homeworkId,
            question_number: qNum,
            question_type: qbQ.question_type,
            prompt: qbQ.prompt,
            points: qbQ.points || (qbQ.question_type === 'TRUE_FALSE' ? 1.0 : (qbQ.question_type === 'SHORT_ANSWER' ? 0.5 : 0.25))
          })

          answersToInsert.push({
            question_id: questionId,
            mc_answer: qbQ.mc_answer || null,
            tf_answers: qbQ.tf_answers || null,
            sa_answer: qbQ.sa_answer || null,
            sa_tolerance: qbQ.sa_tolerance || 0
          })
        })

        const { error: qInsertErr } = await serviceRoleClient.from('questions').insert(questionsToInsert)
        if (qInsertErr) return errorResponse(qInsertErr.message, 500)

        const { error: aInsertErr } = await serviceRoleClient.from('question_answers').insert(answersToInsert)
        if (aInsertErr) return errorResponse(aInsertErr.message, 500)

        // Cập nhật usage_count cho các câu hỏi đã bốc
        const pickedIds = combinedQuestions.map(q => q.id)
        for (const qId of pickedIds) {
          await serviceRoleClient.rpc('increment_qb_usage', { q_id: qId }).catch(async () => {
            // Fallback nếu chưa có RPC
            const curQ = combinedQuestions.find(q => q.id === qId)
            const curCount = (curQ?.usage_count || 0) + 1
            await serviceRoleClient.from('question_bank').update({ usage_count: curCount }).eq('id', qId)
          })
        }

        return jsonResponse({
          success: true,
          homeworkId,
          totalQuestions: combinedQuestions.length,
          message: `Đã tạo thành công đề thi "${title}" với ${combinedQuestions.length} câu hỏi ngẫu nhiên từ ngân hàng!`
        })
      }

      // Action 3: Thêm một câu hỏi đơn lẻ
      const {
        subject = 'TOAN',
        gradeLevel = 12,
        classId = null,
        chapterId = null,
        lessonId = null,
        questionType = 'MULTIPLE_CHOICE',
        difficulty = 'THONG_HIEU',
        prompt,
        mcAnswer = null,
        tfAnswers = null,
        saAnswer = null,
        saTolerance = 0,
        points = 0.25,
        tags = []
      } = body

      const { data: singleQ, error: singleErr } = await serviceRoleClient
        .from('question_bank')
        .insert({
          subject,
          grade_level: gradeLevel,
          class_id: classId,
          chapter_id: chapterId,
          lesson_id: lessonId,
          question_type: questionType,
          difficulty,
          prompt,
          mc_answer: mcAnswer,
          tf_answers: tfAnswers,
          sa_answer: saAnswer,
          sa_tolerance: saTolerance,
          points,
          tags,
          usage_count: 0
        })
        .select('*')
        .single()

      if (singleErr) return errorResponse(singleErr.message, 500)
      return jsonResponse(singleQ)
    }

    // ========================================================
    // DELETE: Xóa câu hỏi khỏi ngân hàng
    // ========================================================
    if (req.method === 'DELETE') {
      const qId = url.searchParams.get('id')
      if (!qId) return errorResponse('Thiếu ID câu hỏi cần xóa', 400)

      const { error: delErr } = await serviceRoleClient
        .from('question_bank')
        .delete()
        .eq('id', qId)

      if (delErr) return errorResponse(delErr.message, 500)
      return jsonResponse({ success: true, message: 'Đã xóa câu hỏi thành công!' })
    }

    // ========================================================
    // PUT: Chỉnh sửa thông tin câu hỏi
    // ========================================================
    if (req.method === 'PUT') {
      const body = await req.json()
      const { id, ...updates } = body
      if (!id) return errorResponse('Thiếu ID câu hỏi cần cập nhật', 400)

      updates.updated_at = new Date().toISOString()
      const { data: updated, error: updateErr } = await serviceRoleClient
        .from('question_bank')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single()

      if (updateErr) return errorResponse(updateErr.message, 500)
      return jsonResponse(updated)
    }

    return errorResponse('Method Not Allowed', 405)
  } catch (err: any) {
    return errorResponse(err.message || 'Lỗi xử lý ngân hàng câu hỏi', 500)
  }
})
