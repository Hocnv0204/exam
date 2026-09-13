import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin, requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

async function getScopeTargetIds(
  serviceRoleClient: any,
  gradeBlock?: string | null
): Promise<{ classIds: string[]; chapterIds: string[] }> {
  if (!gradeBlock) return { classIds: [], chapterIds: [] }

  const { data: matchedClasses } = await serviceRoleClient
    .from('classes')
    .select('id')
    .eq('grade_block', gradeBlock)
  const classIds = (matchedClasses || []).map((c: any) => c.id)

  let chapterIds: string[] = []
  if (classIds.length > 0) {
    const { data: matchedChapters } = await serviceRoleClient
      .from('chapters')
      .select('id')
      .in('class_id', classIds)
    chapterIds = (matchedChapters || []).map((ch: any) => ch.id)
  }

  return { classIds, chapterIds }
}

function normalizeBankPromptPayload(rawPrompt: any, fallbackData: any = {}): any {
  let payload: any = null

  if (typeof rawPrompt === 'object' && rawPrompt !== null) {
    payload = { ...rawPrompt }
  } else if (typeof rawPrompt === 'string') {
    try {
      const parsed = JSON.parse(rawPrompt)
      if (parsed && typeof parsed === 'object') {
        payload = parsed
      }
    } catch (_) {}
  }

  if (!payload) {
    payload = {
      isInteractive: true,
      text: fallbackData.promptText || fallbackData.content || (typeof rawPrompt === 'string' ? rawPrompt : ''),
      imageUrl: fallbackData.imageUrl || '',
      partTitle: fallbackData.partTitle || '',
      options: fallbackData.options || [],
      statements: fallbackData.statements || [],
      explanation: fallbackData.explanation || ''
    }
  }

  // Unwrap if payload.text is itself a stringified JSON (prevent double-nested JSON)
  let unwrapCount = 0
  while (typeof payload.text === 'string' && payload.text.trim().startsWith('{') && unwrapCount < 3) {
    try {
      const inner = JSON.parse(payload.text)
      if (inner && typeof inner === 'object' && (inner.text !== undefined || inner.options || inner.statements)) {
        payload = {
          ...payload,
          ...inner,
          text: inner.text !== undefined ? inner.text : payload.text,
          options: (inner.options && inner.options.length) ? inner.options : payload.options,
          statements: (inner.statements && inner.statements.length) ? inner.statements : payload.statements,
          explanation: inner.explanation || payload.explanation || '',
          imageUrl: inner.imageUrl || payload.imageUrl || ''
        }
        unwrapCount++
      } else {
        break
      }
    } catch (_) {
      break
    }
  }

  if (!Array.isArray(payload.options)) payload.options = []
  if (!Array.isArray(payload.statements)) payload.statements = []
  if (payload.text === undefined) payload.text = ''

  return payload
}

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
    // GET: Truy vấn danh sách câu hỏi & Thống kê & Kiểm tra số lượng
    // ========================================================
    if (req.method === 'GET') {
      const subject = url.searchParams.get('subject')
      const gradeBlock = url.searchParams.get('gradeBlock')
      const gradeLevel = url.searchParams.get('gradeLevel')
      const classId = url.searchParams.get('classId')
      const chapterId = url.searchParams.get('chapterId')
      const lessonId = url.searchParams.get('lessonId')
      const questionType = url.searchParams.get('questionType')
      const difficulty = url.searchParams.get('difficulty')
      const search = url.searchParams.get('search')
      const statsOnly = url.searchParams.get('stats') === 'true'

      // Kiểm tra số lượng câu hỏi khả dụng theo phạm vi (Live availability check)
      if (action === 'check-availability') {
        const scopeType = url.searchParams.get('scopeType') || 'BLOCK'
        let baseQuery = serviceRoleClient
          .from('question_bank')
          .select('id, question_type, difficulty, grade_block, class_id, chapter_id, lesson_id')

        if (scopeType === 'LESSON' && lessonId) {
          baseQuery = baseQuery.eq('lesson_id', lessonId)
        } else if (scopeType === 'CHAPTER' && chapterId) {
          baseQuery = baseQuery.eq('chapter_id', chapterId)
        } else if (scopeType === 'CLASS' && classId) {
          baseQuery = baseQuery.eq('class_id', classId)
        } else if (lessonId) {
          baseQuery = baseQuery.eq('lesson_id', lessonId)
        } else if (chapterId) {
          baseQuery = baseQuery.eq('chapter_id', chapterId)
        } else if (classId) {
          baseQuery = baseQuery.eq('class_id', classId)
        } else if (gradeBlock) {
          const { classIds: avClassIds, chapterIds: avChapterIds } = await getScopeTargetIds(serviceRoleClient, gradeBlock)
          const orClauses = [`grade_block.eq.${gradeBlock}`]
          if (avClassIds.length > 0) orClauses.push(`class_id.in.(${avClassIds.join(',')})`)
          if (avChapterIds.length > 0) orClauses.push(`chapter_id.in.(${avChapterIds.join(',')})`)
          baseQuery = baseQuery.or(orClauses.join(','))
        }

        const { data: rows, error: availErr } = await baseQuery
        if (availErr) return errorResponse(availErr.message, 500)

        const all = rows || []
        const mc = all.filter(q => q.question_type === 'MULTIPLE_CHOICE').length
        const tf = all.filter(q => q.question_type === 'TRUE_FALSE').length
        const sa = all.filter(q => q.question_type === 'SHORT_ANSWER').length

        // Phân nhóm theo bài học và chương
        const byChapter: Record<string, { total: number; mc: number; tf: number; sa: number }> = {}
        const byLesson: Record<string, { total: number; mc: number; tf: number; sa: number }> = {}

        all.forEach(q => {
          if (q.chapter_id) {
            if (!byChapter[q.chapter_id]) byChapter[q.chapter_id] = { total: 0, mc: 0, tf: 0, sa: 0 }
            byChapter[q.chapter_id].total++
            if (q.question_type === 'MULTIPLE_CHOICE') byChapter[q.chapter_id].mc++
            if (q.question_type === 'TRUE_FALSE') byChapter[q.chapter_id].tf++
            if (q.question_type === 'SHORT_ANSWER') byChapter[q.chapter_id].sa++
          }
          if (q.lesson_id) {
            if (!byLesson[q.lesson_id]) byLesson[q.lesson_id] = { total: 0, mc: 0, tf: 0, sa: 0 }
            byLesson[q.lesson_id].total++
            if (q.question_type === 'MULTIPLE_CHOICE') byLesson[q.lesson_id].mc++
            if (q.question_type === 'TRUE_FALSE') byLesson[q.lesson_id].tf++
            if (q.question_type === 'SHORT_ANSWER') byLesson[q.lesson_id].sa++
          }
        })

        return jsonResponse({
          total: all.length,
          mc,
          tf,
          sa,
          byChapter,
          byLesson
        })
      }

      // Nếu chỉ yêu cầu thống kê chung
      if (statsOnly) {
        let baseQuery = serviceRoleClient.from('question_bank').select('id, subject, question_type, difficulty, grade_block, class_id, chapter_id, lesson_id')
        if (subject) baseQuery = baseQuery.eq('subject', subject)
        if (gradeLevel) baseQuery = baseQuery.eq('grade_level', parseInt(gradeLevel, 10))

        if (lessonId) {
          baseQuery = baseQuery.eq('lesson_id', lessonId)
        } else if (chapterId) {
          baseQuery = baseQuery.eq('chapter_id', chapterId)
        } else if (classId) {
          baseQuery = baseQuery.eq('class_id', classId)
        } else if (gradeBlock) {
          const { classIds: stClassIds, chapterIds: stChapterIds } = await getScopeTargetIds(serviceRoleClient, gradeBlock)
          const orClauses = [`grade_block.eq.${gradeBlock}`]
          if (stClassIds.length > 0) orClauses.push(`class_id.in.(${stClassIds.join(',')})`)
          if (stChapterIds.length > 0) orClauses.push(`chapter_id.in.(${stChapterIds.join(',')})`)
          baseQuery = baseQuery.or(orClauses.join(','))
        }

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
      const includeStats = url.searchParams.get('includeStats') === 'true' || url.searchParams.get('withStats') === 'true'
      let qbScopeTargetIds: { classIds: string[]; chapterIds: string[] } = { classIds: [], chapterIds: [] }
      if (gradeBlock && !lessonId && !chapterId && !classId) {
        qbScopeTargetIds = await getScopeTargetIds(serviceRoleClient, gradeBlock)
      }

      let query = serviceRoleClient
        .from('question_bank')
        .select(`
          id,
          subject,
          grade_level,
          grade_block,
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
              name,
              grade_block
            )
          ),
          lessons (
            id,
            title
          )
        `, { count: 'exact' })

      if (subject) query = query.eq('subject', subject)
      if (gradeLevel) query = query.eq('grade_level', parseInt(gradeLevel, 10))
      if (questionType) query = query.eq('question_type', questionType)
      if (difficulty) query = query.eq('difficulty', difficulty)

      if (lessonId) {
        query = query.eq('lesson_id', lessonId)
      } else if (chapterId) {
        query = query.eq('chapter_id', chapterId)
      } else if (classId) {
        query = query.eq('class_id', classId)
      } else if (gradeBlock) {
        const orClauses = [`grade_block.eq.${gradeBlock}`]
        if (qbScopeTargetIds.classIds.length > 0) orClauses.push(`class_id.in.(${qbScopeTargetIds.classIds.join(',')})`)
        if (qbScopeTargetIds.chapterIds.length > 0) orClauses.push(`chapter_id.in.(${qbScopeTargetIds.chapterIds.join(',')})`)
        query = query.or(orClauses.join(','))
      }

      if (search && search.trim()) {
        query = query.ilike('prompt', `%${search.trim()}%`)
      }

      query = query.order('created_at', { ascending: false })

      // Xử lý phân trang (hỗ trợ cả page/pageSize và limit/offset)
      const isPaginated = url.searchParams.get('paginate') !== 'false' && url.searchParams.get('all') !== 'true'
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
      const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || url.searchParams.get('limit') || '10', 10)))

      if (isPaginated) {
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1
        query = query.range(from, to)
      } else {
        const limit = parseInt(url.searchParams.get('limit') || '500', 10)
        query = query.limit(limit)
      }

      // Stats promise if includeStats=true
      let statsPromise = Promise.resolve({ data: null, error: null })
      if (includeStats) {
        let statsQuery = serviceRoleClient
          .from('question_bank')
          .select('id, question_type, difficulty, grade_block, class_id, chapter_id, lesson_id')
        if (subject) statsQuery = statsQuery.eq('subject', subject)
        if (gradeLevel) statsQuery = statsQuery.eq('grade_level', parseInt(gradeLevel, 10))

        if (lessonId) {
          statsQuery = statsQuery.eq('lesson_id', lessonId)
        } else if (chapterId) {
          statsQuery = statsQuery.eq('chapter_id', chapterId)
        } else if (classId) {
          statsQuery = statsQuery.eq('class_id', classId)
        } else if (gradeBlock) {
          const orClauses = [`grade_block.eq.${gradeBlock}`]
          if (qbScopeTargetIds.classIds.length > 0) orClauses.push(`class_id.in.(${qbScopeTargetIds.classIds.join(',')})`)
          if (qbScopeTargetIds.chapterIds.length > 0) orClauses.push(`chapter_id.in.(${qbScopeTargetIds.chapterIds.join(',')})`)
          statsQuery = statsQuery.or(orClauses.join(','))
        }
        statsPromise = statsQuery
      }

      const [{ data: questions, count, error }, statsRes] = await Promise.all([
        query,
        statsPromise
      ])

      if (error) return errorResponse(error.message, 500)

      const totalItems = count !== null && count !== undefined ? count : (questions || []).length
      const totalPages = isPaginated ? Math.max(1, Math.ceil(totalItems / pageSize)) : 1

      const cleanQuestions = (questions || []).map((q: any) => {
        if (q.prompt) {
          const norm = normalizeBankPromptPayload(q.prompt)
          return {
            ...q,
            prompt: JSON.stringify(norm)
          }
        }
        return q
      })

      let stats = null
      if (includeStats && statsRes.data) {
        const qData = statsRes.data
        stats = {
          total: qData.length,
          mc: qData.filter((q: any) => q.question_type === 'MULTIPLE_CHOICE').length,
          tf: qData.filter((q: any) => q.question_type === 'TRUE_FALSE').length,
          sa: qData.filter((q: any) => q.question_type === 'SHORT_ANSWER').length,
          diffCounts: {
            NHAN_BIET: qData.filter((q: any) => q.difficulty === 'NHAN_BIET').length,
            THONG_HIEU: qData.filter((q: any) => q.difficulty === 'THONG_HIEU').length,
            VAN_DUNG: qData.filter((q: any) => q.difficulty === 'VAN_DUNG').length,
            VAN_DUNG_CAO: qData.filter((q: any) => q.difficulty === 'VAN_DUNG_CAO').length,
          }
        }
      }

      if (!isPaginated) {
        return jsonResponse(cleanQuestions)
      }

      return jsonResponse({
        items: cleanQuestions,
        total: totalItems,
        page,
        pageSize,
        totalPages,
        stats
      })
    }

    // ========================================================
    // POST: Nhập Markdown, Đồng bộ từ Bài tập cũ, Bốc đề ngẫu nhiên
    // ========================================================
    if (req.method === 'POST') {
      const body = await req.json()

      // ----------------------------------------------------
      // Action 1: Nhập hàng loạt câu hỏi từ Markdown
      // ----------------------------------------------------
      if (action === 'import') {
        const {
          subject = 'TOAN',
          gradeLevel = 12,
          gradeBlock = null,
          classId = null,
          chapterId = null,
          lessonId = null,
          defaultDifficulty = 'THONG_HIEU',
          questions = []
        } = body

        if (!Array.isArray(questions) || questions.length === 0) {
          return errorResponse('Danh sách câu hỏi nhập vào trống!', 400)
        }

        let effectiveGradeBlock = gradeBlock
        if (!effectiveGradeBlock && classId) {
          const { data: cData } = await serviceRoleClient.from('classes').select('grade_block').eq('id', classId).single()
          effectiveGradeBlock = cData?.grade_block || '12-Toán'
        }
        if (!effectiveGradeBlock) effectiveGradeBlock = '12-Toán'

        const rowsToInsert = questions.map((q: any) => {
          const promptPayload = normalizeBankPromptPayload(q.prompt, {
            promptText: q.promptText,
            content: q.content,
            imageUrl: q.imageUrl,
            partTitle: q.partTitle,
            options: (q.options || []).map((o: any) => ({
              id: o.id || o.key,
              key: o.id || o.key,
              text: o.text || ''
            })),
            statements: (q.statements || []).map((s: any) => ({
              id: s.id || s.key,
              key: s.id || s.key,
              text: s.text || ''
            })),
            explanation: q.explanation || ''
          })

          const qType = q.questionType || (promptPayload.options && promptPayload.options.length ? 'MULTIPLE_CHOICE' : (promptPayload.statements && promptPayload.statements.length ? 'TRUE_FALSE' : 'SHORT_ANSWER'))

          if (qType === 'TRUE_FALSE' && (!promptPayload.statements || promptPayload.statements.length === 0) && promptPayload.options.length > 0) {
            promptPayload.statements = promptPayload.options
          }
          if (qType === 'MULTIPLE_CHOICE' && (!promptPayload.options || promptPayload.options.length === 0) && promptPayload.statements.length > 0) {
            promptPayload.options = promptPayload.statements
          }

          return {
            subject,
            grade_level: Number(gradeLevel) || 12,
            grade_block: effectiveGradeBlock,
            class_id: classId || null,
            chapter_id: chapterId || null,
            lesson_id: lessonId || null,
            question_type: qType,
            difficulty: q.difficulty || defaultDifficulty,
            prompt: JSON.stringify(promptPayload),
            mc_answer: q.mcAnswer || promptPayload.mcAnswer || null,
            tf_answers: q.tfAnswers || promptPayload.tfAnswers || null,
            sa_answer: q.saAnswer !== undefined && q.saAnswer !== null ? String(q.saAnswer) : (promptPayload.saAnswer ? String(promptPayload.saAnswer) : null),
            sa_tolerance: Number(q.saTolerance) || promptPayload.saTolerance || 0,
            points: Number(q.points) || (qType === 'TRUE_FALSE' ? 1.0 : (qType === 'SHORT_ANSWER' ? 0.5 : 0.25)),
            tags: Array.isArray(q.tags) ? q.tags : [],
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

      // ----------------------------------------------------
      // Action 2: Trích xuất / Đồng bộ từ các Bài tập / Đề thi đã có
      // ----------------------------------------------------
      if (action === 'import-from-homework') {
        const {
          homeworkIds = [],
          classId = null,
          chapterId = null,
          lessonId = null,
          deduplicate = true
        } = body

        let hwQuery = serviceRoleClient
          .from('homeworks')
          .select(`
            id,
            title,
            lesson_id,
            lessons (
              id,
              title,
              chapter_id,
              chapters (
                id,
                title,
                class_id,
                classes (
                  id,
                  name,
                  grade_block
                )
              )
            )
          `)

        if (Array.isArray(homeworkIds) && homeworkIds.length > 0) {
          hwQuery = hwQuery.in('id', homeworkIds)
        } else if (classId) {
          hwQuery = hwQuery.eq('lessons.chapters.class_id', classId)
        }

        const { data: targetHws, error: hwFetchErr } = await hwQuery
        if (hwFetchErr) return errorResponse(hwFetchErr.message, 500)
        if (!targetHws || targetHws.length === 0) {
          return errorResponse('Không tìm thấy bài tập nào để trích xuất!', 404)
        }

        const validHwIds = targetHws.map(h => h.id)

        // Lấy tất cả câu hỏi và đáp án từ các bài tập đã chọn
        const { data: questionsWithAnswers, error: qFetchErr } = await serviceRoleClient
          .from('questions')
          .select(`
            id,
            homework_id,
            question_number,
            question_type,
            prompt,
            content,
            options,
            statements,
            part_title,
            points,
            question_answers (
              mc_answer,
              tf_answers,
              sa_answer,
              sa_tolerance,
              explanation
            )
          `)
          .in('homework_id', validHwIds)
          .order('question_number', { ascending: true })

        if (qFetchErr) return errorResponse(qFetchErr.message, 500)
        if (!questionsWithAnswers || questionsWithAnswers.length === 0) {
          return errorResponse('Các bài tập đã chọn chưa có câu hỏi nào!', 400)
        }

        // Tạo map để tra cứu thông tin Lớp / Chương / Bài học từ homework_id
        const hwMap = new Map<string, any>()
        targetHws.forEach(h => {
          const l = h.lessons as any
          const ch = l?.chapters as any
          const cl = ch?.classes as any
          hwMap.set(h.id, {
            classId: classId || cl?.id || null,
            gradeBlock: cl?.grade_block || '12-Toán',
            chapterId: chapterId || ch?.id || null,
            lessonId: lessonId || l?.id || null,
            title: h.title
          })
        })

        // Nếu bật deduplicate: Lấy danh sách prompt tóm tắt hiện có trong ngân hàng để loại trừ
        let existingPromptsSet = new Set<string>()
        if (deduplicate) {
          const { data: existingRows } = await serviceRoleClient
            .from('question_bank')
            .select('prompt')
          if (existingRows) {
            existingRows.forEach((r: any) => {
              try {
                const parsed = JSON.parse(r.prompt)
                const text = (parsed.text || parsed.prompt || r.prompt || '').trim().toLowerCase().slice(0, 100)
                if (text) existingPromptsSet.add(text)
              } catch (_) {
                const text = (r.prompt || '').trim().toLowerCase().slice(0, 100)
                if (text) existingPromptsSet.add(text)
              }
            })
          }
        }

        const rowsToInsert: any[] = []
        let skippedCount = 0

        questionsWithAnswers.forEach((q: any) => {
          const hwInfo = hwMap.get(q.homework_id) || {}
          const ans = (Array.isArray(q.question_answers) ? q.question_answers[0] : q.question_answers) || {}

          // Chuẩn hóa prompt payload
          const promptPayload = normalizeBankPromptPayload(q.prompt, {
            content: q.content,
            imageUrl: '',
            partTitle: q.part_title,
            options: q.options || [],
            statements: q.statements || [],
            explanation: ans.explanation || ''
          })
          const promptText = promptPayload.text || q.content || ''

          // Kiểm tra trùng lặp
          const sampleKey = promptText.trim().toLowerCase().slice(0, 100)
          if (deduplicate && sampleKey && existingPromptsSet.has(sampleKey)) {
            skippedCount++
            return
          }
          if (sampleKey) existingPromptsSet.add(sampleKey)

          rowsToInsert.push({
            subject: 'TOAN',
            grade_level: 12,
            grade_block: hwInfo.gradeBlock || '12-Toán',
            class_id: hwInfo.classId || null,
            chapter_id: hwInfo.chapterId || null,
            lesson_id: hwInfo.lessonId || null,
            question_type: q.question_type,
            difficulty: 'THONG_HIEU',
            prompt: JSON.stringify(promptPayload),
            mc_answer: ans.mc_answer || null,
            tf_answers: ans.tf_answers || null,
            sa_answer: ans.sa_answer !== undefined && ans.sa_answer !== null ? String(ans.sa_answer) : null,
            sa_tolerance: Number(ans.sa_tolerance) || 0,
            points: Number(q.points) || (q.question_type === 'TRUE_FALSE' ? 1.0 : (q.question_type === 'SHORT_ANSWER' ? 0.5 : 0.25)),
            tags: [hwInfo.title || 'Bài tập cũ'],
            usage_count: 1
          })
        })

        if (rowsToInsert.length === 0) {
          return jsonResponse({
            success: true,
            importedCount: 0,
            skippedCount,
            message: `Tất cả ${skippedCount} câu hỏi từ các bài tập đã chọn đều đã tồn tại trong Ngân hàng đề!`
          })
        }

        const { data: inserted, error: insertError } = await serviceRoleClient
          .from('question_bank')
          .insert(rowsToInsert)
          .select('id')

        if (insertError) return errorResponse(insertError.message, 500)

        return jsonResponse({
          success: true,
          importedCount: (inserted || []).length,
          skippedCount,
          message: `Đã trích xuất và lưu thành công ${(inserted || []).length} câu hỏi vào Ngân hàng đề${skippedCount > 0 ? ` (bỏ qua ${skippedCount} câu trùng lặp)` : ''}!`
        })
      }

      // ----------------------------------------------------
      // Action 3: Bốc câu ngẫu nhiên theo Ma trận (Preview / Finalize)
      // ----------------------------------------------------
      if (action === 'generate-exam') {
        const {
          scopeType = 'BLOCK', // 'BLOCK' | 'CLASS' | 'CHAPTER' | 'LESSON'
          gradeBlock = null,
          classId = null,
          chapterId = null,
          lessonId = null,
          targetLessonId,
          title,
          durationMinutes = 60,
          passScore = 5.0,
          maxScore = 10.0,
          type = 'PRACTICE',
          deadline = null,
          maxViolations = 3,
          showSolutions = true,
          matrix = { mcCount: 12, tfCount: 4, saCount: 6 },
          distribution = null, // Optional per-chapter or per-lesson breakdown: [ { chapterId, lessonId, mcCount, tfCount, saCount } ]
          previewOnly = false
        } = body

        if (!previewOnly && (!targetLessonId || !title)) {
          return errorResponse('Vui lòng chọn bài học đích và nhập tiêu đề đề thi!', 400)
        }

        // Thuật toán bốc ngẫu nhiên có trọng số ưu tiên câu có usage_count thấp
        const pickRandomWeighted = (pool: any[], count: number) => {
          if (count <= 0) return []
          const shuffled = [...pool].sort((a, b) => {
            const weightA = (a.usage_count || 0) + Math.random() * 0.8
            const weightB = (b.usage_count || 0) + Math.random() * 0.8
            return weightA - weightB
          })
          return shuffled.slice(0, count)
        }

        let combinedQuestions: any[] = []

        // Kịch bản A: Có phân bổ chi tiết theo từng Chương hoặc từng Bài (distribution)
        if (Array.isArray(distribution) && distribution.length > 0) {
          const pickedIdsSet = new Set<string>()

          for (const item of distribution) {
            const itemBlock = item.gradeBlock || gradeBlock
            const { classIds: itClassIds, chapterIds: itChapterIds } = await getScopeTargetIds(serviceRoleClient, itemBlock)
            let itemQuery = serviceRoleClient.from('question_bank').select('*')
            if (item.lessonId) {
              itemQuery = itemQuery.eq('lesson_id', item.lessonId)
            } else if (item.chapterId) {
              itemQuery = itemQuery.eq('chapter_id', item.chapterId)
            } else if (item.classId) {
              itemQuery = itemQuery.eq('class_id', item.classId)
            } else if (itemBlock) {
              const orClauses = [`grade_block.eq.${itemBlock}`]
              if (itClassIds.length > 0) orClauses.push(`class_id.in.(${itClassIds.join(',')})`)
              if (itChapterIds.length > 0) orClauses.push(`chapter_id.in.(${itChapterIds.join(',')})`)
              itemQuery = itemQuery.or(orClauses.join(','))
            }

            const { data: itemCandidates, error: itemCandErr } = await itemQuery
            if (itemCandErr) return errorResponse(itemCandErr.message, 500)

            const pool = (itemCandidates || []).filter(q => !pickedIdsSet.has(q.id))
            const mcPool = pool.filter(q => q.question_type === 'MULTIPLE_CHOICE')
            const tfPool = pool.filter(q => q.question_type === 'TRUE_FALSE')
            const saPool = pool.filter(q => q.question_type === 'SHORT_ANSWER')

            const mcCount = Number(item.mcCount) || 0
            const tfCount = Number(item.tfCount) || 0
            const saCount = Number(item.saCount) || 0

            if (mcPool.length < mcCount) {
              return errorResponse(`Không đủ câu Trắc nghiệm cho ${item.title || 'phân mục đã chọn'} (cần ${mcCount} câu, hiện có ${mcPool.length} câu)`, 400)
            }
            if (tfPool.length < tfCount) {
              return errorResponse(`Không đủ câu Đúng/Sai cho ${item.title || 'phân mục đã chọn'} (cần ${tfCount} câu, hiện có ${tfPool.length} câu)`, 400)
            }
            if (saPool.length < saCount) {
              return errorResponse(`Không đủ câu Trả lời ngắn cho ${item.title || 'phân mục đã chọn'} (cần ${saCount} câu, hiện có ${saPool.length} câu)`, 400)
            }

            const pMC = pickRandomWeighted(mcPool, mcCount)
            pMC.forEach(q => pickedIdsSet.add(q.id))
            const pTF = pickRandomWeighted(tfPool, tfCount)
            pTF.forEach(q => pickedIdsSet.add(q.id))
            const pSA = pickRandomWeighted(saPool, saCount)
            pSA.forEach(q => pickedIdsSet.add(q.id))

            combinedQuestions.push(...pMC, ...pTF, ...pSA)
          }
        } else {
          // Kịch bản B: Bốc theo Scope tổng (toàn Khối, toàn Lớp, toàn Chương, hoặc 1 Bài)
          const { classIds: scClassIds, chapterIds: scChapterIds } = await getScopeTargetIds(serviceRoleClient, gradeBlock)
          let candidateQuery = serviceRoleClient.from('question_bank').select('*')

          if (scopeType === 'LESSON' && lessonId) {
            candidateQuery = candidateQuery.eq('lesson_id', lessonId)
          } else if (scopeType === 'CHAPTER' && chapterId) {
            candidateQuery = candidateQuery.eq('chapter_id', chapterId)
          } else if (scopeType === 'CLASS' && classId) {
            candidateQuery = candidateQuery.eq('class_id', classId)
          } else if (lessonId) {
            candidateQuery = candidateQuery.eq('lesson_id', lessonId)
          } else if (chapterId) {
            candidateQuery = candidateQuery.eq('chapter_id', chapterId)
          } else if (classId) {
            candidateQuery = candidateQuery.eq('class_id', classId)
          } else if (gradeBlock) {
            const orClauses = [`grade_block.eq.${gradeBlock}`]
            if (scClassIds.length > 0) orClauses.push(`class_id.in.(${scClassIds.join(',')})`)
            if (scChapterIds.length > 0) orClauses.push(`chapter_id.in.(${scChapterIds.join(',')})`)
            candidateQuery = candidateQuery.or(orClauses.join(','))
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
            return errorResponse(`Không đủ câu hỏi Trắc nghiệm ABCD trong phạm vi đã chọn (cần ${mcRequested} câu, hiện có ${mcPool.length} câu)`, 400)
          }
          if (tfPool.length < tfRequested) {
            return errorResponse(`Không đủ câu hỏi Đúng/Sai trong phạm vi đã chọn (cần ${tfRequested} câu, hiện có ${tfPool.length} câu)`, 400)
          }
          if (saPool.length < saRequested) {
            return errorResponse(`Không đủ câu hỏi Trả lời ngắn trong phạm vi đã chọn (cần ${saRequested} câu, hiện có ${saPool.length} câu)`, 400)
          }

          const pickedMC = pickRandomWeighted(mcPool, mcRequested)
          const pickedTF = pickRandomWeighted(tfPool, tfRequested)
          const pickedSA = pickRandomWeighted(saPool, saRequested)

          combinedQuestions = [...pickedMC, ...pickedTF, ...pickedSA]
        }

        // Sắp xếp lại câu hỏi theo thứ tự chuẩn thi tốt nghiệp: Trắc nghiệm (Part I) -> Đúng/Sai (Part II) -> Trả lời ngắn (Part III)
        const orderedQuestions = [
          ...combinedQuestions.filter(q => q.question_type === 'MULTIPLE_CHOICE'),
          ...combinedQuestions.filter(q => q.question_type === 'TRUE_FALSE'),
          ...combinedQuestions.filter(q => q.question_type === 'SHORT_ANSWER')
        ]

        // Nếu chỉ là Preview để kiểm tra câu hỏi trước khi chốt
        if (previewOnly) {
          return jsonResponse({
            previewQuestions: orderedQuestions,
            summary: {
              mcPicked: orderedQuestions.filter(q => q.question_type === 'MULTIPLE_CHOICE').length,
              tfPicked: orderedQuestions.filter(q => q.question_type === 'TRUE_FALSE').length,
              saPicked: orderedQuestions.filter(q => q.question_type === 'SHORT_ANSWER').length,
              total: orderedQuestions.length
            }
          })
        }

        // Tạo bài tập chính thức trong bảng homeworks
        const finalMaxAttempts = type === 'EXAM' ? 1 : 3
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
            max_attempts: finalMaxAttempts,
            deadline: deadline || null,
            max_violations: maxViolations || 3,
            show_solutions: showSolutions !== false
          })
          .select('id')
          .single()

        if (hwCreateError) return errorResponse(hwCreateError.message, 500)
        const homeworkId = newHw.id

        // Tạo các câu hỏi và đáp án cho bài tập mới
        const questionsToInsert: any[] = []
        const answersToInsert: any[] = []

        orderedQuestions.forEach((qbQ, idx) => {
          const qNum = idx + 1
          const questionId = crypto.randomUUID()
          const parsedPrompt = normalizeBankPromptPayload(qbQ.prompt)

          let partTitle = ''
          if (qbQ.question_type === 'MULTIPLE_CHOICE') partTitle = 'Phần I: Câu hỏi trắc nghiệm nhiều phương án lựa chọn'
          else if (qbQ.question_type === 'TRUE_FALSE') partTitle = 'Phần II: Câu hỏi trắc nghiệm đúng sai'
          else if (qbQ.question_type === 'SHORT_ANSWER') partTitle = 'Phần III: Câu hỏi trắc nghiệm trả lời ngắn'

          questionsToInsert.push({
            id: questionId,
            homework_id: homeworkId,
            question_number: qNum,
            question_type: qbQ.question_type,
            prompt: qbQ.prompt,
            content: parsedPrompt.text || '',
            options: parsedPrompt.options || null,
            statements: parsedPrompt.statements || null,
            part_title: parsedPrompt.partTitle || partTitle,
            points: qbQ.points || (qbQ.question_type === 'TRUE_FALSE' ? 1.0 : (qbQ.question_type === 'SHORT_ANSWER' ? 0.5 : 0.25))
          })

          answersToInsert.push({
            question_id: questionId,
            mc_answer: qbQ.mc_answer || null,
            tf_answers: qbQ.tf_answers || null,
            sa_answer: qbQ.sa_answer !== undefined && qbQ.sa_answer !== null ? String(qbQ.sa_answer) : null,
            sa_tolerance: qbQ.sa_tolerance || 0,
            explanation: parsedPrompt.explanation || null
          })
        })

        const { error: qInsertErr } = await serviceRoleClient.from('questions').insert(questionsToInsert)
        if (qInsertErr) {
          await serviceRoleClient.from('homeworks').delete().eq('id', homeworkId)
          return errorResponse(qInsertErr.message, 500)
        }

        const { error: aInsertErr } = await serviceRoleClient.from('question_answers').insert(answersToInsert)
        if (aInsertErr) {
          await serviceRoleClient.from('homeworks').delete().eq('id', homeworkId)
          return errorResponse(aInsertErr.message, 500)
        }

        // Tăng usage_count cho các câu hỏi được chọn
        const pickedIds = orderedQuestions.map(q => q.id)
        for (const qId of pickedIds) {
          const curQ = orderedQuestions.find(q => q.id === qId)
          const curCount = (curQ?.usage_count || 0) + 1
          await serviceRoleClient.from('question_bank').update({ usage_count: curCount }).eq('id', qId)
        }

        return jsonResponse({
          success: true,
          homeworkId,
          totalQuestions: orderedQuestions.length,
          message: `Đã tạo thành công đề thi "${title}" với ${orderedQuestions.length} câu hỏi ngẫu nhiên từ ngân hàng!`
        })
      }

      // ----------------------------------------------------
      // Action 4: Đổi (Swap / Re-roll) 1 câu hỏi trong Preview
      // ----------------------------------------------------
      if (action === 'swap-question') {
        const {
          currentQuestionId,
          excludeIds = [],
          questionType,
          scopeType = 'BLOCK',
          gradeBlock = null,
          classId = null,
          chapterId = null,
          lessonId = null
        } = body

        const { classIds: swClassIds, chapterIds: swChapterIds } = await getScopeTargetIds(serviceRoleClient, gradeBlock)
        let query = serviceRoleClient
          .from('question_bank')
          .select('*')
          .eq('question_type', questionType)

        if (scopeType === 'LESSON' && lessonId) {
          query = query.eq('lesson_id', lessonId)
        } else if (scopeType === 'CHAPTER' && chapterId) {
          query = query.eq('chapter_id', chapterId)
        } else if (scopeType === 'CLASS' && classId) {
          query = query.eq('class_id', classId)
        } else if (lessonId) {
          query = query.eq('lesson_id', lessonId)
        } else if (chapterId) {
          query = query.eq('chapter_id', chapterId)
        } else if (classId) {
          query = query.eq('class_id', classId)
        } else if (gradeBlock) {
          const orClauses = [`grade_block.eq.${gradeBlock}`]
          if (swClassIds.length > 0) orClauses.push(`class_id.in.(${swClassIds.join(',')})`)
          if (swChapterIds.length > 0) orClauses.push(`chapter_id.in.(${swChapterIds.join(',')})`)
          query = query.or(orClauses.join(','))
        }

        const { data: candidates, error: swapErr } = await query
        if (swapErr) return errorResponse(swapErr.message, 500)

        const allExclude = new Set([...(excludeIds || []), currentQuestionId])
        const availablePool = (candidates || []).filter(q => !allExclude.has(q.id))

        if (availablePool.length === 0) {
          return errorResponse('Không còn câu hỏi thay thế nào khác phù hợp trong ngân hàng!', 404)
        }

        // Chọn ngẫu nhiên có trọng số
        const sorted = [...availablePool].sort((a, b) => {
          const weightA = (a.usage_count || 0) + Math.random() * 0.8
          const weightB = (b.usage_count || 0) + Math.random() * 0.8
          return weightA - weightB
        })

        const replacement = sorted[0]
        return jsonResponse({
          success: true,
          replacement
        })
      }

      // ----------------------------------------------------
      // Action 5: Tạo bài tập từ danh sách câu hỏi cụ thể đã chọn
      // ----------------------------------------------------
      if (action === 'create-from-selected') {
        const {
          targetLessonId,
          title,
          durationMinutes = 60,
          passScore = 5.0,
          maxScore = 10.0,
          type = 'PRACTICE',
          deadline = null,
          maxViolations = 3,
          showSolutions = true,
          questionBankIds = []
        } = body

        if (!targetLessonId || !title || !Array.isArray(questionBankIds) || questionBankIds.length === 0) {
          return errorResponse('Thiếu thông tin bài tập hoặc danh sách câu hỏi!', 400)
        }

        const { data: qbQuestions, error: fetchErr } = await serviceRoleClient
          .from('question_bank')
          .select('*')
          .in('id', questionBankIds)

        if (fetchErr) return errorResponse(fetchErr.message, 500)
        if (!qbQuestions || qbQuestions.length === 0) {
          return errorResponse('Không tìm thấy các câu hỏi đã chọn trong ngân hàng!', 404)
        }

        // Sắp xếp lại theo đúng thứ tự mảng questionBankIds truyền vào
        const qbMap = new Map(qbQuestions.map(q => [q.id, q]))
        const orderedQuestions = questionBankIds.map(id => qbMap.get(id)).filter(Boolean)

        const finalMaxAttempts = type === 'EXAM' ? 1 : 3
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
            max_attempts: finalMaxAttempts,
            deadline: deadline || null,
            max_violations: maxViolations || 3,
            show_solutions: showSolutions !== false
          })
          .select('id')
          .single()

        if (hwCreateError) return errorResponse(hwCreateError.message, 500)
        const homeworkId = newHw.id

        const questionsToInsert: any[] = []
        const answersToInsert: any[] = []

        orderedQuestions.forEach((qbQ, idx) => {
          const qNum = idx + 1
          const questionId = crypto.randomUUID()
          const parsedPrompt = normalizeBankPromptPayload(qbQ.prompt)

          let partTitle = ''
          if (qbQ.question_type === 'MULTIPLE_CHOICE') partTitle = 'Phần I: Câu hỏi trắc nghiệm nhiều phương án lựa chọn'
          else if (qbQ.question_type === 'TRUE_FALSE') partTitle = 'Phần II: Câu hỏi trắc nghiệm đúng sai'
          else if (qbQ.question_type === 'SHORT_ANSWER') partTitle = 'Phần III: Câu hỏi trắc nghiệm trả lời ngắn'

          questionsToInsert.push({
            id: questionId,
            homework_id: homeworkId,
            question_number: qNum,
            question_type: qbQ.question_type,
            prompt: qbQ.prompt,
            content: parsedPrompt.text || '',
            options: parsedPrompt.options || null,
            statements: parsedPrompt.statements || null,
            part_title: parsedPrompt.partTitle || partTitle,
            points: qbQ.points || (qbQ.question_type === 'TRUE_FALSE' ? 1.0 : (qbQ.question_type === 'SHORT_ANSWER' ? 0.5 : 0.25))
          })

          answersToInsert.push({
            question_id: questionId,
            mc_answer: qbQ.mc_answer || null,
            tf_answers: qbQ.tf_answers || null,
            sa_answer: qbQ.sa_answer !== undefined && qbQ.sa_answer !== null ? String(qbQ.sa_answer) : null,
            sa_tolerance: qbQ.sa_tolerance || 0,
            explanation: parsedPrompt.explanation || null
          })
        })

        const { error: qInsertErr } = await serviceRoleClient.from('questions').insert(questionsToInsert)
        if (qInsertErr) {
          await serviceRoleClient.from('homeworks').delete().eq('id', homeworkId)
          return errorResponse(qInsertErr.message, 500)
        }

        const { error: aInsertErr } = await serviceRoleClient.from('question_answers').insert(answersToInsert)
        if (aInsertErr) {
          await serviceRoleClient.from('homeworks').delete().eq('id', homeworkId)
          return errorResponse(aInsertErr.message, 500)
        }

        // Tăng usage_count
        for (const qbQ of orderedQuestions) {
          const curCount = (qbQ.usage_count || 0) + 1
          await serviceRoleClient.from('question_bank').update({ usage_count: curCount }).eq('id', qbQ.id)
        }

        return jsonResponse({
          success: true,
          homeworkId,
          totalQuestions: orderedQuestions.length,
          message: `Đã tạo thành công đề thi "${title}" với ${orderedQuestions.length} câu hỏi đã chọn!`
        })
      }

      // ----------------------------------------------------
      // Action 6: Thêm một câu hỏi đơn lẻ
      // ----------------------------------------------------
      const {
        subject = 'TOAN',
        gradeLevel = 12,
        gradeBlock = '12-Toán',
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
          grade_block: gradeBlock || '12-Toán',
          class_id: classId,
          chapter_id: chapterId,
          lesson_id: lessonId,
          question_type: questionType,
          difficulty,
          prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
          mc_answer: mcAnswer,
          tf_answers: tfAnswers,
          sa_answer: saAnswer !== null && saAnswer !== undefined ? String(saAnswer) : null,
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

      if (updates.prompt) {
        const normalized = normalizeBankPromptPayload(updates.prompt)
        updates.prompt = JSON.stringify(normalized)
      }
      if (updates.sa_answer !== undefined && updates.sa_answer !== null) {
        updates.sa_answer = String(updates.sa_answer)
      }

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

  } catch (err: any) {
    const isAuthErr = err.message?.includes('Authorization') || err.message?.includes('Unauthorized') || err.message?.includes('token')
    const statusCode = isAuthErr ? 401 : 500
    return errorResponse(err.message || 'Lỗi xử lý ngân hàng câu hỏi', statusCode)
  }
})
