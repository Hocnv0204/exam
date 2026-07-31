# Online Homework Management System - Supabase Backend

A production-ready, highly secure, scalable serverless backend for an **Online Homework Management System** built with **Supabase**, **PostgreSQL**, and **TypeScript Edge Functions**.

---

## Table of Contents

1. [Tech Stack & Architecture](#tech-stack--architecture)
2. [Project Structure](#project-structure)
3. [Database Schema & ERD](#database-schema--erd)
4. [Question Types & Grading Logic](#question-types--grading-logic)
5. [Security & Row Level Security (RLS)](#security--row-level-security-rls)
6. [Storage Configuration](#storage-configuration)
7. [Edge Functions & API Documentation](#edge-functions--api-documentation)
8. [Supabase CLI Commands & Local Setup](#supabase-cli-commands--local-setup)
9. [Deployment Guide](#deployment-guide)
10. [Testing Examples (cURL / Fetch)](#testing-examples-curl--fetch)

---

## Tech Stack & Architecture

- **Backend**: Supabase (PostgreSQL 15+, Deno Edge Functions, Supabase Auth, Supabase Storage)
- **Language**: TypeScript, SQL
- **Validation**: Zod
- **Architecture**: Clean Architecture / Repository & Service Pattern / Role-Based Access Control (RBAC)

### Default Administrator Credentials

- **Username**: `admin`
- **Password**: `admin`
- **Synthetic Email**: `admin@system.local`

---

## Project Structure

```
supabase/
├── config.toml
├── migrations/
│   ├── 20260801000000_initial_schema.sql
│   ├── 20260801000001_storage_setup.sql
│   └── 20260801000002_seed_admin.sql
├── functions/
│   ├── login/index.ts
│   ├── create-student/index.ts
│   ├── reset-password/index.ts
│   ├── create-class/index.ts
│   ├── create-chapter/index.ts
│   ├── create-lesson/index.ts
│   ├── create-homework/index.ts
│   ├── submit-homework/index.ts
│   ├── dashboard/index.ts
│   ├── statistics/index.ts
│   ├── student-history/index.ts
│   └── homework-detail/index.ts
├── shared/
│   ├── auth-middleware.ts
│   ├── grading-service.ts
│   ├── response-helper.ts
│   ├── supabase-client.ts
│   └── validators.ts
├── types/
│   └── database.types.ts
├── storage/
│   └── storage-policies.sql
└── sql/
    └── full_schema_export.sql
README.md
```

---

## Database Schema & ERD

```
[classes] 1 ─── N [profiles (STUDENT)]
   │
   1
   └─── N [chapters] 1 ─── N [lessons] 1 ─── N [homeworks] 1 ─── N [questions] 1 ─── 1 [question_answers]
                                                     │                                       ▲
                                                     1                                       │
                                                     └─── N [submission_answers] ────────────┘
                                                                 ▲
                                                                 │
                                                                 N
                                                         [submissions] N ─── 1 [profiles]
```

### Table Definitions

| Table | Description |
|---|---|
| `classes` | Contains student class groups. |
| `profiles` | User metadata linked to `auth.users(id)`. Stores role (`ADMIN` vs `STUDENT`) and assigned `class_id`. |
| `chapters` | Curriculum chapters bound to a class (`class_id`). |
| `lessons` | Lessons inside chapters (`chapter_id`). |
| `homeworks` | Homework assignments with `pdf_path`, `pass_score`, `max_score`, and `duration_minutes`. |
| `questions` | Questions inside a homework (`homework_id`, `question_number`, `question_type`, `points`). |
| `question_answers` | **Restricted Answer Key Storage**. Contains answers for Multiple Choice, 4-statement True/False, and Short Answer with tolerance. Protected with NO-STUDENT RLS. |
| `submissions` | Records completed student submissions (`total_score`, `correct_count`, `wrong_count`). |
| `submission_answers` | Records individual question responses, accuracy boolean, and points earned per submission. |

---

## Question Types & Grading Logic

1. **Multiple Choice** (`MULTIPLE_CHOICE`):
   - Correct answer stored in `mc_answer` (`'A'`, `'B'`, `'C'`, `'D'`).
   - Earns 100% of question points if chosen choice matches.
2. **True / False** (`TRUE_FALSE`):
   - 4 independent statements.
   - Answer key stored in `tf_answers` JSON (`{"s1": true, "s2": false, "s3": true, "s4": false}`).
   - Proportional partial credit calculated based on matching statements `(correctStatements / 4) * points`. Full score earned if all 4 match.
3. **Short Answer** (`SHORT_ANSWER`):
   - Numeric answer `sa_answer` with optional tolerance `sa_tolerance`.
   - Correct if `Math.abs(givenValue - expectedValue) <= tolerance`.

---

## Security & Row Level Security (RLS)

- **Answer Key Security**: The `question_answers` table is strictly accessible **ONLY by ADMIN or Service Role**. Student access is forbidden at the database level.
- **Class Isolation**: Students can only access chapters, lessons, homeworks, and storage PDFs assigned to their specific `class_id`.
- **Submission Guard**: Students can only select or insert their own submissions (`student_id = auth.uid()`).

---

## Storage Configuration

- Bucket Name: `pdf-files`
- File Size Limit: `50MB`
- Allowed MIME Types: `application/pdf`
- Signed URLs generated via `homework-detail` Edge Function for secure PDF access.

---

## Edge Functions & API Documentation

All responses follow a consistent format:
```json
{
  "success": true,
  "data": { ... }
}
```
In case of error:
```json
{
  "success": false,
  "error": "Error message",
  "details": null
}
```

### Endpoints Overview

| Function Name | Method | Auth Role | Description |
|---|---|---|---|
| `login` | `POST` | Public | Authenticates username & password. Returns JWT access token & profile. |
| `create-student` | `POST` / `PUT` / `DELETE` | `ADMIN` | Manage student user accounts & class assignments. |
| `reset-password` | `POST` | `ADMIN` | Reset student user password. |
| `create-class` | `GET` / `POST` / `PUT` / `DELETE` | `ADMIN` | Manage class groups. |
| `create-chapter` | `GET` / `POST` / `PUT` / `DELETE` | `ADMIN` | Manage chapters within a class. |
| `create-lesson` | `GET` / `POST` / `PUT` / `DELETE` | `ADMIN` | Manage lessons within a chapter. |
| `create-homework` | `POST` / `PUT` / `DELETE` | `ADMIN` | Create homework, upload PDF path, set questions & secure answer keys. |
| `submit-homework` | `POST` | `STUDENT` | Submit answers, auto-grade on server, save submission, return review. |
| `dashboard` | `GET` | `ADMIN` | Overview metrics (students, classes, homeworks, recent submissions). |
| `statistics` | `GET` | `ADMIN` | Deep statistics per homework, student, or class. |
| `student-history` | `GET` | `STUDENT` / `ADMIN` | Submission history overview & detailed submission breakdown. |
| `homework-detail` | `GET` | `STUDENT` / `ADMIN` | Fetch homework details, signed PDF URL, and questions (sanitized for students). |

---

## Supabase CLI Commands & Local Setup

### Prerequisites
- [Docker Desktop](https://www.docker.com/) installed and running.
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed.

### 1. Initialize & Start Local Supabase
```bash
# Navigate to project root
cd f:/Project/Exam

# Start Supabase services (PostgreSQL, Auth, Storage, Edge Functions Deno engine)
supabase start
```

### 2. Apply Migrations & Seed Data
```bash
# Reset database and apply all migrations
supabase db reset
```

### 3. Run Edge Functions Locally
```bash
# Serve all Edge Functions locally
supabase functions serve --env-file ./supabase/.env.local
```

---

## Deployment Guide

### Deploy to Supabase Cloud

```bash
# 1. Login to Supabase CLI
supabase login

# 2. Link local project to Supabase Cloud Project
supabase link --project-ref <YOUR_SUPABASE_PROJECT_REF>

# 3. Push Database Migrations & RLS Policies
supabase db push

# 4. Deploy Storage Setup
supabase db execute --file ./supabase/storage/storage-policies.sql

# 5. Deploy all Edge Functions
supabase functions deploy login
supabase functions deploy create-student
supabase functions deploy reset-password
supabase functions deploy create-class
supabase functions deploy create-chapter
supabase functions deploy create-lesson
supabase functions deploy create-homework
supabase functions deploy submit-homework
supabase functions deploy dashboard
supabase functions deploy statistics
supabase functions deploy student-history
supabase functions deploy homework-detail
```

---

## Testing Examples (cURL / Fetch)

### 1. Login as Administrator
```bash
curl -X POST http://127.0.0.1:54321/functions/v1/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin"
  }'
```

### 2. Create Class (Admin)
```bash
curl -X POST http://127.0.0.1:54321/functions/v1/create-class \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Class 10A1",
    "description": "Advanced Mathematics Class"
  }'
```

### 3. Create Student (Admin)
```bash
curl -X POST http://127.0.0.1:54321/functions/v1/create-student \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "student01",
    "password": "password123",
    "fullName": "John Doe",
    "classId": "<CLASS_UUID>"
  }'
```

### 4. Create Homework with Questions & Answer Keys (Admin)
```bash
curl -X POST http://127.0.0.1:54321/functions/v1/create-homework \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "lessonId": "<LESSON_UUID>",
    "title": "Algebra Homework #1",
    "pdfPath": "homeworks/algebra_01.pdf",
    "durationMinutes": 45,
    "passScore": 5.0,
    "maxScore": 10.0,
    "questions": [
      {
        "questionNumber": 1,
        "questionType": "MULTIPLE_CHOICE",
        "prompt": "What is 2 + 2?",
        "points": 3.0,
        "mcAnswer": "A"
      },
      {
        "questionNumber": 2,
        "questionType": "TRUE_FALSE",
        "prompt": "Evaluate statements",
        "points": 4.0,
        "tfAnswers": { "s1": true, "s2": false, "s3": true, "s4": false }
      },
      {
        "questionNumber": 3,
        "questionType": "SHORT_ANSWER",
        "prompt": "Calculate pi value",
        "points": 3.0,
        "saAnswer": 3.14,
        "saTolerance": 0.01
      }
    ]
  }'
```

### 5. Login as Student
```bash
curl -X POST http://127.0.0.1:54321/functions/v1/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "student01",
    "password": "password123"
  }'
```

### 6. Submit Homework (Student)
```bash
curl -X POST http://127.0.0.1:54321/functions/v1/submit-homework \
  -H "Authorization: Bearer <STUDENT_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "homeworkId": "<HOMEWORK_UUID>",
    "answers": [
      {
        "questionId": "<QUESTION_1_UUID>",
        "givenAnswer": { "type": "MULTIPLE_CHOICE", "value": "A" }
      },
      {
        "questionId": "<QUESTION_2_UUID>",
        "givenAnswer": {
          "type": "TRUE_FALSE",
          "value": { "s1": true, "s2": false, "s3": true, "s4": false }
        }
      },
      {
        "questionId": "<QUESTION_3_UUID>",
        "givenAnswer": { "type": "SHORT_ANSWER", "value": 3.1415 }
      }
    ]
  }'
```

### 7. View Dashboard Statistics (Admin)
```bash
curl -X GET http://127.0.0.1:54321/functions/v1/dashboard \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
```
