import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { createQuestionAppealsHandler } from './handler.js'

serve(createQuestionAppealsHandler({ requireAuth, handleCors, jsonResponse, errorResponse }))
