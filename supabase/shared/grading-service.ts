import type { QuestionType, TrueFalseStatementAnswer } from '../types/database.types.ts'

export const TF_TIER_RATIO: Record<number, number> = {
  0: 0.0,
  1: 0.10,
  2: 0.25,
  3: 0.50,
  4: 1.00
}

export interface QuestionGradeInput {
  questionId: string
  questionType: QuestionType
  points: number
  // Correct Answer Key
  mcAnswer: string | null
  tfAnswers: TrueFalseStatementAnswer | null
  saAnswer: string | number | null
  saTolerance: number | null
  // Given Answer from Student
  givenAnswer:
    | { type: 'MULTIPLE_CHOICE'; value: string }
    | { type: 'TRUE_FALSE'; value: { s1?: boolean; s2?: boolean; s3?: boolean; s4?: boolean; a?: boolean; b?: boolean; c?: boolean; d?: boolean } }
    | { type: 'SHORT_ANSWER'; value: string | number }
}

export interface QuestionGradeResult {
  questionId: string
  isCorrect: boolean
  scoreEarned: number
  pointsPossible: number
  correctAnswerSummary: unknown
  feedback: string
  correctCount?: number
  wrongCount?: number
  statementGrades?: { a: boolean; b: boolean; c: boolean; d: boolean }
}

export interface ExamGradingOptions {
  targetScale?: number // Default 10.0
  roundingStep?: number // Default 0.01 (2 decimal places)
}

export interface ExamGradingResult {
  totalScore: number // Normalized final score on targetScale (e.g. 10.0)
  rawEarned: number // Raw sum of earned points
  rawMax: number // Raw sum of possible points
  isNormalized: boolean
  totalQuestions: number
  correctCount: number
  wrongCount: number
  questionResults: QuestionGradeResult[]
}

/**
 * Normalizes short-answer string and numeric representation
 * Supports comma decimal (,), fraction string (a/b), and Unicode minus characters (−, –, —)
 */
function normalizeShortAnswer(val: unknown): { str: string; num: number | null } {
  if (val === undefined || val === null) return { str: '', num: null }
  let str = String(val).trim().toLowerCase()
  // Replace Unicode minus characters: − (\u2212), – (\u2013), — (\u2014)
  str = str.replace(/[\u2212\u2013\u2014]/g, '-')
  // Replace comma with dot
  const sanitized = str.replace(',', '.')

  let num: number | null = null

  // Check fraction format: e.g. "7/2", "-3/4", "+1.5 / 2"
  const fractionMatch = sanitized.match(/^([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)$/)
  if (fractionMatch) {
    const numPart = Number(fractionMatch[1])
    const denPart = Number(fractionMatch[2])
    if (!isNaN(numPart) && !isNaN(denPart) && denPart !== 0) {
      num = numPart / denPart
    }
  } else {
    const parsed = Number(sanitized)
    if (!isNaN(parsed) && sanitized !== '') {
      num = parsed
    }
  }

  return { str, num }
}

/**
 * Grades a single question and returns exact raw scoreEarned
 */
export function gradeQuestion(input: QuestionGradeInput): QuestionGradeResult {
  const { questionId, questionType, points, mcAnswer, tfAnswers, saAnswer, saTolerance, givenAnswer } = input

  let isCorrect = false
  let scoreEarned = 0
  let correctAnswerSummary: unknown = null
  let feedback = ''
  let correctCount = 0
  let wrongCount = 0
  let statementGrades: { a: boolean; b: boolean; c: boolean; d: boolean } | undefined = undefined

  if (questionType === 'MULTIPLE_CHOICE') {
    correctAnswerSummary = mcAnswer
    if (givenAnswer?.type === 'MULTIPLE_CHOICE' && givenAnswer.value) {
      const formattedGiven = String(givenAnswer.value).trim().toUpperCase()
      const formattedCorrect = String(mcAnswer || '').trim().toUpperCase()
      if (formattedGiven === formattedCorrect && formattedCorrect.length > 0) {
        isCorrect = true
        scoreEarned = points
        feedback = 'Correct choice'
        correctCount = 1
        wrongCount = 0
      } else {
        feedback = `Incorrect choice. Selected: ${formattedGiven}, Correct: ${formattedCorrect}`
        correctCount = 0
        wrongCount = 1
      }
    } else {
      feedback = 'No or invalid answer provided for Multiple Choice question'
      correctCount = 0
      wrongCount = 1
    }
  } else if (questionType === 'TRUE_FALSE') {
    correctAnswerSummary = tfAnswers
    if (givenAnswer?.type === 'TRUE_FALSE' && givenAnswer.value && tfAnswers) {
      let studentVal = givenAnswer.value as any
      if (typeof studentVal === 'string') {
        try { studentVal = JSON.parse(studentVal) } catch {}
      }
      let correctVal = tfAnswers as any
      if (typeof correctVal === 'string') {
        try { correctVal = JSON.parse(correctVal) } catch {}
      }

      let correctStatementsCount = 0
      const stGrades = { a: false, b: false, c: false, d: false }

      const getBool = (v: any) => {
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
        const sRaw = studentVal[k1] !== undefined ? studentVal[k1] : studentVal[k2]
        const cRaw = correctVal[k1] !== undefined ? correctVal[k1] : correctVal[k2]
        const sVal = getBool(sRaw)
        const cVal = getBool(cRaw)

        const isStmtCorrect = sVal !== undefined && cVal !== undefined && sVal === cVal
        if (isStmtCorrect) {
          correctStatementsCount += 1
        }
        stGrades[k1 as 'a' | 'b' | 'c' | 'd'] = isStmtCorrect
      }

      statementGrades = stGrades
      correctCount = correctStatementsCount
      wrongCount = 4 - correctStatementsCount

      // Universal non-linear tier ratio
      const tierRatio = TF_TIER_RATIO[correctStatementsCount] ?? 0
      scoreEarned = tierRatio * points
      isCorrect = correctStatementsCount === 4
      feedback = `${correctStatementsCount}/4 statements correct (${(tierRatio * 100).toFixed(0)}% points)`
    } else {
      feedback = 'No or invalid answer provided for True/False question'
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
          feedback = 'Short answer correct within tolerance'
          correctCount = 1
          wrongCount = 0
        } else {
          feedback = `Incorrect. Given: ${givenAnswer.value}, Expected: ${saAnswer}`
          correctCount = 0
          wrongCount = 1
        }
      } else if (givenNorm.str === expectedNorm.str && expectedNorm.str.length > 0) {
        isCorrect = true
        scoreEarned = points
        feedback = 'Short answer text matched'
        correctCount = 1
        wrongCount = 0
      } else {
        feedback = `Incorrect. Given: ${givenAnswer.value}, Expected: ${saAnswer}`
        correctCount = 0
        wrongCount = 1
      }
    } else {
      feedback = 'No or invalid answer provided for Short Answer question'
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
 * Universal Exam Grading Engine
 * Computes raw sum and normalizes to target scale (default 10.0) without cumulative rounding errors
 */
export function gradeExam(
  items: QuestionGradeInput[],
  options: ExamGradingOptions = {}
): ExamGradingResult {
  const targetScale = options.targetScale ?? 10.0
  const roundingStep = options.roundingStep ?? 0.01

  let rawEarned = 0
  let rawMax = 0
  let correctCount = 0
  let wrongCount = 0

  const questionResults: QuestionGradeResult[] = []

  for (const item of items) {
    const qRes = gradeQuestion(item)
    questionResults.push(qRes)

    rawEarned += qRes.scoreEarned
    rawMax += item.points
    if (qRes.isCorrect) {
      correctCount += 1
    } else {
      wrongCount += 1
    }
  }

  // Normalization logic:
  // If rawMax === targetScale (Identity, e.g. THPT Math/Chem 10 points), final score = rawEarned
  // If rawMax != targetScale, final score = (rawEarned / rawMax) * targetScale
  let normalizedScore = rawEarned
  const isIdentity = Math.abs(rawMax - targetScale) < 1e-6

  if (!isIdentity && rawMax > 0) {
    normalizedScore = (rawEarned / rawMax) * targetScale
  } else if (rawMax <= 0) {
    normalizedScore = 0
  }

  // Round once at the very end to the configured step
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

