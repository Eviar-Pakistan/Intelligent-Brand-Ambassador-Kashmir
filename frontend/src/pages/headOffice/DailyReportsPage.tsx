import { useEffect, useMemo, useRef, useState } from 'react'
import { FileClock } from 'lucide-react'
import { Button, Card, PageHeader, StatusBadge } from '../../components/ui'
import {
  fetchDailyReports,
  formatReportWhen,
  type DailyReportBaCard,
  type DailyReportRow,
} from '../../lib/earlyCheckoutApi'
import {
  competitiveFields,
  DEFAULT_OTHER_BRANDS,
  gheeSalesFields,
  interceptionFields,
  oilSalesFields,
  stockGheeFields,
  stockOilFields,
  stockWaadiFields,
  waadiSalesFields,
  whyNotFields,
  type FieldDef,
} from '../../lib/baReport'

type FlatReport = DailyReportRow & {
  baId: string
  baName: string
  baCode: string
  baCity: string
}

const STOCK_SECTIONS: { title: string; fields: FieldDef[] }[] = [
  { title: 'Kashmir Cooking Oil', fields: stockOilFields },
  { title: 'Kashmir Banaspati', fields: stockGheeFields },
  { title: 'Waadi Banaspati', fields: stockWaadiFields },
]

const SALES_SECTIONS: { title: string; fields: FieldDef[] }[] = [
  { title: 'Interceptions', fields: interceptionFields },
  { title: 'Competitive User', fields: competitiveFields },
  { title: 'Why Not Kashmir', fields: whyNotFields },
  { title: 'Kashmir Cooking Oil', fields: oilSalesFields },
  { title: 'Kashmir Banaspati', fields: gheeSalesFields },
  { title: 'Waadi Banaspati', fields: waadiSalesFields },
]

const STOCK_FIELDS: FieldDef[] = STOCK_SECTIONS.flatMap((s) => s.fields)
const SALES_FIELDS: FieldDef[] = SALES_SECTIONS.flatMap((s) => s.fields)

const LABEL_BY_KEY = Object.fromEntries(
  [...STOCK_FIELDS, ...SALES_FIELDS].map((f) => [f.key, f.label]),
) as Record<string, string>

function labelFor(key: string) {
  return LABEL_BY_KEY[key] || key
}

function flattenCards(cards: DailyReportBaCard[]): FlatReport[] {
  const rows: FlatReport[] = []
  for (const ba of cards) {
    for (const r of ba.reports) {
      rows.push({
        ...r,
        baId: ba.baId,
        baName: ba.baName,
        baCode: ba.baCode,
        baCity: ba.city || r.city || '',
      })
    }
  }
  return rows.sort((a, b) => {
    const ta = new Date(a.checkedOutAt || a.submittedAt || 0).getTime()
    const tb = new Date(b.checkedOutAt || b.submittedAt || 0).getTime()
    return tb - ta
  })
}

type ValueRow = { key: string; label: string; value: string }
type GroupedSection = { title: string; rows: ValueRow[] }

function rowsForFields(
  data: Record<string, string> | null | undefined,
  fields: FieldDef[],
): ValueRow[] {
  const map = data || {}
  return fields
    .map((f) => ({
      key: f.key,
      label: f.label,
      value: map[f.key] != null && map[f.key] !== '' ? String(map[f.key]) : null,
    }))
    .filter((r): r is ValueRow => r.value != null)
}

function stockGroups(report: DailyReportRow): GroupedSection[] {
  const stock = report.stock || {}
  const groups = STOCK_SECTIONS.map((s) => ({
    title: s.title,
    rows: rowsForFields(stock, s.fields),
  })).filter((g) => g.rows.length > 0)

  if (groups.length) return groups

  const leftover = Object.entries(stock)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => ({ key: k, label: labelFor(k), value: String(v) }))
  return leftover.length ? [{ title: 'Stock', rows: leftover }] : []
}

function salesGroups(report: DailyReportRow): GroupedSection[] {
  const sales = report.sales || {}
  const groups = SALES_SECTIONS.map((s) => ({
    title: s.title,
    rows: rowsForFields(sales, s.fields),
  })).filter((g) => g.rows.length > 0)

  if (groups.length) return groups

  const leftover = Object.entries(sales)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => ({ key: k, label: labelFor(k), value: String(v) }))
  return leftover.length ? [{ title: 'Sales', rows: leftover }] : []
}

function competitorRows(report: DailyReportRow) {
  const brands = (report.otherBrands || []).filter((b) => b.name || b.price)
  if (brands.length) {
    return brands.map((b, i) => ({
      key: b.id || `${b.name}-${i}`,
      label: b.name || '—',
      value: b.price ? `Rs. ${b.price}` : '—',
    }))
  }
  // Show the default competitor list as empty placeholders when no prices submitted
  if (report.hasFieldReport) {
    return DEFAULT_OTHER_BRANDS.map((b) => ({
      key: b.id,
      label: b.name,
      value: '—',
    }))
  }
  return []
}

function ReportSectionPanel({
  title,
  rows,
  emptyLabel = 'Nothing submitted.',
}: {
  title: string
  rows: ValueRow[]
  emptyLabel?: string
}) {
  return (
    <div className="flex min-h-[12rem] flex-col rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h4 className="mb-3 text-[11px] font-bold tracking-wide text-slate-500 uppercase">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex items-start justify-between gap-3 border-b border-slate-50 pb-1.5 last:border-0">
              <span className="min-w-0 text-slate-600">{r.label}</span>
              <span className="shrink-0 font-medium text-slate-900">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function GroupedReportPanel({
  title,
  groups,
  emptyLabel = 'Nothing submitted.',
}: {
  title: string
  groups: GroupedSection[]
  emptyLabel?: string
}) {
  return (
    <div className="flex min-h-[12rem] flex-col rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h4 className="mb-3 text-[11px] font-bold tracking-wide text-slate-500 uppercase">{title}</h4>
      {groups.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1 text-sm">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="mb-1.5 text-[10px] font-bold tracking-wide text-brand-700 uppercase">
                {g.title}
              </div>
              <ul className="space-y-2">
                {g.rows.map((r) => (
                  <li
                    key={r.key}
                    className="flex items-start justify-between gap-3 border-b border-slate-50 pb-1.5 last:border-0"
                  >
                    <span className="min-w-0 text-slate-600">{r.label}</span>
                    <span className="shrink-0 font-medium text-slate-900">{r.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CheckoutReportCard({
  report,
  expanded,
  onToggle,
}: {
  report: FlatReport
  expanded: boolean
  onToggle: () => void
}) {
  const when = formatReportWhen(report.checkedOutAt || report.submittedAt)
  const source =
    report.source === 'excel'
      ? 'Excel'
      : report.source === 'manual'
        ? 'Checkout'
        : report.hasFieldReport
          ? 'Checkout'
          : 'Check-out only'
  const stock = stockGroups(report)
  const sales = salesGroups(report)
  const competitors = competitorRows(report)

  return (
    <Card padding={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-5">
        <Meta label="BA" value={report.baName} />
        <Meta label="Store" value={report.storeName || '—'} />
        <Meta label="City" value={report.baCity || report.city || '—'} />
        <Meta label="When" value={when} />
        <Meta label="Source" value={source} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {report.isEarlyCheckout && <StatusBadge status="Incomplete" />}
          {report.hasFieldReport && <StatusBadge status="Submitted" />}
          <button
            type="button"
            onClick={onToggle}
            className="text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-5">
          {report.earlyLeaveReason && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-100">
              Early leave · {report.earlyLeaveReason}
            </p>
          )}
          {!report.hasFieldReport ? (
            <p className="text-sm text-slate-500">
              Checked out without a field report. Stock, sales, and competitor sections appear after
              the BA completes the checkout forms.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-3">
              <GroupedReportPanel title="Stock report" groups={stock} />
              <GroupedReportPanel title="Daily sales" groups={sales} />
              <ReportSectionPanel title="Competitor data" rows={competitors} />
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">{label}</div>
      <div className="truncate text-sm font-medium text-slate-900">{value}</div>
    </div>
  )
}

export function DailyReportsPage() {
  const [cards, setCards] = useState<DailyReportBaCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const didAutoExpand = useRef(false)

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      setCards(await fetchDailyReports())
      if (!opts?.silent) setError(null)
    } catch (err) {
      if (!opts?.silent) {
        setError(err instanceof Error ? err.message : 'Could not load daily reports')
        setCards([])
      }
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      void load({ silent: true })
    }, 30_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void load({ silent: true })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const filtered = useMemo(() => flattenCards(cards), [cards])

  // Auto-expand once when reports first load — do not re-open after the user hides.
  useEffect(() => {
    if (didAutoExpand.current || !filtered.length) return
    const prefer = filtered.find((r) => r.hasFieldReport) ?? filtered[0]
    if (!prefer) return
    didAutoExpand.current = true
    setExpandedIds(new Set([prefer.id]))
  }, [filtered])

  function toggle(id: string) {
    didAutoExpand.current = true
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="BA daily reports"
        description="Stock, daily sales, and competitor data from BA check-out (early or on time)"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <Card>
          <p className="text-sm text-slate-500">Loading daily reports…</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileClock className="text-slate-300" size={40} strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium text-slate-700">No reports yet</p>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              When a BA checks out, all reports are shown here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <CheckoutReportCard
              key={r.id}
              report={r}
              expanded={expandedIds.has(r.id)}
              onToggle={() => toggle(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
