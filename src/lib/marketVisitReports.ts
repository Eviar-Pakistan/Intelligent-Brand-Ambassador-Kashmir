import { useSyncExternalStore } from 'react'

/**
 * Market visit reports filed by supervisors (and Head Office) live in this browser.
 * Submitting a report makes it visible in the Head Office inbox immediately.
 */

export const VISIT_CHANNELS = ['GT', 'MT', 'HoReCa'] as const
export type VisitChannel = (typeof VISIT_CHANNELS)[number]

export const COVERAGE_SEGMENTS = [
  'Karyana/General Store',
  'OOH (Out of Home)',
  'LMT',
  'IMT',
  'Wholesale',
] as const

export const ASSESSMENT_PARAMETERS = [
  'Overall Market Demand',
  'Availability',
  'Distribution',
  'Retailer Confidence',
  'Competition Pressure',
  'Price Environment',
  'Growth Opportunity',
] as const

export const RATING_SCALE = [
  { value: 1, label: 'Very Poor' },
  { value: 2, label: 'Poor' },
  { value: 3, label: 'Average' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Excellent' },
] as const

export type Rating = (typeof RATING_SCALE)[number]['value']
export type Priority = 'High' | 'Medium' | 'Low'
export const PRIORITIES: Priority[] = ['High', 'Medium', 'Low']

export const OPPORTUNITY_CHANNELS = [
  'GT',
  'MT',
  'HoReCa',
  'Karyana',
  'OOH',
  'LMT',
  'IMT',
  'Wholesale',
] as const

export type CoverageRow = {
  segment: string
  planned: number | ''
  visited: number | ''
  remarks: string
}

export type AssessmentRow = {
  parameter: string
  rating: Rating | ''
  remarks: string
}

export type OpportunityRow = {
  opportunity: string
  channel: string
  potentialVolume: string
  priority: Priority | ''
  details: string
}

export type MarketVisitDraft = {
  employeeName: string
  designation: string
  regionArea: string
  marketTown: string
  channels: VisitChannel[]
  purposeOfVisit: string
  accompaniedBy: string
  distributorStockist: string
  coverage: CoverageRow[]
  assessment: AssessmentRow[]
  majorCompetitors: string
  doingBetter: string
  competitiveMovements: string
  potentialImpact: string
  opportunities: OpportunityRow[]
  keyLearnings: string
  keyChallenges: string
  businessInsight: string
  additionalComments: string
  reportedBy: string
  reportedDate: string
}

export type MarketVisitReport = MarketVisitDraft & {
  id: string
  supervisorId: string
  supervisorName: string
  filedBy: 'supervisor' | 'headOffice'
  submittedAt: string
  status: 'Submitted' | 'Reviewed'
  reviewedBy: string
  reviewedAt: string
}

const STORAGE_KEY = 'market-visit-reports-v1'

export function formatVisitDate(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDay(isoDate: string) {
  if (!isoDate) return '—'
  const d = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export function blankOpportunity(): OpportunityRow {
  return { opportunity: '', channel: '', potentialVolume: '', priority: '', details: '' }
}

export function emptyVisitDraft(): MarketVisitDraft {
  return {
    employeeName: '',
    designation: '',
    regionArea: '',
    marketTown: '',
    channels: [],
    purposeOfVisit: '',
    accompaniedBy: '',
    distributorStockist: '',
    coverage: COVERAGE_SEGMENTS.map((segment) => ({ segment, planned: '', visited: '', remarks: '' })),
    assessment: ASSESSMENT_PARAMETERS.map((parameter) => ({ parameter, rating: '', remarks: '' })),
    majorCompetitors: '',
    doingBetter: '',
    competitiveMovements: '',
    potentialImpact: '',
    opportunities: [blankOpportunity()],
    keyLearnings: '',
    keyChallenges: '',
    businessInsight: '',
    additionalComments: '',
    reportedBy: '',
    reportedDate: '',
  }
}

export function asCount(value: unknown): number | '' {
  if (value === '' || value === null || value === undefined) return ''
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return ''
  return Math.round(n)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function asRating(value: unknown): Rating | '' {
  const n = typeof value === 'number' ? value : Number(value)
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n
  return ''
}

function asPriority(value: unknown): Priority | '' {
  return value === 'High' || value === 'Medium' || value === 'Low' ? value : ''
}

export function coverPercent(planned: number | '', visited: number | ''): number {
  const p = planned === '' ? 0 : planned
  const v = visited === '' ? 0 : visited
  if (p <= 0) return 0
  return Math.round((v / p) * 100)
}

export function coverageTotals(rows: CoverageRow[]) {
  const planned = rows.reduce((sum, row) => sum + (row.planned === '' ? 0 : row.planned), 0)
  const visited = rows.reduce((sum, row) => sum + (row.visited === '' ? 0 : row.visited), 0)
  return { planned, visited, cover: coverPercent(planned, visited) }
}

export function assessmentAverage(rows: AssessmentRow[]) {
  const rated = rows.map((row) => row.rating).filter((n): n is Rating => n !== '')
  if (!rated.length) return null
  return Math.round((rated.reduce((sum, n) => sum + n, 0) / rated.length) * 10) / 10
}

export function ratingLabel(rating: Rating | '') {
  if (rating === '') return '—'
  const found = RATING_SCALE.find((item) => item.value === rating)
  return found ? `${found.value} · ${found.label}` : '—'
}

function opportunityFilled(row: OpportunityRow) {
  return Boolean(row.opportunity || row.channel || row.potentialVolume || row.priority || row.details)
}

export function filledOpportunities(rows: OpportunityRow[]) {
  return rows.filter(opportunityFilled)
}

function normalizeCoverage(raw: unknown): CoverageRow[] {
  const list = Array.isArray(raw) ? raw : []
  return COVERAGE_SEGMENTS.map((segment) => {
    const found = list.find(
      (row) => row && typeof row === 'object' && (row as CoverageRow).segment === segment,
    ) as Partial<CoverageRow> | undefined
    return {
      segment,
      planned: asCount(found?.planned),
      visited: asCount(found?.visited),
      remarks: asString(found?.remarks),
    }
  })
}

function normalizeAssessment(raw: unknown): AssessmentRow[] {
  const list = Array.isArray(raw) ? raw : []
  return ASSESSMENT_PARAMETERS.map((parameter) => {
    const found = list.find(
      (row) => row && typeof row === 'object' && (row as AssessmentRow).parameter === parameter,
    ) as Partial<AssessmentRow> | undefined
    return {
      parameter,
      rating: asRating(found?.rating),
      remarks: asString(found?.remarks),
    }
  })
}

function normalizeOpportunities(raw: unknown): OpportunityRow[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const item = row as Partial<OpportunityRow>
      return {
        opportunity: asString(item.opportunity),
        channel: asString(item.channel),
        potentialVolume: asString(item.potentialVolume),
        priority: asPriority(item.priority),
        details: asString(item.details),
      }
    })
}

function normalize(raw: unknown): MarketVisitReport | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<MarketVisitReport>
  if (typeof row.id !== 'string' || !row.id) return null
  const blank = emptyVisitDraft()
  const channels = Array.isArray(row.channels)
    ? VISIT_CHANNELS.filter((channel) => row.channels?.includes(channel))
    : []
  return {
    ...blank,
    id: row.id,
    supervisorId: asString(row.supervisorId),
    supervisorName: asString(row.supervisorName) || 'Supervisor',
    filedBy: row.filedBy === 'headOffice' ? 'headOffice' : 'supervisor',
    submittedAt: asString(row.submittedAt) || new Date().toISOString(),
    status: row.status === 'Reviewed' ? 'Reviewed' : 'Submitted',
    reviewedBy: asString(row.reviewedBy),
    reviewedAt: asString(row.reviewedAt),
    employeeName: asString(row.employeeName),
    designation: asString(row.designation),
    regionArea: asString(row.regionArea),
    marketTown: asString(row.marketTown),
    channels,
    purposeOfVisit: asString(row.purposeOfVisit),
    accompaniedBy: asString(row.accompaniedBy),
    distributorStockist: asString(row.distributorStockist),
    coverage: normalizeCoverage(row.coverage),
    assessment: normalizeAssessment(row.assessment),
    majorCompetitors: asString(row.majorCompetitors),
    doingBetter: asString(row.doingBetter),
    competitiveMovements: asString(row.competitiveMovements),
    potentialImpact: asString(row.potentialImpact),
    opportunities: normalizeOpportunities(row.opportunities),
    keyLearnings: asString(row.keyLearnings),
    keyChallenges: asString(row.keyChallenges),
    businessInsight: asString(row.businessInsight),
    additionalComments: asString(row.additionalComments),
    reportedBy: asString(row.reportedBy),
    reportedDate: asString(row.reportedDate),
  }
}

function load(): MarketVisitReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalize).filter((row): row is MarketVisitReport => row !== null)
  } catch {
    return []
  }
}

let reports = load()
const listeners = new Set<() => void>()

function commit(next: MarketVisitReport[]) {
  reports = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports))
  } catch {
    // keep the in-memory list for this session
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMarketVisitReports() {
  return useSyncExternalStore(subscribe, () => reports)
}

export function visitReportErrors(draft: MarketVisitDraft) {
  const errors: string[] = []
  if (!draft.employeeName.trim()) errors.push('Employee name is required.')
  if (!draft.marketTown.trim()) errors.push('Market or town visited is required.')
  if (draft.channels.length === 0) errors.push('Select at least one channel (GT, MT, or HoReCa).')
  if (!draft.purposeOfVisit.trim()) errors.push('Purpose of visit is required.')
  return errors
}

export function submitMarketVisitReport(
  meta: { supervisorId: string; supervisorName: string; filedBy: 'supervisor' | 'headOffice' },
  draft: MarketVisitDraft,
): MarketVisitReport {
  const created: MarketVisitReport = {
    ...draft,
    employeeName: draft.employeeName.trim(),
    designation: draft.designation.trim(),
    regionArea: draft.regionArea.trim(),
    marketTown: draft.marketTown.trim(),
    channels: VISIT_CHANNELS.filter((channel) => draft.channels.includes(channel)),
    purposeOfVisit: draft.purposeOfVisit.trim(),
    accompaniedBy: draft.accompaniedBy.trim(),
    distributorStockist: draft.distributorStockist.trim(),
    majorCompetitors: draft.majorCompetitors.trim(),
    doingBetter: draft.doingBetter.trim(),
    competitiveMovements: draft.competitiveMovements.trim(),
    potentialImpact: draft.potentialImpact.trim(),
    opportunities: filledOpportunities(draft.opportunities).map((row) => ({
      ...row,
      opportunity: row.opportunity.trim(),
      channel: row.channel.trim(),
      potentialVolume: row.potentialVolume.trim(),
      details: row.details.trim(),
    })),
    keyLearnings: draft.keyLearnings.trim(),
    keyChallenges: draft.keyChallenges.trim(),
    businessInsight: draft.businessInsight.trim(),
    additionalComments: draft.additionalComments.trim(),
    reportedBy: draft.reportedBy.trim(),
    coverage: normalizeCoverage(draft.coverage),
    assessment: normalizeAssessment(draft.assessment),
    id: `mvr-${Date.now().toString(36)}`,
    supervisorId: meta.supervisorId,
    supervisorName: meta.supervisorName,
    filedBy: meta.filedBy,
    submittedAt: new Date().toISOString(),
    status: 'Submitted',
    reviewedBy: '',
    reviewedAt: '',
  }
  commit([created, ...reports])
  return created
}

export function reviewMarketVisitReport(id: string, reviewedBy: string) {
  const now = new Date().toISOString()
  commit(
    reports.map((report) =>
      report.id === id
        ? {
            ...report,
            status: 'Reviewed',
            reviewedBy: reviewedBy.trim() || 'Head Office',
            reviewedAt: now,
          }
        : report,
    ),
  )
}
