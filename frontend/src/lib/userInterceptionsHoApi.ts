import { apiRequest, isApiAuthenticated } from './api'

export type HoUserInterception = {
  id: number
  createdAt: string | null
  status: 'Productive' | 'Trialist' | 'Non-productive' | string
  switched: boolean
  baName: string
  ambassadorId: number | null
  storeId: number | null
  storeName: string
  name: string
  contact: string
  cityArea: string
  previousBrand: string
  previousSku: string
  currentSku: string
  feedback: string
}

export type HoInterceptionsSummary = {
  totalInterceptions: number
  switchedToKashmir: number
  conversionPct: number
}

export type HoInterceptionsResponse = {
  from: string
  to: string
  summary: HoInterceptionsSummary
  results: HoUserInterception[]
  count: number
}

export async function fetchHoUserInterceptions(params: {
  from: string
  to: string
  q?: string
  switchedOnly?: boolean
}): Promise<HoInterceptionsResponse> {
  if (!isApiAuthenticated()) {
    return {
      from: params.from,
      to: params.to,
      summary: { totalInterceptions: 0, switchedToKashmir: 0, conversionPct: 0 },
      results: [],
      count: 0,
    }
  }
  const qs = new URLSearchParams()
  qs.set('from', params.from)
  qs.set('to', params.to)
  if (params.q?.trim()) qs.set('q', params.q.trim())
  if (params.switchedOnly) qs.set('switched', '1')
  return apiRequest<HoInterceptionsResponse>(`/api/user-interceptions/?${qs}`)
}

export function formatInterceptionWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-PK', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export async function downloadInterceptionsExcel(
  rows: HoUserInterception[],
  opts: { from: string; to: string },
) {
  const XLSX = await import('xlsx')
  const sheetRows = rows.map((r) => ({
    When: formatInterceptionWhen(r.createdAt),
    BA: r.baName,
    Store: r.storeName,
    Shopper: r.name,
    Contact: r.contact,
    'City / Area': r.cityArea,
    'Previous brand': r.previousBrand,
    'Previous SKU': r.previousSku,
    'Purchased SKU': r.currentSku,
    Status: r.status,
    Switched: r.switched ? 'Yes' : 'No',
    Feedback: r.feedback,
  }))
  const ws = XLSX.utils.json_to_sheet(sheetRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Interceptions')
  const name =
    opts.from === opts.to
      ? `interceptions_${opts.from}.xlsx`
      : `interceptions_${opts.from}_to_${opts.to}.xlsx`
  XLSX.writeFile(wb, name)
}
