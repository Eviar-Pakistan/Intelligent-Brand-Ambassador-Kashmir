/**
 * Head Office AI Optimization — weekly analysis (one run per completed week).
 */

import { apiRequest } from './api'

export type AiRecommendation = {
  id: number
  pattern: string
  store: string
  store_id: number | null
  sales: number
  interceptions: number
  productive_calls: number
  achievement_pct: number
  attendance_pct: number
  missing_checkouts: number
  supervisor_visits: number
  top_category: string
  trialist: number
  non_productive: number
  note: string
  action: string
  severity: 'high' | 'medium' | 'low' | string
}

export type AiOptimizationResponse = {
  week_start: string
  week_end: string
  week_label: string
  can_run: boolean
  message: string | null
  recommendations: AiRecommendation[]
  created_at: string | null
  model_name?: string
  detail?: string
}

export async function fetchAiOptimization(): Promise<AiOptimizationResponse> {
  return apiRequest<AiOptimizationResponse>('/api/ho/ai-optimization/')
}

export async function runAiOptimization(): Promise<AiOptimizationResponse> {
  return apiRequest<AiOptimizationResponse>('/api/ho/ai-optimization/run/', {
    method: 'POST',
    body: {},
  })
}

/** Build optional context line under the 4 primary stats. */
export function recommendationContextLine(r: AiRecommendation): string | null {
  const parts: string[] = []
  if (r.note) parts.push(r.note)
  if (r.attendance_pct > 0 || r.missing_checkouts > 0) {
    parts.push(
      `Attendance ${r.attendance_pct}%` +
        (r.missing_checkouts > 0 ? ` · ${r.missing_checkouts} missing checkout${r.missing_checkouts === 1 ? '' : 's'}` : ''),
    )
  }
  if (r.supervisor_visits > 0) parts.push(`${r.supervisor_visits} supervisor visit${r.supervisor_visits === 1 ? '' : 's'}`)
  if (r.top_category) parts.push(`Top category: ${r.top_category}`)
  if (r.trialist > 0 || r.non_productive > 0) {
    parts.push(`Trialist ${r.trialist} · Non-productive ${r.non_productive}`)
  }
  // Dedupe if note already covered the same text
  const unique = [...new Set(parts.filter(Boolean))]
  return unique.length ? unique.join(' · ') : null
}
