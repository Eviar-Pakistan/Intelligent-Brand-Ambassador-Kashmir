/** Public shopper APIs (no JWT) — survey questions, consumer save, feedback. */

import { apiRequest } from './api'

export type ShopperSurveyQuestion = {
  id: number
  store: number | null
  store_name: string | null
  order: number
  text: string
  options: string[]
  is_active: boolean
}

export type ShopperConsumer = {
  id: number
  store: number
  store_name: string
  store_slug: string
  name: string
  phone: string
  consent: boolean
  answers: Record<string, string>
  feedback_rating: number | null
  feedback_comment: string
  created_at: string
}

const CONSUMER_KEY = 'shopper-consumer-id'

export function rememberShopperConsumerId(id: number) {
  try {
    sessionStorage.setItem(CONSUMER_KEY, String(id))
  } catch {
    // ignore
  }
}

export function getShopperConsumerId(): number | null {
  try {
    const raw = sessionStorage.getItem(CONSUMER_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export async function fetchShopperQuestions(storeSlug: string) {
  const qs = storeSlug ? `?store=${encodeURIComponent(storeSlug)}` : ''
  return apiRequest<ShopperSurveyQuestion[]>(`/api/shopper/questions/${qs}`, { auth: false })
}

export async function submitShopperSurvey(input: {
  storeSlug: string
  name: string
  phone: string
  consent: boolean
  answers: Record<string, string>
}) {
  const consumer = await apiRequest<ShopperConsumer>('/api/shopper/consumers/', {
    method: 'POST',
    auth: false,
    body: {
      store_slug: input.storeSlug,
      name: input.name.trim(),
      phone: input.phone.trim(),
      consent: input.consent,
      answers: input.answers,
    },
  })
  rememberShopperConsumerId(consumer.id)
  return consumer
}

export async function submitShopperFeedback(input: {
  consumerId: number
  rating: number
  comment?: string
}) {
  return apiRequest<ShopperConsumer>(`/api/shopper/consumers/${input.consumerId}/feedback/`, {
    method: 'PATCH',
    auth: false,
    body: {
      feedback_rating: input.rating,
      feedback_comment: input.comment ?? '',
    },
  })
}
