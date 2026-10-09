/**
 * Head Office daily reports: all BA check-outs + field reports.
 */

import { apiRequest, isApiAuthenticated } from './api'
import { readGeo } from './baAttendanceApi'

export type DailyReportRow = {
  id: string
  date: string | null
  day: string
  shift: string
  storeId: number | null
  storeName: string
  city: string
  checkedInAt: string | null
  checkedOutAt: string | null
  earlyLeaveReason: string | null
  isEarlyCheckout: boolean
  hasFieldReport: boolean
  fieldReportId: number | null
  source: 'excel' | 'manual' | string | null
  fileName: string | null
  stock: Record<string, string> | null
  sales: Record<string, string | number> | null
  otherBrands: { id?: string; name?: string; price?: string }[] | null
  submittedAt: string | null
}

export type DailyReportBaCard = {
  baId: string
  baName: string
  baCode: string
  city: string
  reportCount: number
  earlyCount: number
  fieldReportCount: number
  latestAt: string | null
  reports: DailyReportRow[]
}

export async function fetchDailyReports(): Promise<DailyReportBaCard[]> {
  if (!isApiAuthenticated()) return []
  const data = await apiRequest<{ results: DailyReportBaCard[] }>('/api/daily-reports/')
  return data.results ?? []
}

/** @deprecated use fetchDailyReports */
export async function fetchEarlyCheckoutReports(): Promise<DailyReportBaCard[]> {
  if (!isApiAuthenticated()) return []
  const data = await apiRequest<{ results: DailyReportBaCard[] }>('/api/early-checkouts/')
  return data.results ?? []
}

export type EarlyCheckoutBaCard = DailyReportBaCard
export type EarlyCheckoutReport = DailyReportRow

export function formatReportWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export async function submitBaDailyReportApi(input: {
  token: string
  stock?: Record<string, string>
  sales?: Record<string, string | number>
  otherBrands?: { id?: string; name?: string; price?: string }[]
  source?: 'excel' | 'manual'
  fileName?: string
  storeId?: number
  /** Applied when checkout is stamped on final report submit. */
  earlyLeaveReason?: string
}) {
  const geo = await readGeo()

  return apiRequest('/api/ba/daily-report/', {
    method: 'POST',
    auth: false,
    body: {
      token: input.token,
      stock: input.stock ?? {},
      sales: input.sales ?? {},
      other_brands: input.otherBrands ?? [],
      source: input.source ?? 'manual',
      file_name: input.fileName ?? '',
      ...geo,
      ...(input.storeId != null ? { store_id: input.storeId } : {}),
      ...(input.earlyLeaveReason?.trim()
        ? { early_leave_reason: input.earlyLeaveReason.trim() }
        : {}),
    },
  })
}

/** Local calendar YYYY-MM-DD. */
export function localDateIso(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function reportDateKey(r: DailyReportRow): string | null {
  if (r.date && /^\d{4}-\d{2}-\d{2}/.test(r.date)) return r.date.slice(0, 10)
  const iso = r.checkedOutAt || r.submittedAt
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return localDateIso(d)
}

/** Latest calendar date that has at least one report (for "Today" download). */
export function latestReportDate(cards: DailyReportBaCard[]): string | null {
  let best: string | null = null
  for (const card of cards) {
    for (const r of card.reports) {
      const key = reportDateKey(r)
      if (key && (!best || key > best)) best = key
    }
  }
  return best
}

/** Previous calendar day for a YYYY-MM-DD string (local). */
export function previousDateIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return localDateIso(dt)
}

/**
 * "Yesterday" for downloads: day before the latest report date when available,
 * otherwise calendar yesterday.
 */
export function yesterdayReportDate(cards: DailyReportBaCard[]): string {
  const latest = latestReportDate(cards)
  if (latest) return previousDateIso(latest)
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return localDateIso(d)
}

function excelSheetName(baCode: string, baName: string, used: Set<string>): string {
  const base = `${baCode || 'BA'} ${baName}`.replace(/[\\/?*[\]:]/g, ' ').trim() || 'BA'
  let name = base.slice(0, 31)
  let n = 2
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n})`
    name = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
    n += 1
  }
  used.add(name.toLowerCase())
  return name
}

/**
 * Excel download: one sheet per BA; within each sheet, reports day-by-day
 * for dates in [fromIso, toIso] inclusive (YYYY-MM-DD).
 */
export async function downloadDailyReportsExcel(
  cards: DailyReportBaCard[],
  fromIso: string,
  toIso: string,
) {
  const { stockSections, salesSections } = await import('./baReport')
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const usedNames = new Set<string>()

  const filtered = cards
    .map((card) => {
      const reports = card.reports
        .filter((r) => {
          const key = reportDateKey(r)
          return key != null && key >= fromIso && key <= toIso
        })
        .sort((a, b) => {
          const da = reportDateKey(a) || ''
          const db = reportDateKey(b) || ''
          return da.localeCompare(db)
        })
      return { ...card, reports }
    })
    .filter((c) => c.reports.length > 0)
    .sort((a, b) => a.baName.localeCompare(b.baName))

  if (!filtered.length) {
    const empty = XLSX.utils.aoa_to_sheet([
      ['No daily reports in the selected date range.'],
      ['From', fromIso],
      ['To', toIso],
    ])
    XLSX.utils.book_append_sheet(wb, empty, 'No reports')
  } else {
    for (const card of filtered) {
      const rows: (string | number)[][] = [
        ['BA Code', card.baCode],
        ['BA Name', card.baName],
        ['City', card.city],
        ['Range', `${fromIso} → ${toIso}`],
        [],
      ]

      // Group by day so each day is a clear block
      const byDay = new Map<string, DailyReportRow[]>()
      for (const r of card.reports) {
        const key = reportDateKey(r) || 'unknown'
        const list = byDay.get(key) ?? []
        list.push(r)
        byDay.set(key, list)
      }

      for (const day of [...byDay.keys()].sort()) {
        const dayReports = byDay.get(day) ?? []
        for (const report of dayReports) {
          rows.push(['Date', day])
          rows.push(['Day', report.day || ''])
          rows.push(['Store', report.storeName || ''])
          rows.push(['Store city', report.city || ''])
          rows.push(['Shift', report.shift || ''])
          rows.push(['Checked in', report.checkedInAt || ''])
          rows.push(['Checked out', report.checkedOutAt || ''])
          rows.push(['Source', report.source || ''])
          if (report.earlyLeaveReason) {
            rows.push(['Early leave reason', report.earlyLeaveReason])
          }
          rows.push([])
          rows.push(['Section', 'Item', 'Value'])

          if (!report.hasFieldReport) {
            rows.push(['—', 'No field report submitted for this day', ''])
          } else {
            const stock = report.stock || {}
            const sales = report.sales || {}
            for (const section of stockSections) {
              for (const field of section.fields) {
                rows.push([
                  `Stock – ${section.title}`,
                  field.label,
                  stock[field.key] ?? '',
                ])
              }
            }
            for (const section of salesSections) {
              for (const field of section.fields) {
                const val = sales[field.key]
                rows.push([
                  `Daily Sales – ${section.title}`,
                  field.label,
                  val == null || val === '' ? '' : val,
                ])
              }
            }
            const brands = report.otherBrands?.length
              ? report.otherBrands
              : [{ name: '', price: '' }]
            for (const brand of brands) {
              rows.push([
                'Other Brands',
                String(brand.name ?? ''),
                String(brand.price ?? ''),
              ])
            }
          }
          rows.push([])
          rows.push(['—', '—', '—'])
          rows.push([])
        }
      }

      const sheet = XLSX.utils.aoa_to_sheet(rows)
      sheet['!cols'] = [{ wch: 28 }, { wch: 42 }, { wch: 28 }]
      XLSX.utils.book_append_sheet(
        wb,
        sheet,
        excelSheetName(card.baCode, card.baName, usedNames),
      )
    }
  }

  const label =
    fromIso === toIso ? fromIso : `${fromIso}_to_${toIso}`
  XLSX.writeFile(wb, `BA_Daily_Reports_${label}.xlsx`)
}
