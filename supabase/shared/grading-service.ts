import type { QuestionType, TrueFalseStatementAnswer } from '../types/database.types.ts'

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
    | { type: 'TRUE_FALSE'; value: { s1?: boolean; s2?: boolean; s3?: boolean; s4?: boolean } }
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
    if (givenAnswer.type === 'MULTIPLE_CHOICE' && givenAnswer.value) {
      const formattedGiven = givenAnswer.value.trim().toUpperCase()
      const formattedCorrect = (mcAnswer || '').trim().toUpperCase()
      if (formattedGiven === formattedCorrect) {
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
    if (givenAnswer.type === 'TRUE_FALSE' && givenAnswer.value && tfAnswers) {
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

      if (correctStatementsCount === 4) {
        isCorrect = true
        scoreEarned = points
        feedback = 'All 4 statements correct'
      } else {
        scoreEarned = Number(((correctStatementsCount / 4) * points).toFixed(2))
        feedback = `${correctStatementsCount}/4 statements correct`
      }
    } else {
      feedback = 'No or invalid answer provided for True/False question'
      correctCount = 0
      wrongCount = 4
    }
  } else if (questionType === 'SHORT_ANSWER') {
    correctAnswerSummary = { answer: saAnswer, tolerance: saTolerance || 0 }
    if (givenAnswer.type === 'SHORT_ANSWER' && givenAnswer.value !== undefined && givenAnswer.value !== null) {
      const givenStr = String(givenAnswer.value).trim().toLowerCase()
      const expectedStr = String(saAnswer ?? '').trim().toLowerCase()
      const givenNum = parseFloat(givenStr)
      const expectedNum = parseFloat(expectedStr)

      if (!isNaN(givenNum) && !isNaN(expectedNum) && saAnswer !== null) {
        const diff = Math.abs(givenNum - expectedNum)
        const tol = saTolerance || 0
        if (diff <= tol) {
          isCorrect = true
          scoreEarned = points
          feedback = 'Short answer correct within tolerance'
          correctCount = 1
          wrongCount = 0
        } else {
          feedback = `Incorrect. Given: ${givenStr}, Expected: ${expectedStr}`
          correctCount = 0
          wrongCount = 1
        }
      } else if (givenStr === expectedStr && expectedStr.length > 0) {
        isCorrect = true
        scoreEarned = points
        feedback = 'Short answer text matched'
        correctCount = 1
        wrongCount = 0
      } else {
        feedback = `Incorrect. Given: ${givenStr}, Expected: ${expectedStr}`
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
    scoreEarned: Number(scoreEarned.toFixed(2)),
    pointsPossible: points,
    correctAnswerSummary,
    feedback,
    correctCount,
    wrongCount,
    statementGrades,
  }
}
