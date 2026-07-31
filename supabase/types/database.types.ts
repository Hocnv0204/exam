export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'ADMIN' | 'STUDENT'
export type QuestionType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER'

export interface TrueFalseStatementAnswer {
  statement1: boolean
  statement2: boolean
  statement3: boolean
  statement4: boolean
}

export interface TrueFalseStatementGiven {
  statement1?: boolean
  statement2?: boolean
  statement3?: boolean
  statement4?: boolean
}

export type GivenAnswerInput =
  | { type: 'MULTIPLE_CHOICE'; value: string }
  | { type: 'TRUE_FALSE'; value: TrueFalseStatementGiven }
  | { type: 'SHORT_ANSWER'; value: number }

export interface Database {
  public: {
    Tables: {
      classes: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          username: string
          full_name: string
          role: UserRole
          class_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          full_name: string
          role?: UserRole
          class_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          full_name?: string
          role?: UserRole
          class_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      chapters: {
        Row: {
          id: string
          class_id: string
          title: string
          order_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          class_id: string
          title: string
          order_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          class_id?: string
          title?: string
          order_index?: number
          created_at?: string
          updated_at?: string
        }
      }
      lessons: {
        Row: {
          id: string
          chapter_id: string
          title: string
          order_index: number
          content: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          chapter_id: string
          title: string
          order_index?: number
          content?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          chapter_id?: string
          title?: string
          order_index?: number
          content?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      homeworks: {
        Row: {
          id: string
          lesson_id: string
          title: string
          pdf_path: string
          duration_minutes: number
          pass_score: number
          max_score: number
          is_published: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lesson_id: string
          title: string
          pdf_path: string
          duration_minutes?: number
          pass_score?: number
          max_score?: number
          is_published?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lesson_id?: string
          title?: string
          pdf_path?: string
          duration_minutes?: number
          pass_score?: number
          max_score?: number
          is_published?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      questions: {
        Row: {
          id: string
          homework_id: string
          question_number: number
          question_type: QuestionType
          prompt: string
          points: number
          created_at: string
        }
        Insert: {
          id?: string
          homework_id: string
          question_number: number
          question_type: QuestionType
          prompt: string
          points?: number
          created_at?: string
        }
        Update: {
          id?: string
          homework_id?: string
          question_number?: number
          question_type?: QuestionType
          prompt?: string
          points?: number
          created_at?: string
        }
      }
      question_answers: {
        Row: {
          id: string
          question_id: string
          mc_answer: string | null
          tf_answers: Json | null
          sa_answer: number | null
          sa_tolerance: number | null
          created_at: string
        }
        Insert: {
          id?: string
          question_id: string
          mc_answer?: string | null
          tf_answers?: Json | null
          sa_answer?: number | null
          sa_tolerance?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          question_id?: string
          mc_answer?: string | null
          tf_answers?: Json | null
          sa_answer?: number | null
          sa_tolerance?: number | null
          created_at?: string
        }
      }
      submissions: {
        Row: {
          id: string
          homework_id: string
          student_id: string
          total_score: number
          max_score: number
          correct_count: number
          wrong_count: number
          submitted_at: string
        }
        Insert: {
          id?: string
          homework_id: string
          student_id: string
          total_score: number
          max_score: number
          correct_count: number
          wrong_count: number
          submitted_at?: string
        }
        Update: {
          id?: string
          homework_id?: string
          student_id?: string
          total_score?: number
          max_score?: number
          correct_count?: number
          wrong_count?: number
          submitted_at?: string
        }
      }
      submission_answers: {
        Row: {
          id: string
          submission_id: string
          question_id: string
          given_answer: Json
          is_correct: boolean
          score_earned: number
          created_at: string
        }
        Insert: {
          id?: string
          submission_id: string
          question_id: string
          given_answer: Json
          is_correct: boolean
          score_earned: number
          created_at?: string
        }
        Update: {
          id?: string
          submission_id?: string
          question_id?: string
          given_answer?: Json
          is_correct?: boolean
          score_earned?: number
          created_at?: string
        }
      }
    }
  }
}
