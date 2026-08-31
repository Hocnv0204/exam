import { z } from 'https://esm.sh/zod@3.23.8'

// Login Validator
export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

// Student Management Validators
export const createStudentSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  classId: z.string().uuid('Invalid Class ID').optional(),
  classIds: z.array(z.string().uuid('Invalid Class ID')).optional(),
})

export const updateStudentSchema = z.object({
  studentId: z.string().uuid('Invalid Student ID'),
  fullName: z.string().min(1).optional(),
  classId: z.string().uuid('Invalid Class ID').optional(),
  classIds: z.array(z.string().uuid('Invalid Class ID')).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().nullable(),
})

export const deleteStudentSchema = z.object({
  studentId: z.string().uuid('Invalid Student ID'),
})

export const resetPasswordSchema = z.object({
  studentId: z.string().uuid('Invalid Student ID'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
})

// Class Management Validators
export const createClassSchema = z.object({
  name: z.string().min(1, 'Class name is required'),
  description: z.string().optional(),
  tuitionFee: z.number().nonnegative().optional().default(0),
})

export const updateClassSchema = z.object({
  classId: z.string().uuid('Invalid Class ID'),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  tuitionFee: z.number().nonnegative().optional(),
})

export const deleteClassSchema = z.object({
  classId: z.string().uuid('Invalid Class ID'),
})

// Chapter Management Validators
export const createChapterSchema = z.object({
  classId: z.string().uuid('Invalid Class ID'),
  title: z.string().min(1, 'Chapter title is required'),
  orderIndex: z.number().int().optional().default(0),
})

export const updateChapterSchema = z.object({
  chapterId: z.string().uuid('Invalid Chapter ID'),
  title: z.string().min(1).optional(),
  orderIndex: z.number().int().optional(),
})

export const deleteChapterSchema = z.object({
  chapterId: z.string().uuid('Invalid Chapter ID'),
})

// Lesson Management Validators
export const createLessonSchema = z.object({
  chapterId: z.string().uuid('Invalid Chapter ID'),
  title: z.string().min(1, 'Lesson title is required'),
  orderIndex: z.number().int().optional().default(0),
  content: z.string().optional(),
  videoUrl: z.string().optional().nullable(),
  theoryFiles: z.array(z.string()).optional().nullable(),
})

export const updateLessonSchema = z.object({
  lessonId: z.string().uuid('Invalid Lesson ID'),
  title: z.string().min(1).optional(),
  orderIndex: z.number().int().optional(),
  content: z.string().optional(),
  videoUrl: z.string().optional().nullable(),
  theoryFiles: z.array(z.string()).optional().nullable(),
})

export const deleteLessonSchema = z.object({
  lessonId: z.string().uuid('Invalid Lesson ID'),
})

// Question & Answer Validators
export const tfAnswerSchema = z.object({
  a: z.boolean().optional(),
  b: z.boolean().optional(),
  c: z.boolean().optional(),
  d: z.boolean().optional(),
  s1: z.boolean().optional(),
  s2: z.boolean().optional(),
  s3: z.boolean().optional(),
  s4: z.boolean().optional(),
})

export const questionInputSchema = z.object({
  questionNumber: z.number().int().positive(),
  questionType: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']),
  prompt: z.string().optional().default(''),
  points: z.number().positive().default(1),
  // Answer keys (Restricted from students)
  mcAnswer: z.enum(['A', 'B', 'C', 'D']).nullable().optional(),
  tfAnswers: tfAnswerSchema.nullable().optional(),
  saAnswer: z.union([z.number(), z.string()]).nullable().optional(),
  saTolerance: z.number().nonnegative().nullable().optional().default(0),
})

// Homework Management Validators
export const createHomeworkSchema = z.object({
  lessonId: z.string().optional().default('00000000-0000-0000-0000-000000000000'),
  classId: z.string().optional().nullable(),
  title: z.string().min(1, 'Homework title is required'),
  pdfPath: z.string().optional().default('Homework_Attachment.pdf'),
  durationMinutes: z.number().int().positive().optional().default(60),
  passScore: z.number().nonnegative().optional().default(5),
  maxScore: z.number().positive().optional().default(10),
  isPublished: z.boolean().optional().default(true),
  questions: z.array(questionInputSchema).min(1, 'At least one question is required'),
  deadline: z.string().nullable().optional(),
  maxAttempts: z.number().int().nonnegative().nullable().optional(),
  type: z.enum(['PRACTICE', 'EXAM']).optional().default('PRACTICE'),
  maxViolations: z.number().int().positive().nullable().optional(),
})

export const updateHomeworkSchema = z.object({
  homeworkId: z.string().uuid('Invalid Homework ID'),
  lessonId: z.string().uuid('Invalid Lesson ID').optional().nullable(),
  title: z.string().min(1).optional(),
  pdfPath: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  passScore: z.number().nonnegative().optional(),
  maxScore: z.number().positive().optional(),
  isPublished: z.boolean().optional(),
  questions: z.array(questionInputSchema).optional(),
  deadline: z.string().nullable().optional(),
  maxAttempts: z.number().int().nonnegative().nullable().optional(),
  type: z.enum(['PRACTICE', 'EXAM']).optional(),
  maxViolations: z.number().int().positive().nullable().optional(),
})

export const deleteHomeworkSchema = z.object({
  homeworkId: z.string().uuid('Invalid Homework ID'),
})

// Homework Submission Validator
export const submittedAnswerItemSchema = z.object({
  questionId: z.string().uuid('Invalid Question ID'),
  givenAnswer: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('MULTIPLE_CHOICE'),
      value: z.enum(['A', 'B', 'C', 'D']).or(z.literal('')).nullable().optional(),
    }),
    z.object({
      type: z.literal('TRUE_FALSE'),
      value: z.object({
        a: z.boolean().optional(),
        b: z.boolean().optional(),
        c: z.boolean().optional(),
        d: z.boolean().optional(),
        s1: z.boolean().optional(),
        s2: z.boolean().optional(),
        s3: z.boolean().optional(),
        s4: z.boolean().optional(),
      }),
    }),
    z.object({
      type: z.literal('SHORT_ANSWER'),
      value: z.union([z.number(), z.string()]),
    }),
  ]),
})

export const submitHomeworkSchema = z.object({
  homeworkId: z.string().uuid('Invalid Homework ID'),
  answers: z.array(submittedAnswerItemSchema),
  durationSecondsTaken: z.number().int().nonnegative().optional(),
  sessionToken: z.string().optional(),
})
