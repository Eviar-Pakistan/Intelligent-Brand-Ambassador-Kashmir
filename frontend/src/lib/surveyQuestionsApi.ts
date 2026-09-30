/** Head Office CRUD for store-scoped shopper survey questions. */

import { apiRequest } from './api'

export type SurveyQuestion = {
  id: number
  store: number | null
  store_name: string | null
  store_city: string | null
  order: number
  text: string
  options: string[]
  is_active: boolean
  responses: number
  created_at: string
}

export async function listSurveyQuestions(storeId?: number | 'all') {
  const qs =
    storeId !== undefined && storeId !== 'all' ? `?store=${encodeURIComponent(String(storeId))}` : ''
  return apiRequest<SurveyQuestion[]>(`/api/survey-questions/${qs}`)
}

export async function createSurveyQuestion(input: {
  storeId: number
  text: string
  options: string[]
  isActive?: boolean
}) {
  return apiRequest<SurveyQuestion>('/api/survey-questions/', {
    method: 'POST',
    body: {
      store: input.storeId,
      text: input.text.trim(),
      options: input.options,
      is_active: input.isActive ?? true,
    },
  })
}

export async function deleteSurveyQuestion(id: number) {
  await apiRequest(`/api/survey-questions/${id}/`, { method: 'DELETE' })
}
