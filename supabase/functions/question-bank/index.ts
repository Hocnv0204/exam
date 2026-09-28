import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin, requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

async function getScopeTargetIds(
  serviceRoleClient: any,
  gradeBlock?: string | null,
  scopeCache?: Map<string, { classIds: string[]; chapterIds: string[] }>
): Promise<{ classIds: string[]; chapterIds: string[] }> {
  if (!gradeBlock) return { classIds: [], chapterIds: [] }
  if (scopeCache && scopeCache.has(gradeBlock)) {
    return scopeCache.get(gradeBlock)!
  }

  const { data: matchedClasses } = await serviceRoleClient
    .from('classes')
    .select('id, chapters (id)')
    .eq('grade_block', gradeBlock)

  const classIds: string[] = []
  const chapterIds: string[] = []

  if (matchedClasses) {
    for (const c of matchedClasses) {
      classIds.push(c.id)
      if (Array.isArray(c.chapters)) {
        for (const ch of c.chapters) {
          chapterIds.push(ch.id)
        }
      }
    }
  }

  const result = { classIds, chapterIds }
  if (scopeCache) {
    scopeCache.set(gradeBlock, result)
  }
  return result
}

async function bumpQuestionUsage(
  serviceRoleClient: any, 
  ids: string[], 
  classId: string | null = null, 
  homeworkId: string | null = null
): Promise<void> {
  if (!ids || ids.length === 0) return
  const { error } = await serviceRoleClient.rpc('fn_bump_qb_usage_with_log', {
    p_question_ids: ids,
    p_class_id: classId,
    p_homework_id: homeworkId
  })
  if (error) {
    console.warn('[bumpQuestionUsage with log fallback]', error.message)
    const { error: oldRpcErr } = await serviceRoleClient.rpc('fn_bump_qb_usage', { p_ids: ids })
    if (oldRpcErr) {
      console.warn('[bumpQuestionUsage RPC fallback]', oldRpcErr.message)
    }
  }
}

async function unbumpQuestionUsage(
  serviceRoleClient: any, 
  ids: string[], 
  homeworkId: string | null = null
): Promise<void> {
  if (!ids || ids.length === 0) return
  const { error } = await serviceRoleClient.rpc('fn_unbump_qb_usage_with_log', {
    p_question_ids: ids,
    p_homework_id: homeworkId
  })
  if (error) {
    console.warn('[unbumpQuestionUsage fallback]', error.message)
    const { error: oldRpcErr } = await serviceRoleClient.rpc('fn_unbump_qb_usage', { p_ids: ids })
    if (oldRpcErr) {
      console.warn('[unbumpQuestionUsage old RPC fallback]', oldRpcErr.message)
    }
  }
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

interface ScopeTarget {
  gradeBlock?: string | null
  classIds: string[]
  chapterIds: string[]
  lessonIds: string[]
  tags?: string[]
}

function normalizeScopeInput(input: any): ScopeTarget {
  if (!input) return { gradeBlock: null, classIds: [], chapterIds: [], lessonIds: [], tags: [] }

  const tags: string[] = []
  const rawTags = input.scope?.tags || input.tags
  if (Array.isArray(rawTags)) tags.push(...rawTags.filter(Boolean))
  else if (typeof rawTags === 'string' && rawTags.trim()) {
    tags.push(...rawTags.split(',').map((t: string) => t.trim()).filter(Boolean))
  }

  if (input.scope && typeof input.scope === 'object') {
    return {
      gradeBlock: input.scope.gradeBlock || input.gradeBlock || null,
      classIds: Array.isArray(input.scope.classIds) ? input.scope.classIds.filter(Boolean) : (input.scope.classId ? [input.scope.classId] : []),
      chapterIds: Array.isArray(input.scope.chapterIds) ? input.scope.chapterIds.filter(Boolean) : (input.scope.chapterId ? [input.scope.chapterId] : []),
      lessonIds: Array.isArray(input.scope.lessonIds) ? input.scope.lessonIds.filter(Boolean) : (input.scope.lessonId ? [input.scope.lessonId] : []),
      tags
    }
  }

  // Flat input (hỗ trợ cả legacy request)
  const classIds: string[] = []
  const chapterIds: string[] = []
  const lessonIds: string[] = []

  if (Array.isArray(input.classIds)) classIds.push(...input.classIds.filter(Boolean))
  else if (input.classId) classIds.push(input.classId)

  if (Array.isArray(input.chapterIds)) chapterIds.push(...input.chapterIds.filter(Boolean))
  else if (input.chapterId) chapterIds.push(input.chapterId)

  if (Array.isArray(input.lessonIds)) lessonIds.push(...input.lessonIds.filter(Boolean))
  else if (input.lessonId) lessonIds.push(input.lessonId)

  if (input.scopeType === 'LESSON' && input.lessonId && !lessonIds.includes(input.lessonId)) {
    lessonIds.push(input.lessonId)
  } else if (input.scopeType === 'CHAPTER' && input.chapterId && !chapterIds.includes(input.chapterId)) {
    chapterIds.push(input.chapterId)
  } else if (input.scopeType === 'CLASS' && input.classId && !classIds.includes(input.classId)) {
    classIds.push(input.classId)
  }

  return {
    gradeBlock: input.gradeBlock || null,
    classIds,
    chapterIds,
    lessonIds,
    tags
  }
}

async function fetchAllQueryRows(
  queryFactory: () => any,
  batchSize = 1000,
  maxRows = 100000
): Promise<{ data: any[] | null; error: any }> {
  let from = 0
  const allRows: any[] = []
  let hasMore = true

  while (hasMore) {
    const { data: batch, error } = await queryFactory().range(from, from + batchSize - 1)
    if (error) return { data: null, error }
    if (batch && batch.length > 0) {
      allRows.push(...batch)
      if (batch.length < batchSize || allRows.length >= maxRows) {
        hasMore = false
      } else {
        from += batchSize
      }
    } else {
      hasMore = false
    }
  }

  return { data: allRows, error: null }
}

async function buildPoolQuery(
  serviceRoleClient: any,
  scope: ScopeTarget,
  columns = '*',
  extraFilters?: {
    questionType?: string;
    difficulty?: string | null;
    chapterId?: string | null;
  }
): Promise<{ data: any[] | null; error: any }> {
  let expandedClassIds = scope.classIds || []
  let expandedChapterIds = scope.chapterIds || []
  if ((!scope.lessonIds || scope.lessonIds.length === 0) &&
      (!expandedChapterIds || expandedChapterIds.length === 0) &&
      (!expandedClassIds || expandedClassIds.length === 0) &&
      scope.gradeBlock) {
    const ids = await getScopeTargetIds(serviceRoleClient, scope.gradeBlock)
    expandedClassIds = ids.classIds
    expandedChapterIds = ids.chapterIds
  }

  const buildQueryInstance = () => {
    let query = serviceRoleClient.from('question_bank').select(columns)

    // Lọc theo chuyên đề / Tags (Phase 6.2 - GIN Index)
    if (scope.tags && scope.tags.length > 0) {
      query = query.contains('tags', scope.tags)
    }

    const orClauses: string[] = []
    if (scope.lessonIds && scope.lessonIds.length > 0) {
      orClauses.push(`lesson_id.in.(${scope.lessonIds.join(',')})`)
    }
    if (expandedChapterIds && expandedChapterIds.length > 0) {
      orClauses.push(`chapter_id.in.(${expandedChapterIds.join(',')})`)
    }
    if (expandedClassIds && expandedClassIds.length > 0) {
      orClauses.push(`class_id.in.(${expandedClassIds.join(',')})`)
    }

    if (orClauses.length > 0) {
      // Nguyên tắc phân tầng độc lập: Mỗi cấp chỉ lọc theo đúng cột của chính nó
      query = query.or(orClauses.join(','))
    } else if (scope.gradeBlock) {
      // Cấp Khối: lấy các câu thuộc grade_block hoặc các lớp/chương trong khối
      const blockClauses = [`grade_block.eq.${scope.gradeBlock}`]
      if (expandedClassIds.length > 0) blockClauses.push(`class_id.in.(${expandedClassIds.join(',')})`)
      if (expandedChapterIds.length > 0) blockClauses.push(`chapter_id.in.(${expandedChapterIds.join(',')})`)
      query = query.or(blockClauses.join(','))
    }

    if (extraFilters?.questionType) {
      query = query.eq('question_type', extraFilters.questionType)
    }
    if (extraFilters?.difficulty) {
      query = query.eq('difficulty', extraFilters.difficulty)
    }
    if (extraFilters?.chapterId) {
      query = query.eq('chapter_id', extraFilters.chapterId)
    }

    return query
  }

  return await fetchAllQueryRows(buildQueryInstance)
}

// Helper: Hoán vị mã đề (Phase 6.1)
function shuffleVariantQuestions(
  orderedQuestions: any[]
): {
  variantQuestions: any[];
  optionMaps: Record<number, Record<string, string>>;
} {
  const mcList = orderedQuestions.filter(q => q.question_type === 'MULTIPLE_CHOICE')
  const tfList = orderedQuestions.filter(q => q.question_type === 'TRUE_FALSE')
  const saList = orderedQuestions.filter(q => q.question_type === 'SHORT_ANSWER')

  const shuffleArray = <T>(arr: T[]): T[] => {
    const copy = [...arr]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = copy[i]
      copy[i] = copy[j]
      copy[j] = temp
    }
    return copy
  }

  const shuffledMC = shuffleArray(mcList)
  const shuffledTF = shuffleArray(tfList)
  const shuffledSA = shuffleArray(saList)

  const optionMaps: Record<number, Record<string, string>> = {}
  const letters = ['A', 'B', 'C', 'D']

  const processedMC = shuffledMC.map((qbQ, idx) => {
    const parsedPrompt = normalizeBankPromptPayload(qbQ.prompt)
    const options = parsedPrompt.options
    const oldAnswer = qbQ.mc_answer ? String(qbQ.mc_answer).toUpperCase() : null

    // Chặn đảo nếu no_shuffle_options hoặc có phương án "Cả A và B", "Tất cả đều đúng"
    const hasSpecialOption = Array.isArray(options) && options.some((opt: string) => 
      /cả\s+[a-d]\s+(và|đều)|tất cả|cả hai/i.test(opt)
    )

    if (qbQ.no_shuffle_options || hasSpecialOption || !Array.isArray(options) || options.length !== 4 || !oldAnswer) {
      return { qbQ, newPrompt: parsedPrompt, newAnswer: oldAnswer }
    }

    // Tạo hoán vị cho 4 phương án
    const indices = [0, 1, 2, 3]
    const shuffledIndices = shuffleArray(indices)
    const newOptions = shuffledIndices.map(i => options[i])

    // Tìm vị trí mới của đáp án cũ
    const oldAnsIdx = letters.indexOf(oldAnswer)
    const newAnsIdx = shuffledIndices.indexOf(oldAnsIdx)
    const newAnswer = newAnsIdx !== -1 ? letters[newAnsIdx] : oldAnswer

    // Lưu option map (A -> C, B -> A...)
    const mapForQ: Record<string, string> = {}
    letters.forEach((l, i) => {
      mapForQ[l] = letters[shuffledIndices[i]]
    })
    optionMaps[idx + 1] = mapForQ

    const newPrompt = {
      ...parsedPrompt,
      options: newOptions
    }

    return { qbQ, newPrompt, newAnswer }
  })

  // Ghép lại danh sách câu hỏi hoán vị
  const finalVariantQuestions = [
    ...processedMC.map(x => ({ ...x.qbQ, prompt: x.newPrompt, mc_answer: x.newAnswer })),
    ...shuffledTF,
    ...shuffledSA
  ]

  return { variantQuestions: finalVariantQuestions, optionMaps }
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
      const rawLessonIds = url.searchParams.get('lessonIds') || ''
      const filterLessonIds = rawLessonIds ? rawLessonIds.split(',').map(s => s.trim()).filter(Boolean) : (lessonId ? [lessonId] : [])
      const questionType = url.searchParams.get('questionType')
      const difficulty = url.searchParams.get('difficulty')
      const search = url.searchParams.get('search')
      const unassigned = url.searchParams.get('unassigned') // 'no_class' | 'no_chapter' | 'no_lesson'
      const statsOnly = url.searchParams.get('stats') === 'true'

      // Kiểm tra số lượng câu hỏi khả dụng theo phạm vi (Live availability check)
      if (action === 'check-availability') {
        const rawClassIds = url.searchParams.get('classIds') || url.searchParams.get('classId') || ''
        const rawChapterIds = url.searchParams.get('chapterIds') || url.searchParams.get('chapterId') || ''
        const rawLessonIds = url.searchParams.get('lessonIds') || url.searchParams.get('lessonId') || ''

        const scope = normalizeScopeInput({
          scopeType: url.searchParams.get('scopeType') || 'BLOCK',
          gradeBlock: url.searchParams.get('gradeBlock'),
          classIds: rawClassIds ? rawClassIds.split(',').map(s => s.trim()).filter(Boolean) : [],
          chapterIds: rawChapterIds ? rawChapterIds.split(',').map(s => s.trim()).filter(Boolean) : [],
          lessonIds: rawLessonIds ? rawLessonIds.split(',').map(s => s.trim()).filter(Boolean) : []
        })

        const { data: rows, error: availErr } = await buildPoolQuery(
          serviceRoleClient,
          scope,
          'id, question_type, difficulty, grade_block, class_id, chapter_id, lesson_id'
        )
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

        const diffCounts = {
          NHAN_BIET: all.filter(q => q.difficulty === 'NHAN_BIET').length,
          THONG_HIEU: all.filter(q => q.difficulty === 'THONG_HIEU').length,
          VAN_DUNG: all.filter(q => q.difficulty === 'VAN_DUNG').length,
          VAN_DUNG_CAO: all.filter(q => q.difficulty === 'VAN_DUNG_CAO').length
        }

        const byTypeAndDifficulty = {
          MULTIPLE_CHOICE: {
            NHAN_BIET: all.filter(q => q.question_type === 'MULTIPLE_CHOICE' && q.difficulty === 'NHAN_BIET').length,
            THONG_HIEU: all.filter(q => q.question_type === 'MULTIPLE_CHOICE' && q.difficulty === 'THONG_HIEU').length,
            VAN_DUNG: all.filter(q => q.question_type === 'MULTIPLE_CHOICE' && q.difficulty === 'VAN_DUNG').length,
            VAN_DUNG_CAO: all.filter(q => q.question_type === 'MULTIPLE_CHOICE' && q.difficulty === 'VAN_DUNG_CAO').length
          },
          TRUE_FALSE: {
            NHAN_BIET: all.filter(q => q.question_type === 'TRUE_FALSE' && q.difficulty === 'NHAN_BIET').length,
            THONG_HIEU: all.filter(q => q.question_type === 'TRUE_FALSE' && q.difficulty === 'THONG_HIEU').length,
            VAN_DUNG: all.filter(q => q.question_type === 'TRUE_FALSE' && q.difficulty === 'VAN_DUNG').length,
            VAN_DUNG_CAO: all.filter(q => q.question_type === 'TRUE_FALSE' && q.difficulty === 'VAN_DUNG_CAO').length
          },
          SHORT_ANSWER: {
            NHAN_BIET: all.filter(q => q.question_type === 'SHORT_ANSWER' && q.difficulty === 'NHAN_BIET').length,
            THONG_HIEU: all.filter(q => q.question_type === 'SHORT_ANSWER' && q.difficulty === 'THONG_HIEU').length,
            VAN_DUNG: all.filter(q => q.question_type === 'SHORT_ANSWER' && q.difficulty === 'VAN_DUNG').length,
            VAN_DUNG_CAO: all.filter(q => q.question_type === 'SHORT_ANSWER' && q.difficulty === 'VAN_DUNG_CAO').length
          }
        }

        return jsonResponse({
          total: all.length,
          mc,
          tf,
          sa,
          byTypeAndDifficulty,
          byDifficulty: diffCounts,
          byChapter,
          byLesson
        })
      }

      // Nếu chỉ yêu cầu thống kê chung
      if (statsOnly) {
        let stClassIds: string[] = []
        let stChapterIds: string[] = []
        if (gradeBlock && filterLessonIds.length === 0 && !chapterId && !classId) {
          const ids = await getScopeTargetIds(serviceRoleClient, gradeBlock)
          stClassIds = ids.classIds
          stChapterIds = ids.chapterIds
        }

        const statsQueryFactory = () => {
          let baseQuery = serviceRoleClient.from('question_bank').select('id, question_type, difficulty')
          if (subject) baseQuery = baseQuery.eq('subject', subject)
          if (gradeLevel) baseQuery = baseQuery.eq('grade_level', parseInt(gradeLevel, 10))

          if (unassigned === 'no_class') {
            baseQuery = baseQuery.is('class_id', null)
          } else if (unassigned === 'no_chapter') {
            baseQuery = baseQuery.is('chapter_id', null)
          } else if (unassigned === 'no_lesson') {
            baseQuery = baseQuery.is('lesson_id', null)
          }

          if (filterLessonIds.length > 0) {
            baseQuery = baseQuery.in('lesson_id', filterLessonIds)
          } else if (chapterId) {
            baseQuery = baseQuery.eq('chapter_id', chapterId)
          } else if (classId) {
            baseQuery = baseQuery.eq('class_id', classId)
          } else if (gradeBlock) {
            const orClauses = [`grade_block.eq.${gradeBlock}`]
            if (stClassIds.length > 0) orClauses.push(`class_id.in.(${stClassIds.join(',')})`)
            if (stChapterIds.length > 0) orClauses.push(`chapter_id.in.(${stChapterIds.join(',')})`)
            baseQuery = baseQuery.or(orClauses.join(','))
          }

          return baseQuery
        }

        const { data: qData, error: qErr } = await fetchAllQueryRows(statsQueryFactory)
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
      if (gradeBlock && filterLessonIds.length === 0 && !chapterId && !classId) {
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

      if (unassigned === 'no_class') {
        query = query.is('class_id', null)
      } else if (unassigned === 'no_chapter') {
        query = query.is('chapter_id', null)
      } else if (unassigned === 'no_lesson') {
        query = query.is('lesson_id', null)
      }

      if (filterLessonIds.length > 0) {
        query = query.in('lesson_id', filterLessonIds)
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
      let statsPromise = Promise.resolve<{ data: any[] | null; error: any }>({ data: null, error: null })
      if (includeStats) {
        const statsQueryFactory = () => {
          let statsQuery = serviceRoleClient
            .from('question_bank')
            .select('id, question_type, difficulty')
          if (subject) statsQuery = statsQuery.eq('subject', subject)
          if (gradeLevel) statsQuery = statsQuery.eq('grade_level', parseInt(gradeLevel, 10))

          if (unassigned === 'no_class') {
            statsQuery = statsQuery.is('class_id', null)
          } else if (unassigned === 'no_chapter') {
            statsQuery = statsQuery.is('chapter_id', null)
          } else if (unassigned === 'no_lesson') {
            statsQuery = statsQuery.is('lesson_id', null)
          }

          if (filterLessonIds.length > 0) {
            statsQuery = statsQuery.in('lesson_id', filterLessonIds)
          } else if (lessonId) {
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
          return statsQuery
        }
        statsPromise = fetchAllQueryRows(statsQueryFactory)
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
            prompt: promptPayload,
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

        // Lấy danh sách grade_block của các bài tập đích để lọc phạm vi kiểm tra trùng
        const targetGradeBlocks = Array.from(new Set(
          Array.from(hwMap.values()).map((v: any) => v.gradeBlock).filter(Boolean)
        ))

        // Nếu bật deduplicate: Lấy danh sách prompt hiện có trong cùng khối để loại trừ (tránh kéo toàn bảng vào RAM)
        let existingPromptsSet = new Set<string>()
        if (deduplicate) {
          let from = 0
          const batchSize = 1000
          let hasMore = true
          while (hasMore) {
            let qbPromptQuery = serviceRoleClient
              .from('question_bank')
              .select('prompt')
              .range(from, from + batchSize - 1)
            if (targetGradeBlocks.length > 0) {
              qbPromptQuery = qbPromptQuery.in('grade_block', targetGradeBlocks)
            }
            const { data: existingRows } = await qbPromptQuery
            if (existingRows && existingRows.length > 0) {
              existingRows.forEach((r: any) => {
                try {
                  const norm = normalizeBankPromptPayload(r.prompt)
                  const rawText = typeof norm?.text === 'string' ? norm.text : (typeof r.prompt === 'string' ? r.prompt : '')
                  const text = rawText.trim().toLowerCase().replace(/\s+/g, ' ')
                  if (text) existingPromptsSet.add(text)
                } catch (_) {}
              })
              if (existingRows.length < batchSize) {
                hasMore = false
              } else {
                from += batchSize
              }
            } else {
              hasMore = false
            }
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
          const promptText = typeof promptPayload?.text === 'string'
            ? promptPayload.text
            : (typeof q.content === 'string' ? q.content : '')

          if (!promptText && (!promptPayload.options || promptPayload.options.length === 0)) {
            skippedCount++
            return
          }

          // Kiểm tra trùng lặp (chuẩn hóa toàn bộ chuỗi thay vì chỉ cắt 100 ký tự)
          const sampleKey = promptText.trim().toLowerCase().replace(/\s+/g, ' ')
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
            prompt: promptPayload,
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
      // Hỗ trợ Phase 3: byDifficulty, shortage borrow, balanced, sourceMix
      // ----------------------------------------------------
      if (action === 'generate-exam') {
        const scope = normalizeScopeInput(body)
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
          matrix = { mcCount: 12, tfCount: 4, saCount: 6 },
          shortage = 'error', // 'error' | 'borrow'
          balanced = false,   // true: chia đều chỉ tiêu cho các nhóm được chọn kèm Quỹ bù
          sourceMix = null,   // Record<string, number>: classId -> ratio
          distribution = null, // Optional per-chapter or per-lesson breakdown
          previewOnly = false
        } = body

        if (!previewOnly && (!targetLessonId || !title)) {
          return errorResponse('Vui lòng chọn bài học đích và nhập tiêu đề đề thi!', 400)
        }

        // Xác định classId mục tiêu để áp dụng trọng số thời gian và lịch sử theo lớp (Phase 5.2)
        let targetClassId = scope.classId || (scope.classIds && scope.classIds.length === 1 ? scope.classIds[0] : null)
        if (!targetClassId && targetLessonId) {
          const { data: lData } = await serviceRoleClient
            .from('lessons')
            .select('id, chapters(id, class_id)')
            .eq('id', targetLessonId)
            .single()
          targetClassId = (lData as any)?.chapters?.class_id || null
        }

        // Lấy lịch sử sử dụng theo lớp để tính trọng số phạt lặp lại gần đây (Phase 5.2)
        const classUsageMap = new Map<string, { count: number; lastUsed: Date }>()
        if (targetClassId) {
          const { data: usageLogs } = await serviceRoleClient
            .from('question_usage_log')
            .select('question_id, used_at')
            .eq('class_id', targetClassId)
          if (usageLogs && usageLogs.length > 0) {
            usageLogs.forEach((l: any) => {
              const existing = classUsageMap.get(l.question_id)
              const usedDate = new Date(l.used_at)
              if (!existing) {
                classUsageMap.set(l.question_id, { count: 1, lastUsed: usedDate })
              } else {
                existing.count += 1
                if (usedDate > existing.lastUsed) existing.lastUsed = usedDate
              }
            })
          }
        }

        // Thuật toán bốc ngẫu nhiên có trọng số đa nhân tố (Phase 5.2):
        // score(q) = W_class * uses_class + W_global * usage_count + W_time * recency_penalty + random * NOISE
        const now = Date.now()
        const NOISE = 0.8
        const pickRandomWeighted = (pool: any[], count: number) => {
          if (count <= 0) return []
          return pool
            .map(q => {
              const globalUses = q.usage_count || 0
              const classInfo = classUsageMap.get(q.id)
              let classUses = 0
              let recencyPenalty = 0

              if (classInfo) {
                classUses = classInfo.count
                const daysAgo = (now - classInfo.lastUsed.getTime()) / (1000 * 60 * 60 * 24)
                if (daysAgo < 7) {
                  recencyPenalty = 10.0 // Phạt nặng nếu câu vừa dùng trong vòng 7 ngày cho lớp này
                } else if (daysAgo < 30) {
                  recencyPenalty = 5.0  // Phạt vừa nếu dùng trong 30 ngày qua
                }
              }

              const sortKey = (3.0 * classUses) + (1.0 * globalUses) + recencyPenalty + (Math.random() * NOISE)
              return { q, sortKey }
            })
            .sort((a, b) => a.sortKey - b.sortKey)
            .slice(0, count)
            .map(x => x.q)
        }

        // Helper: Phân bổ Largest Remainder Method cho sourceMix
        const allocateLargestRemainder = (total: number, weights: Record<string, number>): Record<string, number> => {
          const keys = Object.keys(weights).filter(k => (Number(weights[k]) || 0) > 0)
          if (keys.length === 0 || total <= 0) return {}
          const sumWeights = keys.reduce((s, k) => s + Number(weights[k]), 0)
          const normWeights: Record<string, number> = {}
          keys.forEach(k => { normWeights[k] = Number(weights[k]) / sumWeights })

          const result: Record<string, number> = {}
          const remainders: { key: string; remainder: number }[] = []
          let assignedTotal = 0

          keys.forEach(k => {
            const exact = total * normWeights[k]
            const floorVal = Math.floor(exact)
            result[k] = floorVal
            assignedTotal += floorVal
            remainders.push({ key: k, remainder: exact - floorVal })
          })

          remainders.sort((a, b) => b.remainder - a.remainder)
          let slotsLeft = total - assignedTotal
          let idx = 0
          while (slotsLeft > 0 && idx < remainders.length) {
            result[remainders[idx].key]++
            slotsLeft--
            idx++
          }

          return result
        }

        // Helper: Phân bổ đều cho M nhóm (balanced)
        const allocateBalanced = (total: number, count: number): number[] => {
          if (count <= 0) return []
          const base = Math.floor(total / count)
          const rem = total % count
          const quotas: number[] = []
          for (let i = 0; i < count; i++) {
            quotas.push(i < rem ? base + 1 : base)
          }
          return quotas
        }

        // Helper: Chuẩn hóa cấu hình ma trận cho từng dạng câu hỏi
        const parseTypeConfig = (raw: any, fallbackCount: number) => {
          if (raw && typeof raw === 'object' && (raw.byDifficulty || raw.total !== undefined)) {
            const byDiff = raw.byDifficulty || null
            let total = Number(raw.total) || 0
            if (byDiff && !total) {
              total = (Number(byDiff.NHAN_BIET) || 0) + (Number(byDiff.THONG_HIEU) || 0) + (Number(byDiff.VAN_DUNG) || 0) + (Number(byDiff.VAN_DUNG_CAO) || 0)
            }
            return { total, byDifficulty: byDiff }
          }
          const val = typeof raw === 'number' ? raw : (Number(raw) || fallbackCount)
          return { total: val, byDifficulty: null }
        }

        // Helper: Bốc câu hỏi theo Ma trận độ khó & cơ chế mượn bù (borrow)
        const pickTypeByDifficulty = (
          qType: string,
          pool: any[],
          typeConfig: { total: number; byDifficulty?: Record<string, number> | null },
          shortageMode: 'error' | 'borrow',
          pickedIdsSet: Set<string>
        ): { picked: any[]; borrowAlerts: any[] } => {
          const typeLabels: Record<string, string> = {
            MULTIPLE_CHOICE: 'Trắc nghiệm ABCD',
            TRUE_FALSE: 'Đúng / Sai',
            SHORT_ANSWER: 'Trả lời ngắn'
          }
          const diffLabels: Record<string, string> = {
            NHAN_BIET: 'Nhận biết',
            THONG_HIEU: 'Thông hiểu',
            VAN_DUNG: 'Vận dụng',
            VAN_DUNG_CAO: 'Vận dụng cao'
          }

          const picked: any[] = []
          const borrowAlerts: any[] = []
          const availablePool = pool.filter(q => q.question_type === qType && !pickedIdsSet.has(q.id))

          // Nếu không cấu hình chi tiết byDifficulty, bốc theo tổng số lượng
          if (!typeConfig.byDifficulty) {
            const totalReq = typeConfig.total || 0
            if (availablePool.length < totalReq) {
              throw new Error(`Không đủ câu hỏi ${typeLabels[qType] || qType} trong phạm vi (cần ${totalReq} câu, hiện có ${availablePool.length} câu)`)
            }
            const p = pickRandomWeighted(availablePool, totalReq)
            p.forEach(q => { pickedIdsSet.add(q.id); picked.push(q) })
            return { picked, borrowAlerts }
          }

          // Có cấu hình chi tiết theo 4 mức độ nhận thức
          const diffOrder = ['VAN_DUNG_CAO', 'VAN_DUNG', 'THONG_HIEU', 'NHAN_BIET']
          const borrowSequence: Record<string, string[]> = {
            VAN_DUNG_CAO: ['VAN_DUNG', 'THONG_HIEU', 'NHAN_BIET'],
            VAN_DUNG: ['THONG_HIEU', 'NHAN_BIET', 'VAN_DUNG_CAO'],
            THONG_HIEU: ['NHAN_BIET', 'VAN_DUNG', 'VAN_DUNG_CAO'],
            NHAN_BIET: ['THONG_HIEU', 'VAN_DUNG', 'VAN_DUNG_CAO']
          }

          const pendingShortages: { diff: string; deficit: number }[] = []

          // Lượt 1: Bốc đúng mức độ
          for (const diff of diffOrder) {
            const req = Number(typeConfig.byDifficulty[diff] || 0)
            if (req <= 0) continue

            const exactPool = availablePool.filter(q => q.difficulty === diff && !pickedIdsSet.has(q.id))
            if (exactPool.length >= req) {
              const p = pickRandomWeighted(exactPool, req)
              p.forEach(q => { pickedIdsSet.add(q.id); picked.push(q) })
            } else {
              if (shortageMode === 'error') {
                throw new Error(`Không đủ câu hỏi mức độ ${diffLabels[diff] || diff} cho dạng ${typeLabels[qType] || qType} (cần ${req} câu, hiện có ${exactPool.length} câu)`)
              }
              // shortage === 'borrow'
              exactPool.forEach(q => { pickedIdsSet.add(q.id); picked.push(q) })
              pendingShortages.push({ diff, deficit: req - exactPool.length })
            }
          }

          // Lượt 2: Bù từ các mức độ liền kề (borrow)
          for (const item of pendingShortages) {
            let needed = item.deficit
            const fallbackLevels = borrowSequence[item.diff] || []

            for (const fbDiff of fallbackLevels) {
              if (needed <= 0) break
              const fbPool = availablePool.filter(q => q.difficulty === fbDiff && !pickedIdsSet.has(q.id))
              if (fbPool.length > 0) {
                const take = Math.min(needed, fbPool.length)
                const p = pickRandomWeighted(fbPool, take)
                p.forEach(q => { pickedIdsSet.add(q.id); picked.push(q) })
                borrowAlerts.push({
                  type: qType,
                  typeLabel: typeLabels[qType] || qType,
                  requestedDifficulty: item.diff,
                  requestedLabel: diffLabels[item.diff] || item.diff,
                  borrowedFrom: fbDiff,
                  borrowedLabel: diffLabels[fbDiff] || fbDiff,
                  count: take
                })
                needed -= take
              }
            }

            if (needed > 0) {
              throw new Error(`Kho câu hỏi không đủ đáp ứng dạng ${typeLabels[qType] || qType} ngay cả khi đã bù từ các mức độ khác (thiếu ${needed} câu)`)
            }
          }

          return { picked, borrowAlerts }
        }

        const mcConfig = parseTypeConfig(matrix.MULTIPLE_CHOICE ?? matrix.mcCount ?? matrix.mc, 12)
        const tfConfig = parseTypeConfig(matrix.TRUE_FALSE ?? matrix.tfCount ?? matrix.tf, 4)
        const saConfig = parseTypeConfig(matrix.SHORT_ANSWER ?? matrix.saCount ?? matrix.sa, 6)

        let combinedQuestions: any[] = []
        const allBorrowAlerts: any[] = []
        const pickedIdsSet = new Set<string>()

        try {
          // Kịch bản A: Có phân bổ chi tiết theo từng Chương hoặc từng Bài (distribution)
          if (Array.isArray(distribution) && distribution.length > 0) {
            const candidateResults = await Promise.all(
              distribution.map(async (item) => {
                const itemScope = normalizeScopeInput(item)
                if (!itemScope.gradeBlock && scope.gradeBlock) itemScope.gradeBlock = scope.gradeBlock
                const { data: itemCandidates, error: itemCandErr } = await buildPoolQuery(serviceRoleClient, itemScope)
                return { item, itemCandidates, itemCandErr }
              })
            )

            for (const res of candidateResults) {
              if (res.itemCandErr) return errorResponse(res.itemCandErr.message, 500)
              const item = res.item
              const pool = (res.itemCandidates || []).filter((q: any) => !pickedIdsSet.has(q.id))

              const itemMCConfig = parseTypeConfig(item.MULTIPLE_CHOICE ?? item.mcCount, 0)
              const itemTFConfig = parseTypeConfig(item.TRUE_FALSE ?? item.tfCount, 0)
              const itemSAConfig = parseTypeConfig(item.SHORT_ANSWER ?? item.saCount, 0)

              const resMC = pickTypeByDifficulty('MULTIPLE_CHOICE', pool, itemMCConfig, shortage, pickedIdsSet)
              const resTF = pickTypeByDifficulty('TRUE_FALSE', pool, itemTFConfig, shortage, pickedIdsSet)
              const resSA = pickTypeByDifficulty('SHORT_ANSWER', pool, itemSAConfig, shortage, pickedIdsSet)

              combinedQuestions.push(...resMC.picked, ...resTF.picked, ...resSA.picked)
              allBorrowAlerts.push(...resMC.borrowAlerts, ...resTF.borrowAlerts, ...resSA.borrowAlerts)
            }
          }
          // Kịch bản B: Tỷ lệ trộn nguồn (sourceMix) giữa các lớp
          else if (sourceMix && typeof sourceMix === 'object' && Object.keys(sourceMix).length > 0) {
            const CANDIDATE_COLS = 'id, question_type, difficulty, usage_count, chapter_id, lesson_id, class_id'
            const { data: candidates, error: candError } = await buildPoolQuery(serviceRoleClient, scope, CANDIDATE_COLS)
            if (candError) return errorResponse(candError.message, 500)
            const allCandidates = candidates || []

            const classQuotasMC = allocateLargestRemainder(mcConfig.total, sourceMix)
            const classQuotasTF = allocateLargestRemainder(tfConfig.total, sourceMix)
            const classQuotasSA = allocateLargestRemainder(saConfig.total, sourceMix)

            const pickForClassMix = (qType: string, classQuotas: Record<string, number>) => {
              let deficitPool = 0
              for (const [classId, quota] of Object.entries(classQuotas)) {
                if (quota <= 0) continue
                const classPool = allCandidates.filter(q => q.class_id === classId && q.question_type === qType && !pickedIdsSet.has(q.id))
                const take = Math.min(quota, classPool.length)
                const picked = pickRandomWeighted(classPool, take)
                picked.forEach(q => { pickedIdsSet.add(q.id); combinedQuestions.push(q) })
                if (take < quota) deficitPool += (quota - take)
              }
              // Bù từ các lớp khác nếu 1 lớp bị thiếu
              if (deficitPool > 0) {
                const remaining = allCandidates.filter(q => q.question_type === qType && !pickedIdsSet.has(q.id))
                if (remaining.length < deficitPool) {
                  throw new Error(`Không đủ câu hỏi ${qType} trong phạm vi kết hợp các lớp (thiếu ${deficitPool} câu)`)
                }
                const p = pickRandomWeighted(remaining, deficitPool)
                p.forEach(q => { pickedIdsSet.add(q.id); combinedQuestions.push(q) })
              }
            }

            pickForClassMix('MULTIPLE_CHOICE', classQuotasMC)
            pickForClassMix('TRUE_FALSE', classQuotasTF)
            pickForClassMix('SHORT_ANSWER', classQuotasSA)
          }
          // Kịch bản C: Phân bổ đều (balanced) cho các Chương/Bài đã chọn kèm Quỹ bù
          else if (balanced && ((scope.lessonIds && scope.lessonIds.length > 1) || (scope.chapterIds && scope.chapterIds.length > 1) || (scope.classIds && scope.classIds.length > 1))) {
            const CANDIDATE_COLS = 'id, question_type, difficulty, usage_count, chapter_id, lesson_id, class_id'
            const { data: candidates, error: candError } = await buildPoolQuery(serviceRoleClient, scope, CANDIDATE_COLS)
            if (candError) return errorResponse(candError.message, 500)
            const allCandidates = candidates || []

            const groups = (scope.lessonIds && scope.lessonIds.length > 1)
              ? { field: 'lesson_id', ids: scope.lessonIds }
              : ((scope.chapterIds && scope.chapterIds.length > 1)
                ? { field: 'chapter_id', ids: scope.chapterIds }
                : { field: 'class_id', ids: scope.classIds || [] })

            const pickBalancedType = (qType: string, typeConfig: any) => {
              if (typeConfig.total <= 0) return
              const quotas = allocateBalanced(typeConfig.total, groups.ids.length)
              let compensationPool = 0

              groups.ids.forEach((gid, i) => {
                const quota = quotas[i]
                const groupPool = allCandidates.filter(q => q[groups.field] === gid && q.question_type === qType && !pickedIdsSet.has(q.id))
                const take = Math.min(quota, groupPool.length)
                const picked = pickRandomWeighted(groupPool, take)
                picked.forEach(q => { pickedIdsSet.add(q.id); combinedQuestions.push(q) })
                if (take < quota) {
                  compensationPool += (quota - take)
                }
              })

              // Bù từ Quỹ bù (Compensation Pool) cho các nhóm còn dư câu
              if (compensationPool > 0) {
                const remainingPool = allCandidates.filter(q => q.question_type === qType && !pickedIdsSet.has(q.id))
                if (remainingPool.length < compensationPool) {
                  throw new Error(`Kho câu hỏi không đủ để bù chỉ tiêu phân bổ đều cho dạng ${qType} (thiếu ${compensationPool - remainingPool.length} câu)`)
                }
                const compPicked = pickRandomWeighted(remainingPool, compensationPool)
                compPicked.forEach(q => { pickedIdsSet.add(q.id); combinedQuestions.push(q) })
              }
            }

            pickBalancedType('MULTIPLE_CHOICE', mcConfig)
            pickBalancedType('TRUE_FALSE', tfConfig)
            pickBalancedType('SHORT_ANSWER', saConfig)
          }
          // Kịch bản D: Bốc theo Scope tổng với Ma trận nhận thức & cơ chế bù borrow
          else {
            const CANDIDATE_COLS = 'id, question_type, difficulty, usage_count, chapter_id, lesson_id, class_id'
            const { data: candidates, error: candError } = await buildPoolQuery(serviceRoleClient, scope, CANDIDATE_COLS)
            if (candError) return errorResponse(candError.message, 500)
            const allCandidates = candidates || []

            const resMC = pickTypeByDifficulty('MULTIPLE_CHOICE', allCandidates, mcConfig, shortage, pickedIdsSet)
            const resTF = pickTypeByDifficulty('TRUE_FALSE', allCandidates, tfConfig, shortage, pickedIdsSet)
            const resSA = pickTypeByDifficulty('SHORT_ANSWER', allCandidates, saConfig, shortage, pickedIdsSet)

            combinedQuestions.push(...resMC.picked, ...resTF.picked, ...resSA.picked)
            allBorrowAlerts.push(...resMC.borrowAlerts, ...resTF.borrowAlerts, ...resSA.borrowAlerts)
          }
        } catch (pickErr: any) {
          return errorResponse(pickErr.message || 'Lỗi khi bốc câu hỏi theo ma trận', 400)
        }

        // Sắp xếp lại câu hỏi theo thứ tự chuẩn: Trắc nghiệm (Part I) -> Đúng/Sai (Part II) -> Trả lời ngắn (Part III)
        let orderedQuestions = [
          ...combinedQuestions.filter(q => q.question_type === 'MULTIPLE_CHOICE'),
          ...combinedQuestions.filter(q => q.question_type === 'TRUE_FALSE'),
          ...combinedQuestions.filter(q => q.question_type === 'SHORT_ANSWER')
        ]

        // Tối ưu truy vấn 2 bước (Phase 6.3):
        // Bước 1 chỉ lấy metadata nhẹ để bốc câu. Bước 2 tải chi tiết prompt và options cho các câu trúng tuyển.
        const winningIds = orderedQuestions.map((q: any) => q.id)
        if (winningIds.length > 0) {
          const { data: fullQuestions, error: fullErr } = await serviceRoleClient
            .from('question_bank')
            .select('*')
            .in('id', winningIds)
          if (!fullErr && fullQuestions) {
            const fullMap = new Map(fullQuestions.map((q: any) => [q.id, q]))
            orderedQuestions = orderedQuestions.map(q => fullMap.get(q.id) || q)
          }
        }

        // Chặn nhánh bốc lại tự động: generate-exam chỉ hỗ trợ xem trước (Preview)
        if (!previewOnly) {
          return errorResponse('API generate-exam chỉ hỗ trợ chế độ xem trước (previewOnly: true). Vui lòng sử dụng action=create-from-selected với danh sách câu hỏi đã duyệt.', 400)
        }

        return jsonResponse({
          previewQuestions: orderedQuestions,
          summary: {
            mcPicked: orderedQuestions.filter(q => q.question_type === 'MULTIPLE_CHOICE').length,
            tfPicked: orderedQuestions.filter(q => q.question_type === 'TRUE_FALSE').length,
            saPicked: orderedQuestions.filter(q => q.question_type === 'SHORT_ANSWER').length,
            total: orderedQuestions.length
          },
          borrowAlerts: allBorrowAlerts
        })
      }

      // ----------------------------------------------------
      // Action 4: Đổi (Swap / Re-roll) 1 câu hỏi trong Preview hoặc trong Đề thi
      // Hỗ trợ Phase 4.1 & 4.2: sameDifficulty, sameChapter, top 3 candidates, khóa đề & đồng bộ bump/unbump
      // ----------------------------------------------------
      if (action === 'swap-question') {
        const {
          currentQuestionId,
          excludeIds = [],
          questionType,
          sameDifficulty = false,
          sameChapter = false,
          currentDifficulty = null,
          currentChapterId = null,
          candidateCount = 1,
          homeworkId = null
        } = body

        // Kiểm tra khóa đề (Phase 4.1): Nếu đã có học sinh nộp bài, chặn hoàn toàn thao tác đổi câu
        if (homeworkId) {
          const { count: subCount, error: countErr } = await serviceRoleClient
            .from('submissions')
            .select('*', { count: 'exact', head: true })
            .eq('homework_id', homeworkId)
          if (!countErr && (subCount || 0) > 0) {
            return errorResponse('Đề thi đã có học sinh nộp bài, không thể thay đổi hoặc đổi câu hỏi để bảo toàn điểm số!', 400)
          }
        }

        const scope = normalizeScopeInput(body)
        let { data: candidates, error: swapErr } = await buildPoolQuery(
          serviceRoleClient,
          scope,
          '*',
          {
            questionType,
            difficulty: (sameDifficulty && currentDifficulty) ? currentDifficulty : undefined,
            chapterId: (sameChapter && currentChapterId) ? currentChapterId : undefined
          }
        )
        if (swapErr) return errorResponse(swapErr.message, 500)

        const allExclude = new Set([...(excludeIds || []), currentQuestionId])
        let availablePool = (candidates || []).filter(q => !allExclude.has(q.id))

        // Nếu lọc cùng chương mà không còn câu nào, thử fallback sang các chương khác trong scope (vẫn giữ cùng mức độ nhận thức)
        if (availablePool.length === 0 && sameChapter && currentChapterId) {
          const { data: fallbackCandidates, error: fallbackErr } = await buildPoolQuery(
            serviceRoleClient,
            scope,
            '*',
            {
              questionType,
              difficulty: (sameDifficulty && currentDifficulty) ? currentDifficulty : undefined
            }
          )
          if (!fallbackErr && fallbackCandidates) {
            availablePool = fallbackCandidates.filter(q => !allExclude.has(q.id))
          }
        }

        if (availablePool.length === 0) {
          return errorResponse(
            (sameDifficulty || sameChapter)
              ? 'Không còn câu hỏi thay thế nào khác thỏa mãn điều kiện (cùng chương / cùng độ khó)!'
              : 'Không còn câu hỏi thay thế nào khác phù hợp trong ngân hàng!',
            404
          )
        }

        // Chọn ngẫu nhiên có trọng số
        const NOISE = 0.8
        const sorted = availablePool
          .map(q => ({ q, sortKey: (q.usage_count || 0) + Math.random() * NOISE }))
          .sort((a, b) => a.sortKey - b.sortKey)
          .map(x => x.q)

        const topCandidates = sorted.slice(0, Math.max(1, candidateCount))
        const replacement = topCandidates[0]

        // Nếu đổi câu trên đề thi đã xuất bản (Phase 4.1): unbump câu cũ và bump câu mới
        if (homeworkId && replacement) {
          const { data: hw } = await serviceRoleClient
            .from('homeworks')
            .select('id, is_published, lesson_id, lessons(id, chapters(id, class_id))')
            .eq('id', homeworkId)
            .single()

          if (hw?.is_published) {
            const hwClassId = (hw as any)?.lessons?.chapters?.class_id || null
            if (currentQuestionId) {
              await unbumpQuestionUsage(serviceRoleClient, [currentQuestionId], homeworkId)
            }
            await bumpQuestionUsage(serviceRoleClient, [replacement.id], hwClassId, homeworkId)
          }
        }

        return jsonResponse({
          success: true,
          replacement,
          candidates: topCandidates
        })
      }

      // ----------------------------------------------------
      // Action 5: Tạo bài tập từ danh sách câu hỏi cụ thể đã chọn
      // Hỗ trợ Phase 4.1 (Truy vết question_bank_id) & Phase 5 (Lịch sử sử dụng theo lớp)
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
          questionBankIds = [],
          variantCodes = []
        } = body

        if (!targetLessonId || !title || !Array.isArray(questionBankIds) || questionBankIds.length === 0) {
          return errorResponse('Thiếu thông tin bài tập hoặc danh sách câu hỏi!', 400)
        }

        // Kiểm tra bài học đích có tồn tại và lấy class_id của bài học
        const { data: lessonData, error: lessonErr } = await serviceRoleClient
          .from('lessons')
          .select('id, title, chapter_id, chapters(id, class_id)')
          .eq('id', targetLessonId)
          .single()
        if (lessonErr || !lessonData) {
          return errorResponse('Bài học đích không tồn tại hoặc đã bị xóa!', 400)
        }
        const targetClassId = (lessonData as any)?.chapters?.class_id || null

        const { data: qbQuestions, error: fetchErr } = await serviceRoleClient
          .from('question_bank')
          .select('*')
          .in('id', questionBankIds)

        if (fetchErr) return errorResponse(fetchErr.message, 500)
        if (!qbQuestions || qbQuestions.length === 0) {
          return errorResponse('Không tìm thấy các câu hỏi đã chọn trong ngân hàng!', 404)
        }

        // Sắp xếp lại theo đúng thứ tự mảng questionBankIds truyền vào và kiểm tra đủ câu
        const qbMap = new Map(qbQuestions.map(q => [q.id, q]))
        const orderedQuestions = questionBankIds.map(id => qbMap.get(id)).filter(Boolean)

        if (orderedQuestions.length !== questionBankIds.length) {
          return errorResponse('Một số câu hỏi được chọn không còn tồn tại trong ngân hàng!', 400)
        }

        const finalMaxAttempts = type === 'EXAM' ? 1 : 3

        // ========================================================
        // Kịch bản Hoán vị nhiều Mã đề (Phase 6.1)
        // ========================================================
        if (Array.isArray(variantCodes) && variantCodes.length > 0) {
          const createdVariants: { code: string; homeworkId: string; optionMaps: any }[] = []

          for (const vCode of variantCodes) {
            const vTitle = `${title} - Mã đề ${vCode}`
            const { variantQuestions, optionMaps } = shuffleVariantQuestions(orderedQuestions)

            const { data: vHw, error: vHwErr } = await serviceRoleClient
              .from('homeworks')
              .insert({
                lesson_id: targetLessonId,
                title: vTitle,
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

            if (vHwErr) return errorResponse(vHwErr.message, 500)
            const vHwId = vHw.id

            const vQuestionsToInsert: any[] = []
            const vAnswersToInsert: any[] = []

            variantQuestions.forEach((qbQ, idx) => {
              const qNum = idx + 1
              const questionId = crypto.randomUUID()
              const parsedPrompt = normalizeBankPromptPayload(qbQ.prompt)

              let partTitle = ''
              if (qbQ.question_type === 'MULTIPLE_CHOICE') partTitle = 'Phần I: Câu hỏi trắc nghiệm nhiều phương án lựa chọn'
              else if (qbQ.question_type === 'TRUE_FALSE') partTitle = 'Phần II: Câu hỏi trắc nghiệm đúng sai'
              else if (qbQ.question_type === 'SHORT_ANSWER') partTitle = 'Phần III: Câu hỏi trắc nghiệm trả lời ngắn'

              vQuestionsToInsert.push({
                id: questionId,
                homework_id: vHwId,
                question_bank_id: qbQ.id,
                question_number: qNum,
                question_type: qbQ.question_type,
                prompt: qbQ.prompt,
                content: parsedPrompt.text || '',
                options: parsedPrompt.options || null,
                statements: parsedPrompt.statements || null,
                part_title: parsedPrompt.partTitle || partTitle,
                points: qbQ.points || (qbQ.question_type === 'TRUE_FALSE' ? 1.0 : (qbQ.question_type === 'SHORT_ANSWER' ? 0.5 : 0.25))
              })

              vAnswersToInsert.push({
                question_id: questionId,
                mc_answer: qbQ.mc_answer || null,
                tf_answers: qbQ.tf_answers || null,
                sa_answer: qbQ.sa_answer !== undefined && qbQ.sa_answer !== null ? String(qbQ.sa_answer) : null,
                sa_tolerance: qbQ.sa_tolerance || 0,
                explanation: parsedPrompt.explanation || null
              })
            })

            await serviceRoleClient.from('questions').insert(vQuestionsToInsert)
            await serviceRoleClient.from('question_answers').insert(vAnswersToInsert)

            createdVariants.push({ code: vCode, homeworkId: vHwId, optionMaps })
          }

          // Tăng usage_count 1 lần cho tập hợp câu hỏi gốc
          const pickedIds = orderedQuestions.map((q: any) => q.id)
          await bumpQuestionUsage(serviceRoleClient, pickedIds, targetClassId, createdVariants[0].homeworkId)

          return jsonResponse({
            success: true,
            isMultiVariant: true,
            variants: createdVariants,
            totalQuestions: orderedQuestions.length,
            message: `Đã khởi tạo thành công ${createdVariants.length} mã đề thi hoán vị (${variantCodes.join(', ')})!`
          })
        }

        // ========================================================
        // Kịch bản Đơn đề thông thường
        // ========================================================
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
            question_bank_id: qbQ.id, // Phase 4.1: Truy vết nguồn gốc câu hỏi từ ngân hàng
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

        // Tăng usage_count bằng RPC nguyên tử kèm log lịch sử sử dụng theo lớp và đề thi (Phase 4.1 & 5.1)
        const pickedIds = orderedQuestions.map((q: any) => q.id)
        await bumpQuestionUsage(serviceRoleClient, pickedIds, targetClassId, homeworkId)

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
          prompt: typeof prompt === 'object' && prompt !== null ? prompt : normalizeBankPromptPayload(prompt),
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
      const { id, ids, ...updates } = body
      if (!id && (!ids || !Array.isArray(ids) || ids.length === 0)) {
        return errorResponse('Thiếu ID câu hỏi cần cập nhật', 400)
      }

      if (updates.prompt) {
        updates.prompt = normalizeBankPromptPayload(updates.prompt)
      }
      if (updates.sa_answer !== undefined && updates.sa_answer !== null) {
        updates.sa_answer = String(updates.sa_answer)
      }

      updates.updated_at = new Date().toISOString()

      // Hỗ trợ cập nhật hàng loạt (Bulk Update)
      if (ids && Array.isArray(ids) && ids.length > 0) {
        const { data: updatedRows, error: bulkErr } = await serviceRoleClient
          .from('question_bank')
          .update(updates)
          .in('id', ids)
          .select('id, difficulty')

        if (bulkErr) return errorResponse(bulkErr.message, 500)
        return jsonResponse({
          success: true,
          count: (updatedRows || []).length,
          message: `Đã cập nhật ${(updatedRows || []).length} câu hỏi thành công!`
        })
      }

      // Cập nhật đơn lẻ
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
