import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireStudent } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { submitHomeworkSchema } from '../../shared/validators.ts'
import { gradeQuestion, type QuestionGradeResult } from '../../shared/grading-service.ts'
import type { TrueFalseStatementAnswer } from '../../types/database.types.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    const { user, serviceRoleClient } = await requireStudent(req)
    const body = await req.json()
    const validation = submitHomeworkSchema.safeParse(body)
    if (!validation.success) {
      return errorResponse('Validation error', 400, validation.error.format())
    }

    const { homeworkId, answers, durationSecondsTaken } = validation.data

    // 1. Fetch homework and verify student class assignment
    const { data: homework, error: homeworkError } = await serviceRoleClient
      .from('homeworks')
      .select('id, title, max_score, pass_score, is_published, lesson_id, deadline, max_attempts, pdf_path')
      .eq('id', homeworkId)
      .single()

    if (homeworkError || !homework || !homework.is_published) {
      return errorResponse('Homework not found or not published', 404)
    }

    if (!user.classIds || user.classIds.length === 0) {
      return errorResponse('Student is not assigned to any class', 403)
    }

    // Check deadline
    if (homework.deadline) {
      const deadlineDate = new Date(homework.deadline)
      const now = new Date()
      if (now > deadlineDate) {
        return errorResponse('Bài tập đã hết hạn nộp bài', 400)
      }
    }

    // Check max attempts limit
    if (homework.max_attempts && homework.max_attempts > 0) {
      const { count, error: countError } = await serviceRoleClient
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .eq('homework_id', homeworkId)
        .eq('student_id', user.id)

      if (countError) {
        return errorResponse('Failed to verify submission attempts limit', 500)
      }

      if (count !== null && count >= homework.max_attempts) {
        return errorResponse('Bạn đã đạt giới hạn tối đa số lần làm bài tập này', 400)
      }
    }

    // Verify homework's lesson -> chapter -> class matches student's class
    const { data: lesson, error: lessonError } = await serviceRoleClient
      .from('lessons')
      .select('chapter_id, chapters(class_id)')
      .eq('id', homework.lesson_id)
      .single()

    if (lessonError || !lesson) {
      return errorResponse('Homework lesson context not found', 404)
    }

    const classIdOfHomework = (lesson.chapters as unknown as { class_id: string })?.class_id
    if (!user.classIds.includes(classIdOfHomework)) {
      return errorResponse('Forbidden: You are not enrolled in the class for this homework', 403)
    }

    // 2. Fetch all questions for homework
    const { data: questions, error: qError } = await serviceRoleClient
      .from('questions')
      .select('id, question_number, question_type, prompt, points')
      .eq('homework_id', homeworkId)

    if (qError || !questions || questions.length === 0) {
      return errorResponse('Homework contains no questions', 400)
    }

    // 3. Fetch Answer Keys using Service Role Client (Students cannot select question_answers via RLS!)
    const questionIds = questions.map((q) => q.id)
    const { data: answerKeys, error: keyError } = await serviceRoleClient
      .from('question_answers')
      .select('question_id, mc_answer, tf_answers, sa_answer, sa_tolerance')
      .in('question_id', questionIds)

    if (keyError || !answerKeys) {
      return errorResponse('Failed to load homework answer key', 500)
    }

    // Index answer keys by question_id
    const keyMap = new Map(answerKeys.map((k) => [k.question_id, k]))
    const answerMap = new Map(answers.map((a) => [a.questionId, a.givenAnswer]))

    // Determine active grading structure
    const totalQuestions = questions.length
    const mcCount = questions.filter(q => q.question_type === 'MULTIPLE_CHOICE').length
    const tfCount = questions.filter(q => q.question_type === 'TRUE_FALSE').length
    const saCount = questions.filter(q => q.question_type === 'SHORT_ANSWER').length

    const isAllMC = mcCount === totalQuestions
    const isStructureB = mcCount === 12 && tfCount === 4 && saCount === 6
    const isStructureC = mcCount === 18 && tfCount === 4 && saCount === 6

    // 4. Grade each question
    for (const q of questions) {
      const key = keyMap.get(q.id)
      const given = answerMap.get(q.id) || { type: q.question_type, value: null }

      let customPoints = q.points
      if (isAllMC) {
        customPoints = 10 / totalQuestions
      } else if (isStructureB) {
        if (q.question_type === 'MULTIPLE_CHOICE') customPoints = 0.25
        else if (q.question_type === 'TRUE_FALSE') customPoints = 1.0
        else if (q.question_type === 'SHORT_ANSWER') customPoints = 0.5
      } else if (isStructureC) {
        if (q.question_type === 'MULTIPLE_CHOICE') customPoints = 0.5
        else if (q.question_type === 'TRUE_FALSE') customPoints = 1.0
        else if (q.question_type === 'SHORT_ANSWER') customPoints = 0.25
      }

      const gradeResult = gradeQuestion({
        questionId: q.id,
        questionType: q.question_type,
        points: customPoints,
        mcAnswer: key?.mc_answer || null,
        tfAnswers: (key?.tf_answers as unknown as TrueFalseStatementAnswer) || null,
        saAnswer: key?.sa_answer !== null && key?.sa_answer !== undefined ? key.sa_answer : null,
        saTolerance: key?.sa_tolerance !== null && key?.sa_tolerance !== undefined ? Number(key.sa_tolerance) : 0,
        // @ts-ignore dynamic type check in gradeQuestion
        givenAnswer: given,
      })

      // Custom non-linear grading for True/False questions under Structure B and C
      if ((isStructureB || isStructureC) && q.question_type === 'TRUE_FALSE') {
        const correctCountForTF = gradeResult.correctCount ?? 0
        let customScoreEarned = 0
        if (correctCountForTF === 1) customScoreEarned = 0.1
        else if (correctCountForTF === 2) customScoreEarned = 0.25
        else if (correctCountForTF === 3) customScoreEarned = 0.5
        else if (correctCountForTF === 4) customScoreEarned = 1.0
        
        gradeResult.scoreEarned = customScoreEarned
        gradeResult.isCorrect = correctCountForTF === 4
      }

      totalScore += gradeResult.scoreEarned
      correctCount += gradeResult.isCorrect ? 1 : 0
      wrongCount += gradeResult.isCorrect ? 0 : 1

      questionReviews.push({
        questionNumber: q.question_number,
        prompt: q.prompt,
        questionType: q.question_type,
        givenAnswer: given,
        ...gradeResult,
      })

      submissionAnswersToInsert.push({
        question_id: q.id,
        given_answer: given,
        is_correct: gradeResult.isCorrect,
        score_earned: gradeResult.scoreEarned,
      })
    }

    let finalScore = totalScore
    if (isAllMC) {
      finalScore = Math.round((correctCount / totalQuestions) * 10 * 10) / 10
    } else {
      finalScore = Number(totalScore.toFixed(2))
    }

    // 5. Save Submission record
    const { data: submission, error: subError } = await serviceRoleClient
      .from('submissions')
      .insert({
        homework_id: homeworkId,
        student_id: user.id,
        total_score: finalScore,
        max_score: homework.max_score,
        correct_count: correctCount,
        wrong_count: wrongCount,
        duration_seconds_taken: durationSecondsTaken || 0,
      })
      .select('id, submitted_at')
      .single()

    if (subError || !submission) {
      return errorResponse(`Failed to record submission: ${subError?.message}`, 500)
    }

    // 6. Save Submission Answers
    const answersWithSubId = submissionAnswersToInsert.map((item) => ({
      submission_id: submission.id,
      ...item,
    }))

    const { error: subAnsError } = await serviceRoleClient
      .from('submission_answers')
      .insert(answersWithSubId)

    if (subAnsError) {
      return errorResponse(`Failed to record submission answers: ${subAnsError.message}`, 500)
    }

    // Generate Signed URL for PDF storage file
    let pdfUrl = homework.pdf_path
    if (pdfUrl && !pdfUrl.startsWith('http')) {
      const { data: signedUrlData, error: storageErr } = await serviceRoleClient.storage
        .from('pdf-files')
        .createSignedUrl(homework.pdf_path, 3600)
      if (!storageErr && signedUrlData) {
        pdfUrl = signedUrlData.signedUrl
      }
    }

    // 7. Return complete submission result
    return jsonResponse(
      {
        submissionId: submission.id,
        homeworkId,
        homeworkTitle: homework.title,
        submittedAt: submission.submitted_at,
        score: finalScore,
        maxScore: homework.max_score,
        passScore: homework.pass_score,
        isPassed: finalScore >= homework.pass_score,
        correctCount,
        wrongCount,
        questionReview: questionReviews,
        pdfUrl,
      },
      200
    )
  } catch (err: unknown) {
    const error = err as Error
    const msg = error.message || ''
    console.error('[submit-homework] Error during execution:', msg)
    if (msg.includes('Unauthorized') || msg.includes('token') || msg.includes('Authorization')) {
      return errorResponse(msg || 'Unauthorized / Error', 401)
    }
    if (msg.includes('Forbidden')) {
      return errorResponse(msg || 'Forbidden', 403)
    }
    return errorResponse(msg || 'Internal Server Error', 500)
  }
})
