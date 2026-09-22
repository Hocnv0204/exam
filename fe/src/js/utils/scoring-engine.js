/**
 * Universal Scoring Engine (Client-side & Isomorphic Logic)
 * Supports dynamic point calculation, True/False non-linear ratio grading,
 * short-answer normalization with decimal commas and tolerance, and final score normalization.
 */

export const TF_TIER_RATIO = {
  0: 0.0,
  1: 0.10,
  2: 0.25,
  3: 0.50,
  4: 1.00
}

export const EXAM_PRESETS = {
  THPT_TOAN: {
    id: 'THPT_TOAN',
    name: 'THPT Toán (12-4-6)',
    description: '12 Trắc nghiệm (0.25đ) + 4 Đúng/Sai (1.0đ) + 6 Điền khuyết (0.5đ) = 10.0đ',
    badge: '10.0đ Chuẩn BGD',
    mcPoints: 0.25,
    tfPoints: 1.0,
    saPoints: 0.5
  },
  THPT_KHTN: {
    id: 'THPT_KHTN',
    name: 'THPT KHTN (18-4-6)',
    description: '18 Trắc nghiệm (0.25đ) + 4 Đúng/Sai (1.0đ) + 6 Điền khuyết (0.25đ) = 10.0đ',
    badge: '10.0đ Chuẩn BGD',
    mcPoints: 0.25,
    tfPoints: 1.0,
    saPoints: 0.25
  },
  EQUAL_10: {
    id: 'EQUAL_10',
    name: 'Chia đều thang 10',
    description: 'Tự động chia đều 10 điểm cho toàn bộ số câu hỏi trong đề',
    badge: 'Chia đều 10đ',
    calculatePoint: (totalQ) => totalQ > 0 ? Number((10 / totalQ).toFixed(4)) : 1.0
  },
  EQUAL_1: {
    id: 'EQUAL_1',
    name: '1.0 điểm / câu',
    description: 'Mỗi câu 1 điểm (Tự động quy đổi về thang 10 khi nộp bài)',
    badge: '1.0đ / câu',
    mcPoints: 1.0,
    tfPoints: 1.0,
    saPoints: 1.0
  }
}

/**
 * Normalizes short-answer string and numeric representation
 */
export function normalizeShortAnswer(val) {
  if (val === undefined || val === null) return { str: '', num: null }
  const str = String(val).trim().toLowerCase()
  const sanitizedNumStr = str.replace(',', '.')
  const num = !isNaN(Number(sanitizedNumStr)) && sanitizedNumStr !== '' ? Number(sanitizedNumStr) : null
  return { str, num }
}

/**
 * Grades a single question client-side
 */
export function gradeQuestionLocally(input) {
  const { questionId, questionType, points = 1.0, mcAnswer, tfAnswers, saAnswer, saTolerance, givenAnswer } = input

  let isCorrect = false
  let scoreEarned = 0
  let correctAnswerSummary = null
  let feedback = ''
  let correctCount = 0
  let wrongCount = 0
  let statementGrades = undefined

  if (questionType === 'MULTIPLE_CHOICE') {
    correctAnswerSummary = mcAnswer
    if (givenAnswer?.type === 'MULTIPLE_CHOICE' && givenAnswer.value) {
      const formattedGiven = String(givenAnswer.value).trim().toUpperCase()
      const formattedCorrect = String(mcAnswer || '').trim().toUpperCase()
      if (formattedGiven === formattedCorrect && formattedCorrect.length > 0) {
        isCorrect = true
        scoreEarned = points
        feedback = 'Đúng'
        correctCount = 1
        wrongCount = 0
      } else {
        feedback = `Sai. Đã chọn: ${formattedGiven}, Đáp án: ${formattedCorrect}`
        correctCount = 0
        wrongCount = 1
      }
    } else {
      feedback = 'Chưa chọn đáp án'
      correctCount = 0
      wrongCount = 1
    }
  } else if (questionType === 'TRUE_FALSE') {
    correctAnswerSummary = tfAnswers
    if (givenAnswer?.type === 'TRUE_FALSE' && givenAnswer.value && tfAnswers) {
      let studentVal = givenAnswer.value
      if (typeof studentVal === 'string') {
        try { studentVal = JSON.parse(studentVal) } catch {}
      }
      let correctVal = tfAnswers
      if (typeof correctVal === 'string') {
        try { correctVal = JSON.parse(correctVal) } catch {}
      }

      let correctStatementsCount = 0
      const stGrades = { a: false, b: false, c: false, d: false }

      const getBool = (v) => {
        if (v === true || v === 'true' || v === 1 || v === '1') return true
        if (v === false || v === 'false' || v === 0 || v === '0') return false
        return undefined
      }

      const keysPairs = [
        ['a', 's1'],
        ['b', 's2'],
        ['c', 's3'],
        ['d', 's4']
      ]

      for (const [k1, k2] of keysPairs) {
        const sRaw = studentVal?.[k1] !== undefined ? studentVal[k1] : studentVal?.[k2]
        const cRaw = correctVal?.[k1] !== undefined ? correctVal[k1] : correctVal?.[k2]
        const sVal = getBool(sRaw)
        const cVal = getBool(cRaw)

        const isStmtCorrect = sVal !== undefined && cVal !== undefined && sVal === cVal
        if (isStmtCorrect) {
          correctStatementsCount += 1
        }
        stGrades[k1] = isStmtCorrect
      }

      statementGrades = stGrades
      correctCount = correctStatementsCount
      wrongCount = 4 - correctStatementsCount

      const tierRatio = TF_TIER_RATIO[correctStatementsCount] ?? 0
      scoreEarned = tierRatio * points
      isCorrect = correctStatementsCount === 4
      feedback = `Đúng ${correctStatementsCount}/4 ý (${(tierRatio * 100).toFixed(0)}% điểm)`
    } else {
      feedback = 'Chưa làm đủ ý'
      correctCount = 0
      wrongCount = 4
    }
  } else if (questionType === 'SHORT_ANSWER') {
    correctAnswerSummary = { answer: saAnswer, tolerance: saTolerance || 0 }
    if (givenAnswer?.type === 'SHORT_ANSWER' && givenAnswer.value !== undefined && givenAnswer.value !== null) {
      const givenNorm = normalizeShortAnswer(givenAnswer.value)
      const expectedNorm = normalizeShortAnswer(saAnswer)

      if (givenNorm.num !== null && expectedNorm.num !== null) {
        const tol = saTolerance !== null && saTolerance !== undefined ? Math.max(0, Number(saTolerance)) : 0
        const diff = Math.abs(givenNorm.num - expectedNorm.num)
        if (diff <= tol + 1e-9) {
          isCorrect = true
          scoreEarned = points
          feedback = 'Đúng'
          correctCount = 1
          wrongCount = 0
        } else {
          feedback = `Sai. Nhập: ${givenAnswer.value}, Đáp án: ${saAnswer}`
          correctCount = 0
          wrongCount = 1
        }
      } else if (givenNorm.str === expectedNorm.str && expectedNorm.str.length > 0) {
        isCorrect = true
        scoreEarned = points
        feedback = 'Đúng'
        correctCount = 1
        wrongCount = 0
      } else {
        feedback = `Sai. Nhập: ${givenAnswer.value}, Đáp án: ${saAnswer}`
        correctCount = 0
        wrongCount = 1
      }
    } else {
      feedback = 'Chưa điền câu trả lời'
      correctCount = 0
      wrongCount = 1
    }
  }

  return {
    questionId,
    isCorrect,
    scoreEarned,
    pointsPossible: points,
    correctAnswerSummary,
    feedback,
    correctCount,
    wrongCount,
    statementGrades,
  }
}

/**
 * Universal Exam Grading Engine (Client-side)
 */
export function gradeExamLocally(items, options = {}) {
  const targetScale = options.targetScale ?? 10.0
  const roundingStep = options.roundingStep ?? 0.01

  let rawEarned = 0
  let rawMax = 0
  let correctCount = 0
  let wrongCount = 0

  const questionResults = []

  for (const item of items) {
    const qRes = gradeQuestionLocally(item)
    questionResults.push(qRes)

    rawEarned += qRes.scoreEarned
    rawMax += (item.points !== undefined && item.points !== null ? Number(item.points) : 1.0)
    if (qRes.isCorrect) {
      correctCount += 1
    } else {
      wrongCount += 1
    }
  }

  let normalizedScore = rawEarned
  const isIdentity = Math.abs(rawMax - targetScale) < 1e-6

  if (!isIdentity && rawMax > 0) {
    normalizedScore = (rawEarned / rawMax) * targetScale
  } else if (rawMax <= 0) {
    normalizedScore = 0
  }

  let finalScore = normalizedScore
  if (roundingStep > 0) {
    finalScore = Math.round(normalizedScore / roundingStep) * roundingStep
  }
  finalScore = Number(finalScore.toFixed(2))

  return {
    totalScore: Math.min(targetScale, Math.max(0, finalScore)),
    rawEarned: Number(rawEarned.toFixed(4)),
    rawMax: Number(rawMax.toFixed(4)),
    isNormalized: !isIdentity && rawMax > 0,
    totalQuestions: items.length,
    correctCount,
    wrongCount,
    questionResults
  }
}

/**
 * Calculates raw max points sum of questions list
 */
export function calculateExamRawMax(questions) {
  if (!questions || !Array.isArray(questions)) return 0
  const sum = questions.reduce((acc, q) => {
    const p = q.points !== undefined && q.points !== null && !isNaN(Number(q.points))
      ? Number(q.points)
      : (q.questionType === 'TRUE_FALSE' ? 1.0 : (q.questionType === 'SHORT_ANSWER' ? 0.5 : 0.25))
    return acc + p
  }, 0)
  return Number(sum.toFixed(4))
}

/**
 * Applies a preset configuration to questions in-place
 */
export function applyExamPreset(questions, presetKey) {
  if (!questions || !Array.isArray(questions)) return questions
  const totalQ = questions.length

  if (presetKey === 'THPT_TOAN') {
    questions.forEach(q => {
      if (q.questionType === 'MULTIPLE_CHOICE') q.points = 0.25
      else if (q.questionType === 'TRUE_FALSE') q.points = 1.0
      else if (q.questionType === 'SHORT_ANSWER') q.points = 0.5
      else q.points = 0.25
    })
  } else if (presetKey === 'THPT_KHTN') {
    questions.forEach(q => {
      if (q.questionType === 'MULTIPLE_CHOICE') q.points = 0.25
      else if (q.questionType === 'TRUE_FALSE') q.points = 1.0
      else if (q.questionType === 'SHORT_ANSWER') q.points = 0.25
      else q.points = 0.25
    })
  } else if (presetKey === 'EQUAL_10') {
    const pt = totalQ > 0 ? Number((10 / totalQ).toFixed(4)) : 1.0
    questions.forEach(q => {
      q.points = pt
    })
  } else if (presetKey === 'EQUAL_1') {
    questions.forEach(q => {
      q.points = 1.0
    })
  }
  return questions
}
