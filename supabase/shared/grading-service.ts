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
}

export function gradeQuestion(input: QuestionGradeInput): QuestionGradeResult {
  const { questionId, questionType, points, mcAnswer, tfAnswers, saAnswer, saTolerance, givenAnswer } = input

  let isCorrect = false
  let scoreEarned = 0
  let correctAnswerSummary: unknown = null
  let feedback = ''

  if (questionType === 'MULTIPLE_CHOICE') {
    correctAnswerSummary = mcAnswer
    if (givenAnswer.type === 'MULTIPLE_CHOICE' && givenAnswer.value) {
      const formattedGiven = givenAnswer.value.trim().toUpperCase()
      const formattedCorrect = (mcAnswer || '').trim().toUpperCase()
      if (formattedGiven === formattedCorrect) {
        isCorrect = true
        scoreEarned = points
        feedback = 'Correct choice'
      } else {
        feedback = `Incorrect choice. Selected: ${formattedGiven}, Correct: ${formattedCorrect}`
      }
    } else {
      feedback = 'No or invalid answer provided for Multiple Choice question'
    }
  } else if (questionType === 'TRUE_FALSE') {
    correctAnswerSummary = tfAnswers
    if (givenAnswer.type === 'TRUE_FALSE' && givenAnswer.value && tfAnswers) {
      const studentVal = givenAnswer.value as Record<string, boolean | undefined>
      const correctVal = tfAnswers as Record<string, boolean | undefined>
      let correctStatementsCount = 0

      const keysPairs = [
        ['a', 's1'],
        ['b', 's2'],
        ['c', 's3'],
        ['d', 's4']
      ]

      for (const [k1, k2] of keysPairs) {
        const sVal = studentVal[k1] !== undefined ? studentVal[k1] : studentVal[k2]
        const cVal = correctVal[k1] !== undefined ? correctVal[k1] : correctVal[k2]

        if (sVal !== undefined && cVal !== undefined && sVal === cVal) {
          correctStatementsCount += 1
        }
      }

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
        } else {
          feedback = `Incorrect. Given: ${givenStr}, Expected: ${expectedStr}`
        }
      } else if (givenStr === expectedStr && expectedStr.length > 0) {
        isCorrect = true
        scoreEarned = points
        feedback = 'Short answer text matched'
      } else {
        feedback = `Incorrect. Given: ${givenStr}, Expected: ${expectedStr}`
      }
    } else {
      feedback = 'No or invalid answer provided for Short Answer question'
    }
  }

  return {
    questionId,
    isCorrect,
    scoreEarned: Number(scoreEarned.toFixed(2)),
    pointsPossible: points,
    correctAnswerSummary,
    feedback,
  }
}
