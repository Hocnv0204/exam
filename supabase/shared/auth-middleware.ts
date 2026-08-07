import { createAuthClient, createServiceRoleClient } from './supabase-client.ts'
import type { UserRole } from '../types/database.types.ts'

export interface AuthenticatedUser {
  id: string
  email?: string
  username: string
  fullName: string
  role: UserRole
  classId: string | null
  classIds: string[]
}

export async function requireAuth(req: Request): Promise<{
  user: AuthenticatedUser
  supabaseClient: ReturnType<typeof createAuthClient>
  serviceRoleClient: ReturnType<typeof createServiceRoleClient>
}> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    throw new Error('Missing Authorization header')
  }

  const supabaseClient = createAuthClient(req)
  const serviceRoleClient = createServiceRoleClient()

  // Verify JWT user
  const { data: authData, error: authError } = await supabaseClient.auth.getUser()
  if (authError || !authData.user) {
    throw new Error('Unauthorized or invalid token')
  }

  const userId = authData.user.id

  // Retrieve User Profile using service role client to ensure profile data availability
  const { data: profile, error: profileError } = await serviceRoleClient
    .from('profiles')
    .select('id, username, full_name, role, class_id')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    throw new Error('User profile not found')
  }

  // Retrieve student classes
  let classIds: string[] = []
  if (profile.role === 'STUDENT') {
    const { data: stClasses } = await serviceRoleClient
      .from('student_classes')
      .select('class_id')
      .eq('student_id', userId)
    classIds = stClasses?.map((c) => c.class_id) || []
  }

  const user: AuthenticatedUser = {
    id: profile.id,
    email: authData.user.email,
    username: profile.username,
    fullName: profile.full_name,
    role: profile.role as UserRole,
    classId: profile.class_id || (classIds[0] || null),
    classIds,
  }

  return { user, supabaseClient, serviceRoleClient }
}

export async function requireAdmin(req: Request) {
  const context = await requireAuth(req)
  if (context.user.role !== 'ADMIN') {
    throw new Error('Forbidden: Admin access required')
  }
  return context
}

export async function requireStudent(req: Request) {
  const context = await requireAuth(req)
  if (context.user.role !== 'STUDENT') {
    throw new Error('Forbidden: Student access required')
  }
  return context
}
