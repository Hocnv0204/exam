/**
 * Module giải quyết metadata phân loại câu hỏi Constant cho Question Bank.
 * Hỗ trợ các thẻ metadata cấp câu:
 * [LỚP: 11], [MÔN: Toán], [CHƯƠNG: ...], [BÀI HỌC: ...], [DẠNG BÀI: ...]
 * và các biến thể không dấu: [LOP: 11], [MON: Toan], [CHUONG: ...], [BAI HOC: ...], [DANG BAI: ...]
 */

/**
 * Chuẩn hóa chuỗi văn bản tiếng Việt để so khớp (bỏ dấu, chuyển thường, thay đ/Đ thành d, khoảng trắng đơn).
 */
export function normalizeTaxonomyText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/[:.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Bảng quy đổi số La Mã sang số nguyên (1 - 20)
 */
const ROMAN_MAP = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5,
  vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15,
  xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20
}

/**
 * Trích xuất số La Mã hoặc số Ả Rập từ tiêu đề chương/bài (ví dụ: "Chương I" -> 1, "Chương 2" -> 2, "I" -> 1)
 */
export function extractChapterOrLessonNumber(text) {
  const norm = normalizeTaxonomyText(text)
  // Match "chuong 1", "chuong i", "bai 1", "bai i"
  const mPrefixed = norm.match(/^(?:chuong|bai)\s+([ivxlcdm0-9]+)\b/)
  if (mPrefixed) {
    const raw = mPrefixed[1]
    if (/^\d+$/.test(raw)) return parseInt(raw, 10)
    if (ROMAN_MAP[raw]) return ROMAN_MAP[raw]
  }
  // Match số đứng đầu hoặc đứng một mình
  const mSolo = norm.match(/^([ivxlcdm0-9]+)\b/)
  if (mSolo) {
    const raw = mSolo[1]
    if (/^\d+$/.test(raw)) return parseInt(raw, 10)
    if (ROMAN_MAP[raw]) return ROMAN_MAP[raw]
  }
  return null
}

/**
 * Chuẩn hóa tên môn học (Toán hoặc Hóa).
 * Nhận diện theo TỪ độc lập (word-boundary) thay vì so khớp tuyệt đối cả chuỗi, nên
 * các dạng "Toán 11", "11 Toán", "Môn: Toán học", "HOA 12" đều nhận ra môn.
 * Trả null khi không thấy môn nào, hoặc khi thấy CẢ HAI môn (mơ hồ — caller báo lỗi riêng).
 */
export function normalizeSubject(subjectStr) {
  const norm = normalizeTaxonomyText(subjectStr)
  if (!norm) return null
  const words = new Set(norm.split(' ').filter(Boolean))
  const hasToan = words.has('toan') || words.has('math')
  const hasHoa = words.has('hoa') || words.has('chem') || words.has('chemistry')
  if (hasToan && !hasHoa) return 'Toán'
  if (hasHoa && !hasToan) return 'Hóa'
  return null
}

/** Kiểm tra một chuỗi có chứa cả hai môn Toán và Hóa không (dùng báo lỗi mơ hồ). */
function hasBothSubjects(text) {
  const norm = normalizeTaxonomyText(text)
  if (!norm) return false
  const words = new Set(norm.split(' ').filter(Boolean))
  const hasToan = words.has('toan') || words.has('math')
  const hasHoa = words.has('hoa') || words.has('chem') || words.has('chemistry')
  return hasToan && hasHoa
}

/**
 * Chuẩn hóa tên khối / lớp (ví dụ: "11", "12", "11-Toán", "Lớp 11", "Khối 11")
 */
export function extractGradeLevel(gradeStr) {
  const m = String(gradeStr || '').match(/\b(10|11|12)\b/)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Phân giải Lớp Constant (Grade Block / Class) từ metadata câu hỏi
 */
export function resolveClass(q, classes = []) {
  const classTag = q.classTag || q.gradeTag || ''
  const subjectTag = q.subjectTag || ''

  const rawNorm = normalizeTaxonomyText(classTag)
  const requestedSubject = normalizeSubject(subjectTag)

  // Tên lớp Constant đôi khi chỉ là "11"/"12" và không chứa môn. Không được
  // chọn bản ghi đầu tiên trong trường hợp đó: [MÔN: Hóa] phải khóa kết quả
  // vào lớp 11-Hóa, không thể rơi sang 11-Toán theo thứ tự API trả về.
  const classMatchesSubject = (cl) => {
    if (!requestedSubject) return true
    const classText = normalizeTaxonomyText(`${cl.name || ''} ${cl.grade_block || ''}`)
    return normalizeSubject(classText) === requestedSubject
  }

  // 1. Nếu classTag chứa đầy đủ thông tin khối (ví dụ: "11-Toán", "12-Hóa", "11 toan", "lop 11 toan")
  for (const cl of classes) {
    const clNameNorm = normalizeTaxonomyText(cl.name || '')
    const clBlockNorm = normalizeTaxonomyText(cl.grade_block || '')
    if ((rawNorm === clNameNorm || rawNorm === clBlockNorm) && classMatchesSubject(cl)) {
      return { targetClass: cl, error: null }
    }
  }

  // 2. Thử ghép gradeLevel + subject
  const gradeLevel = extractGradeLevel(classTag) || extractGradeLevel(q.gradeBlock)
  // Metadata vừa nhắc Toán vừa nhắc Hóa là mơ hồ — không được đoán một môn.
  if (hasBothSubjects(`${classTag || ''} ${subjectTag || ''}`)) {
    return { targetClass: null, error: `Metadata [MÔN] mơ hồ: vừa có Toán vừa có Hóa trong "${[classTag, subjectTag].filter(Boolean).join(' / ')}". Hãy chỉ ghi một môn.` }
  }
  const subject = requestedSubject || normalizeSubject(classTag)

  if (!gradeLevel && !subject) {
    return { targetClass: null, error: 'Thiếu metadata [LỚP] và [MÔN] để xác định lớp Constant' }
  }
  if (!gradeLevel) {
    return { targetClass: null, error: `Có môn "${subject}" nhưng thiếu metadata [LỚP] (ví dụ: [LỚP: 11])` }
  }
  if (!subject) {
    return { targetClass: null, error: `Có lớp "${gradeLevel}" nhưng thiếu metadata [MÔN] (ví dụ: [MÔN: Toán] hoặc [MÔN: Hóa])` }
  }

  const expectedBlock = `${gradeLevel}-${subject}`
  const matched = classes.filter(cl => {
    return (cl.grade_block && cl.grade_block.trim() === expectedBlock) ||
           (cl.name && normalizeTaxonomyText(cl.name) === normalizeTaxonomyText(expectedBlock))
  })

  if (matched.length === 1) {
    return { targetClass: matched[0], error: null }
  }
  if (matched.length === 0) {
    return { targetClass: null, error: `Không tìm thấy lớp Constant cho khối "${expectedBlock}"` }
  }
  return { targetClass: null, error: `Tìm thấy nhiều lớp Constant trùng khớp cho khối "${expectedBlock}"` }
}

/**
 * Phân giải Chương Constant trong một Lớp
 */
export function resolveChapter(chapterTag, classId, chapters = []) {
  if (!chapterTag) {
    return { targetChapter: null, error: 'Thiếu metadata [CHƯƠNG]' }
  }

  const chaptersInClass = chapters.filter(ch => ch.class_id === classId)
  if (chaptersInClass.length === 0) {
    return { targetChapter: null, error: 'Lớp học Constant này chưa có chương nào' }
  }

  const tagNorm = normalizeTaxonomyText(chapterTag)
  const tagNum = extractChapterOrLessonNumber(chapterTag)

  // 1. So khớp chính xác tên chuẩn hóa (hoặc bỏ phần "Chương X.")
  const exactMatches = chaptersInClass.filter(ch => {
    const chNorm = normalizeTaxonomyText(ch.title || '')
    if (chNorm === tagNorm) return true
    // Thử bỏ prefix "chuong i", "chuong 1"
    const chStrip = chNorm.replace(/^chuong\s+[ivxlcdm0-9]+\s*/, '').trim()
    const tagStrip = tagNorm.replace(/^chuong\s+[ivxlcdm0-9]+\s*/, '').trim()
    return tagStrip && chStrip === tagStrip
  })
  if (exactMatches.length === 1) {
    return { targetChapter: exactMatches[0], error: null }
  }
  if (exactMatches.length > 1) {
    const names = exactMatches.map(ch => ch.title).join(' / ')
    return { targetChapter: null, error: `Metadata Chương "${chapterTag}" bị trùng lặp / mơ hồ trong lớp (các lựa chọn: ${names}). Hãy ghi rõ tên chương đầy đủ.` }
  }

  // 2. So khớp theo số thứ tự chương (La Mã / Ả Rập)
  if (tagNum !== null) {
    const numMatches = chaptersInClass.filter(ch => {
      const chNum = extractChapterOrLessonNumber(ch.title || '')
      return chNum !== null && chNum === tagNum
    })
    if (numMatches.length === 1) {
      return { targetChapter: numMatches[0], error: null }
    }
    if (numMatches.length > 1) {
      const names = numMatches.map(ch => ch.title).join(' / ')
      return { targetChapter: null, error: `Metadata Chương "${chapterTag}" bị trùng lặp / mơ hồ trong lớp (các lựa chọn: ${names}). Hãy ghi rõ tên chương đầy đủ.` }
    }
  }

  // 3. So khớp chuỗi con đặc trưng (nếu tên chương trong tag là chuỗi con của chương trong DB hoặc ngược lại)
  const subMatches = chaptersInClass.filter(ch => {
    const chNorm = normalizeTaxonomyText(ch.title || '')
    return tagNorm.length >= 4 && (chNorm.includes(tagNorm) || tagNorm.includes(chNorm))
  })
  if (subMatches.length === 1) {
    return { targetChapter: subMatches[0], error: null }
  }
  if (subMatches.length > 1) {
    const names = subMatches.map(ch => ch.title).join(' / ')
    return { targetChapter: null, error: `Metadata Chương "${chapterTag}" bị trùng lặp / mơ hồ trong lớp (các lựa chọn: ${names}). Hãy ghi rõ tên chương đầy đủ.` }
  }

  return { targetChapter: null, error: `Không tìm thấy Chương "${chapterTag}" trong lớp Constant đã chọn` }
}

/**
 * Phân giải Bài học Constant trong một Chương
 */
export function resolveLesson(lessonTag, chapterId, lessons = []) {
  if (!lessonTag) {
    return { targetLesson: null, error: 'Thiếu metadata [BÀI HỌC]' }
  }

  const lessonsInChapter = lessons.filter(l => l.chapter_id === chapterId)
  if (lessonsInChapter.length === 0) {
    return { targetLesson: null, error: 'Chương này chưa có bài học nào' }
  }

  const tagNorm = normalizeTaxonomyText(lessonTag)
  const tagNum = extractChapterOrLessonNumber(lessonTag)

  // 1. So khớp chính xác tên chuẩn hóa (hoặc bỏ phần "Bài X.")
  const exactMatches = lessonsInChapter.filter(l => {
    const lNorm = normalizeTaxonomyText(l.title || '')
    if (lNorm === tagNorm) return true
    const lStrip = lNorm.replace(/^bai\s+\d+\s*/, '').trim()
    const tagStrip = tagNorm.replace(/^bai\s+\d+\s*/, '').trim()
    return tagStrip && lStrip === tagStrip
  })
  if (exactMatches.length === 1) {
    return { targetLesson: exactMatches[0], error: null }
  }
  if (exactMatches.length > 1) {
    const names = exactMatches.map(l => l.title).join(' / ')
    return { targetLesson: null, error: `Metadata Bài học "${lessonTag}" bị trùng lặp / mơ hồ trong chương (các lựa chọn: ${names}). Hãy ghi rõ tên bài học đầy đủ.` }
  }

  // 2. So khớp theo số thứ tự bài học ("Bài 1" -> 1)
  if (tagNum !== null) {
    const numMatches = lessonsInChapter.filter(l => {
      const lNum = extractChapterOrLessonNumber(l.title || '')
      return lNum !== null && lNum === tagNum
    })
    if (numMatches.length === 1) {
      return { targetLesson: numMatches[0], error: null }
    }
    if (numMatches.length > 1) {
      const names = numMatches.map(l => l.title).join(' / ')
      return { targetLesson: null, error: `Metadata Bài học "${lessonTag}" bị trùng lặp / mơ hồ trong chương (các lựa chọn: ${names}). Hãy ghi rõ tên bài học đầy đủ.` }
    }
  }

  // 3. So khớp chuỗi con đặc trưng
  const subMatches = lessonsInChapter.filter(l => {
    const lNorm = normalizeTaxonomyText(l.title || '')
    return tagNorm.length >= 4 && (lNorm.includes(tagNorm) || tagNorm.includes(lNorm))
  })
  if (subMatches.length === 1) {
    return { targetLesson: subMatches[0], error: null }
  }
  if (subMatches.length > 1) {
    const names = subMatches.map(l => l.title).join(' / ')
    return { targetLesson: null, error: `Metadata Bài học "${lessonTag}" bị trùng lặp / mơ hồ trong chương (các lựa chọn: ${names}). Hãy ghi rõ tên bài học đầy đủ.` }
  }

  return { targetLesson: null, error: `Không tìm thấy Bài học "${lessonTag}" trong chương đã chọn` }
}

/**
 * Phân giải Dạng bài Constant trong một Bài học, kèm fallback dạng bài "Khác"
 */
export function resolveQuestionType(questionTypeTag, lessonId, questionTypes = []) {
  const typesInLesson = questionTypes.filter(t => t.lesson_id === lessonId)

  // Tìm dạng bài fallback "Khác" của chính bài học này
  const otherType = typesInLesson.find(t => {
    const n = normalizeTaxonomyText(t.name || '')
    return n === 'khac'
  }) || null

  const rawTag = String(questionTypeTag || '').trim()

  // Trường hợp 1: Có tag Dạng bài
  if (rawTag) {
    // Hỗ trợ trường hợp ghi dạng path: "Bài học > Dạng bài"
    const parts = rawTag.split('>').map(s => s.trim()).filter(Boolean)
    const targetName = parts.at(-1) || rawTag
    const normTarget = normalizeTaxonomyText(targetName)

    // So khớp chính xác
    const exactMatches = typesInLesson.filter(t => normalizeTaxonomyText(t.name) === normTarget)
    if (exactMatches.length === 1) {
      return {
        matchedType: exactMatches[0],
        isFallback: false,
        error: null
      }
    }
    // Trùng khớp chính xác (thường do biến thể hoa/thường/dấu): BÁO LỖI mơ hồ,
    // tuyệt đối không lặng lẽ fallback vào "Khác" làm mất ý người viết.
    if (exactMatches.length > 1) {
      const names = exactMatches.map(t => t.name).join(' / ')
      return {
        matchedType: null,
        isFallback: false,
        error: `Dạng bài "${targetName}" bị trùng lặp / mơ hồ trong bài học (các lựa chọn: ${names}). Hãy ghi rõ tên dạng bài đầy đủ, không fallback tự động.`
      }
    }

    // So khớp chuỗi con nếu không trùng lặp
    const subMatches = typesInLesson.filter(t => {
      const tNorm = normalizeTaxonomyText(t.name)
      return normTarget.length >= 3 && (tNorm.includes(normTarget) || normTarget.includes(tNorm))
    })
    if (subMatches.length === 1) {
      return {
        matchedType: subMatches[0],
        isFallback: false,
        error: null
      }
    }
    if (subMatches.length > 1) {
      const names = subMatches.map(t => t.name).join(' / ')
      return {
        matchedType: null,
        isFallback: false,
        error: `Dạng bài "${targetName}" bị trùng lặp / mơ hồ trong bài học (các lựa chọn: ${names}). Hãy ghi rõ tên dạng bài đầy đủ, không fallback tự động.`
      }
    }

    // Nếu không match Dạng bài nào nhưng đã resolve được bài học: fallback vào "Khác" của chính bài học
    if (otherType) {
      return {
        matchedType: otherType,
        isFallback: true,
        error: null
      }
    }

    return {
      matchedType: null,
      isFallback: false,
      error: `Không tìm thấy Dạng bài "${rawTag}" và bài học chưa có Dạng bài "Khác" để fallback`
    }
  }

  // Trường hợp 2: Không có tag Dạng bài -> Fallback vào "Khác" của chính bài học
  if (otherType) {
    return {
      matchedType: otherType,
      isFallback: true,
      error: null
    }
  }

  return {
    matchedType: null,
    isFallback: false,
    error: 'Không có tag Dạng bài và bài học chưa có Dạng bài "Khác" để fallback'
  }
}

/**
 * Phân giải toàn bộ phân cấp Constant (Lớp -> Chương -> Bài học -> Dạng bài) cho một câu hỏi.
 * Tuyệt đối không đoán khi thiếu hoặc không resolve được cha.
 */
export function resolveSingleQuestion(q, taxonomyState = {}) {
  const classes = taxonomyState.classes || []
  const chapters = taxonomyState.chapters || []
  const lessons = taxonomyState.lessons || []
  const questionTypes = taxonomyState.questionTypes || []

  // 1. Resolve Lớp
  const classRes = resolveClass(q, classes)
  if (!classRes.targetClass) {
    return {
      success: false,
      qbClassId: null,
      qbChapterId: null,
      qbLessonId: null,
      qbQuestionTypeId: null,
      qbGradeBlock: null,
      isFallback: false,
      error: classRes.error || 'Không xác định được Lớp Constant'
    }
  }
  const targetClass = classRes.targetClass

  // 2. Resolve Chương
  const chapRes = resolveChapter(q.chapterTag, targetClass.id, chapters)
  if (!chapRes.targetChapter) {
    return {
      success: false,
      qbClassId: targetClass.id,
      qbChapterId: null,
      qbLessonId: null,
      qbQuestionTypeId: null,
      qbGradeBlock: targetClass.grade_block,
      isFallback: false,
      error: chapRes.error || 'Không xác định được Chương Constant'
    }
  }
  const targetChapter = chapRes.targetChapter

  // 3. Resolve Bài học
  const lessonRes = resolveLesson(q.lessonTag, targetChapter.id, lessons)
  if (!lessonRes.targetLesson) {
    return {
      success: false,
      qbClassId: targetClass.id,
      qbChapterId: targetChapter.id,
      qbLessonId: null,
      qbQuestionTypeId: null,
      qbGradeBlock: targetClass.grade_block,
      isFallback: false,
      error: lessonRes.error || 'Không xác định được Bài học Constant'
    }
  }
  const targetLesson = lessonRes.targetLesson

  // 4. Resolve Dạng bài (kèm fallback vào dạng bài "Khác" của chính bài học)
  const typeRes = resolveQuestionType(q.questionTypeTag, targetLesson.id, questionTypes)
  if (!typeRes.matchedType) {
    return {
      success: false,
      qbClassId: targetClass.id,
      qbChapterId: targetChapter.id,
      qbLessonId: targetLesson.id,
      qbQuestionTypeId: null,
      qbGradeBlock: targetClass.grade_block,
      isFallback: false,
      error: typeRes.error || 'Không xác định được Dạng bài Constant'
    }
  }
  const matchedType = typeRes.matchedType

  return {
    success: true,
    qbClassId: targetClass.id,
    qbChapterId: targetChapter.id,
    qbLessonId: targetLesson.id,
    qbQuestionTypeId: matchedType.id,
    qbGradeBlock: targetClass.grade_block,
    resolvedNames: {
      className: targetClass.name,
      chapterTitle: targetChapter.title,
      lessonTitle: targetLesson.title,
      questionTypeName: matchedType.name
    },
    isFallback: typeRes.isFallback,
    error: null
  }
}

/**
 * Phân giải toàn bộ danh sách câu hỏi theo metadata cấp câu.
 * Mỗi câu tự resolve lớp/chương/bài học độc lập.
 */
export function resolveBatchQuestionsTaxonomy(questions = [], taxonomyState = {}) {
  let resolvedCount = 0
  let fallbackCount = 0
  let errorCount = 0
  const errors = []

  questions.forEach((q, idx) => {
    const res = resolveSingleQuestion(q, taxonomyState)

    q.qbClassId = res.qbClassId
    q.qbChapterId = res.qbChapterId
    q.qbLessonId = res.qbLessonId
    q.qbQuestionTypeId = res.qbQuestionTypeId
    q.qbGradeBlock = res.qbGradeBlock

    q.resolvedClassName = res.resolvedNames?.className || null
    q.resolvedChapterTitle = res.resolvedNames?.chapterTitle || null
    q.resolvedLessonTitle = res.resolvedNames?.lessonTitle || null
    q.resolvedQuestionTypeName = res.resolvedNames?.questionTypeName || null

    q.isFallback = !!res.isFallback
    q.metadataError = res.error || ''
    // Đồng bộ với trường questionTypeError hiện có của preview
    q.questionTypeError = res.error || ''

    if (res.success) {
      resolvedCount++
      if (res.isFallback) fallbackCount++
    } else {
      errorCount++
      const qNum = q.questionNumber || (idx + 1)
      errors.push({ questionNumber: qNum, index: idx, message: res.error })
    }
  })

  return {
    total: questions.length,
    resolvedCount,
    fallbackCount,
    errorCount,
    errors
  }
}
