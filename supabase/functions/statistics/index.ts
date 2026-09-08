import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405)
    }

    const { serviceRoleClient } = await requireAdmin(req)
    const url = new URL(req.url)
    const homeworkId = url.searchParams.get('homeworkId')
    const classId = url.searchParams.get('classId')
    const studentId = url.searchParams.get('studentId')

    // 1. Single Homework Performance Statistics
    if (homeworkId) {
      const { data: homework, error: hErr } = await serviceRoleClient
        .from('homeworks')
        .select('id, title, pass_score, max_score')
        .eq('id', homeworkId)
        .single()

      if (hErr || !homework) return errorResponse('Homework not found', 404)

      const { data: submissions, error: sErr } = await serviceRoleClient
        .from('submissions')
        .select('id, total_score, student_id')
        .eq('homework_id', homeworkId)

      if (sErr) return errorResponse(sErr.message, 500)

      if (!submissions || submissions.length === 0) {
        return jsonResponse({
          homework,
          totalSubmissions: 0,
          averageScore: 0,
          highestScore: 0,
          lowestScore: 0,
          passCount: 0,
          failCount: 0,
          passPercentage: 0,
        })
      }

      // Take highest score per student for this homework
      const bestScorePerStudent = new Map<string, number>()
      for (const sub of submissions) {
        const score = Number(sub.total_score)
        const currentBest = bestScorePerStudent.get(sub.student_id)
        if (currentBest === undefined || score > currentBest) {
          bestScorePerStudent.set(sub.student_id, score)
        }
      }

      const scores = Array.from(bestScorePerStudent.values())
      const totalSubmissions = submissions.length
      const studentCount = scores.length
      const sum = scores.reduce((a, b) => a + b, 0)
      const averageScore = Number((sum / studentCount).toFixed(2))
      const highestScore = Math.max(...scores)
      const lowestScore = Math.min(...scores)
      const passCount = scores.filter((sc) => sc >= Number(homework.pass_score)).length
      const failCount = studentCount - passCount
      const passPercentage = Number(((passCount / studentCount) * 100).toFixed(2))

      return jsonResponse({
        homework,
        totalSubmissions,
        averageScore,
        highestScore,
        lowestScore,
        passCount,
        failCount,
        passPercentage,
      })
    }

    // 2. Class Level Statistics
    if (classId) {
      const { data: classData, error: cErr } = await serviceRoleClient
        .from('classes')
        .select('id, name, description')
        .eq('id', classId)
        .single()

      if (cErr || !classData) return errorResponse('Class not found', 404)

      const { data: students, error: stErr } = await serviceRoleClient
        .from('profiles')
        .select('id, username, full_name, student_classes!inner(class_id)')
        .eq('student_classes.class_id', classId)
        .eq('role', 'STUDENT')

      if (stErr) return errorResponse(stErr.message, 500)

      const studentIds = students.map((s) => s.id)
      let submissions: Array<{ student_id: string; homework_id: string; total_score: number }> = []

      if (studentIds.length > 0) {
        const { data: subData } = await serviceRoleClient
          .from('submissions')
          .select('student_id, homework_id, total_score')
          .in('student_id', studentIds)

        if (subData) submissions = subData
      }

      const totalSubmissions = submissions.length

      // Take highest score per student per homework
      const bestScoreMap = new Map<string, number>()
      for (const sub of submissions) {
        const key = `${sub.student_id}_${sub.homework_id}`
        const score = Number(sub.total_score)
        const currentBest = bestScoreMap.get(key)
        if (currentBest === undefined || score > currentBest) {
          bestScoreMap.set(key, score)
        }
      }

      const bestScores = Array.from(bestScoreMap.values())
      const averageScore =
        bestScores.length > 0
          ? Number((bestScores.reduce((a, b) => a + b, 0) / bestScores.length).toFixed(2))
          : 0

      return jsonResponse({
        class: classData,
        totalStudents: students.length,
        totalSubmissions,
        averageScore,
        students,
      })
    }

    // 3. Specific Student Statistics
    if (studentId) {
      const { data: student, error: stErr } = await serviceRoleClient
        .from('profiles')
        .select(`
          id,
          username,
          full_name,
          student_classes (
            class_id,
            classes (name)
          )
        `)
        .eq('id', studentId)
        .single()

      if (stErr || !student) return errorResponse('Student not found', 404)

      const { data: submissions, error: subErr } = await serviceRoleClient
        .from('submissions')
        .select('id, homework_id, total_score, max_score, submitted_at, homeworks(title)')
        .eq('student_id', studentId)

      if (subErr) return errorResponse(subErr.message, 500)

      const totalSubmissions = submissions?.length || 0

      // Take highest score per homework for this student
      const bestScorePerHomework = new Map<string, number>()
      if (submissions) {
        for (const sub of submissions) {
          const score = Number(sub.total_score)
          const currentBest = bestScorePerHomework.get(sub.homework_id)
          if (currentBest === undefined || score > currentBest) {
            bestScorePerHomework.set(sub.homework_id, score)
          }
        }
      }

      const bestScores = Array.from(bestScorePerHomework.values())
      const averageScore =
        bestScores.length > 0
          ? Number((bestScores.reduce((a, b) => a + b, 0) / bestScores.length).toFixed(2))
          : 0

      return jsonResponse({
        student: {
          id: student.id,
          username: student.username,
          fullName: student.full_name,
          className: ((student.student_classes || []) as unknown as Array<{ classes: { name: string } }>).map((sc) => sc.classes?.name).filter(Boolean).join(', ') || 'Unassigned',
        },
        totalSubmissions,
        averageScore,
        submissions: submissions || [],
      })
    }

    // Default Overview Statistics per Homework
    const { data: homeworkStats, error: hAllErr } = await serviceRoleClient
      .from('homeworks')
      .select(`
        id,
        title,
        pass_score,
        max_score,
        submissions (student_id, total_score)
      `)

    if (hAllErr) return errorResponse(hAllErr.message, 500)

    const summary = homeworkStats.map((hw) => {
      const subs = hw.submissions as unknown as Array<{ student_id: string; total_score: number }> || []

      // Take highest score per student for each homework
      const bestScoreMap = new Map<string, number>()
      for (const s of subs) {
        const score = Number(s.total_score)
        const currentBest = bestScoreMap.get(s.student_id)
        if (currentBest === undefined || score > currentBest) {
          bestScoreMap.set(s.student_id, score)
        }
      }

      const bestScores = Array.from(bestScoreMap.values())
      const subCount = subs.length
      const avg = bestScores.length > 0 ? Number((bestScores.reduce((a, b) => a + b, 0) / bestScores.length).toFixed(2)) : 0

      return {
        homeworkId: hw.id,
        title: hw.title,
        submissionsCount: subCount,
        averageScore: avg,
      }
    })

    return jsonResponse(summary)
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
