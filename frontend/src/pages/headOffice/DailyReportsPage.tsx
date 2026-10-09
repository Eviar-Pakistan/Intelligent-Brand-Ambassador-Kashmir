import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileClock, FileSpreadsheet } from 'lucide-react'
import { Button, Card, Modal, PageHeader, StatusBadge } from '../../components/ui'
import {
  downloadDailyReportsExcel,
  fetchDailyReports,
  formatReportWhen,
  latestReportDate,
  localDateIso,
  yesterdayReportDate,
  type DailyReportBaCard,
  type DailyReportRow,
} from '../../lib/earlyCheckoutApi'
import {
  competitiveFields,
  DEFAULT_OTHER_BRANDS,
  gheeSalesFields,
  interceptionFields,
  oilSalesFields,
  STOCK_OPTIONS,
  stockGheeFields,
  stockOilFields,
  stockWaadiFields,
  waadiSalesFields,
  whyNotFields,
  type FieldDef,
} from '../../lib/baReport'
import { misPatchDailyReport } from '../../lib/misApi'

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
  data: Record<string, string | number> | null | undefined,
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
  misEditable,
  onEdit,
}: {
  report: FlatReport
  expanded: boolean
  onToggle: () => void
  misEditable?: boolean
  onEdit?: () => void
}) {
  // Field reports: prefer submittedAt (created_at). Checkout on month shifts is often reused later.
  const when = formatReportWhen(
    report.hasFieldReport
      ? report.submittedAt || report.checkedOutAt
      : report.checkedOutAt || report.submittedAt,
  )
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
          {misEditable && report.fieldReportId && (
            <button
              type="button"
              onClick={onEdit}
              className="text-sm font-semibold text-rose-600 hover:text-rose-700"
            >
              Edit
            </button>
          )}
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

function MisEditReportModal({
  report,
  onClose,
  onSaved,
}: {
  report: FlatReport | null
  onClose: () => void
  onSaved: () => void
}) {
  const [stock, setStock] = useState<Record<string, string>>({})
  const [sales, setSales] = useState<Record<string, string>>({})
  const [otherBrands, setOtherBrands] = useState<{ id?: string; name?: string; price?: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!report) return
    setStock({ ...(report.stock || {}) })
    const s: Record<string, string> = {}
    for (const [k, v] of Object.entries(report.sales || {})) {
      s[k] = v == null ? '' : String(v)
    }
    setSales(s)
    setOtherBrands(
      Array.isArray(report.otherBrands) && report.otherBrands.length
        ? report.otherBrands.map((r, i) => ({
            id: r.id || String(i + 1),
            name: r.name || '',
            price: r.price || '',
          }))
        : DEFAULT_OTHER_BRANDS.map((r) => ({ ...r })),
    )
    setErr(null)
  }, [report])

  async function save() {
    if (!report?.fieldReportId) return
    setBusy(true)
    setErr(null)
    try {
      await misPatchDailyReport(report.fieldReportId, {
        stock,
        sales,
        otherBrands,
      })
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={!!report}
      onClose={onClose}
      size="xl"
      title={report ? `${report.baName} · ${report.storeName || 'Store'}` : 'Edit report'}
      footer={
        report ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {err ? <p className="mr-auto text-sm text-rose-600">{err}</p> : null}
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Close
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        ) : null
      }
    >
      {report && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{report.baCity || report.city || '—'}</span>
            <span>·</span>
            <span>{formatReportWhen(report.submittedAt || report.checkedOutAt)}</span>
            <span className="rounded-md bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-600">
              Editable (MIS)
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0 space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:p-4">
              <h4 className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                Stock report
              </h4>
              {STOCK_SECTIONS.map((section) => (
                <div key={section.title} className="space-y-2">
                  <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                    {section.title}
                  </p>
                  {section.fields.map((f) => (
                    <label key={f.key} className="block min-w-0 text-xs">
                      <span className="mb-1 block font-medium text-slate-700">{f.label}</span>
                      <select
                        value={stock[f.key] || ''}
                        onChange={(e) => setStock((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm leading-normal"
                      >
                        <option value="">—</option>
                        {STOCK_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div className="min-w-0 space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:p-4">
              <h4 className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                Daily sales
              </h4>
              {SALES_SECTIONS.map((section) => (
                <div key={section.title} className="space-y-2">
                  <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                    {section.title}
                  </p>
                  {section.fields.map((f) => (
                    <label key={f.key} className="block min-w-0 text-xs">
                      <span className="mb-1 block font-medium text-slate-700">{f.label}</span>
                      <input
                        value={sales[f.key] || ''}
                        onChange={(e) => setSales((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500"
                      />
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div className="min-w-0 space-y-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:p-4 md:col-span-2 xl:col-span-1">
              <h4 className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                Competitor data
              </h4>
              <div className="space-y-2">
                {otherBrands.map((row, idx) => (
                  <div key={row.id || idx} className="grid grid-cols-[1fr_7rem] gap-2">
                    <input
                      value={row.name || ''}
                      placeholder="Brand"
                      onChange={(e) =>
                        setOtherBrands((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)),
                        )
                      }
                      className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500"
                    />
                    <input
                      value={row.price || ''}
                      placeholder="Price"
                      onChange={(e) =>
                        setOtherBrands((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, price: e.target.value } : r)),
                        )
                      }
                      className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

type DownloadMode = 'today' | 'yesterday' | 'custom'

export function DailyReportsPage({ misEditable = false }: { misEditable?: boolean }) {
  const [cards, setCards] = useState<DailyReportBaCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<FlatReport | null>(null)
  const [search, setSearch] = useState('')
  const didAutoExpand = useRef(false)

  const [downloadOpen, setDownloadOpen] = useState(false)
  const [downloadMode, setDownloadMode] = useState<DownloadMode>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

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

  const filtered = useMemo(() => {
    const rows = flattenCards(cards)
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.baName.toLowerCase().includes(q) ||
        r.baCode.toLowerCase().includes(q) ||
        r.storeName.toLowerCase().includes(q),
    )
  }, [cards, search])

  // Auto-expand once when reports first load — do not re-open after the user hides.
  useEffect(() => {
    if (misEditable || didAutoExpand.current || !filtered.length) return
    const prefer = filtered.find((r) => r.hasFieldReport) ?? filtered[0]
    if (!prefer) return
    didAutoExpand.current = true
    setExpandedIds(new Set([prefer.id]))
  }, [filtered, misEditable])

  function toggle(id: string) {
    didAutoExpand.current = true
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const latestDate = useMemo(() => latestReportDate(cards), [cards])
  const yesterdayDate = useMemo(() => yesterdayReportDate(cards), [cards])

  async function runDownload() {
    setDownloadError(null)
    let from = ''
    let to = ''
    if (downloadMode === 'today') {
      if (!latestDate) {
        setDownloadError('No reports available to download yet.')
        return
      }
      from = latestDate
      to = latestDate
    } else if (downloadMode === 'yesterday') {
      from = yesterdayDate
      to = yesterdayDate
    } else {
      if (!customFrom || !customTo) {
        setDownloadError('Pick both From and To dates.')
        return
      }
      if (customFrom > customTo) {
        setDownloadError('From date must be on or before To date.')
        return
      }
      from = customFrom
      to = customTo
    }

    setDownloading(true)
    try {
      await downloadDailyReportsExcel(cards, from, to)
      setDownloadOpen(false)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="BA daily reports"
        description={
          misEditable
            ? 'Edit stock, sales, and competitor data for any BA report — changes are audit-logged.'
            : 'Stock, daily sales, and competitor data from BA check-out (early or on time)'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDownloadError(null)
                setDownloadMode('today')
                const today = localDateIso()
                setCustomFrom(latestDate || today)
                setCustomTo(latestDate || today)
                setDownloadOpen(true)
              }}
              disabled={loading}
            >
              <Download size={15} /> Download Excel
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />

      {misEditable && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by BA name…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
      )}

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
      ) : misEditable ? (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">BA</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{r.baName}</div>
                      <div className="text-xs text-slate-400">{r.baCode}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.storeName || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.baCity || r.city || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {formatReportWhen(r.submittedAt || r.checkedOutAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.source === 'excel' ? 'Excel' : r.hasFieldReport ? 'Checkout' : 'Anytime'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.fieldReportId ? (
                        <button
                          type="button"
                          className="text-sm font-semibold text-rose-600"
                          onClick={() => setEditing(r)}
                        >
                          Edit
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">No report</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

      <MisEditReportModal
        report={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load({ silent: true })}
      />

      <Modal
        open={downloadOpen}
        onClose={() => !downloading && setDownloadOpen(false)}
        title="Download daily reports"
      >
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            One Excel sheet per BA. Inside each sheet, reports are listed day by day.
          </p>

          <div className="space-y-2">
            <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Date filter
            </span>
            <div className="grid gap-2">
              {(
                [
                  [
                    'today',
                    'Today (latest day with reports)',
                    latestDate
                      ? `Uses ${latestDate} — latest date that has checkout/report data.`
                      : 'No report dates found yet.',
                  ],
                  [
                    'yesterday',
                    'Yesterday',
                    yesterdayDate,
                  ],
                  ['custom', 'Custom date range', 'Pick From and To dates inclusive.'],
                ] as const
              ).map(([mode, label, hint]) => (
                <label
                  key={mode}
                  className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5 ${
                    downloadMode === mode
                      ? 'border-brand-500 bg-brand-50/60'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="daily-report-download-mode"
                    className="mt-1"
                    checked={downloadMode === mode}
                    onChange={() => setDownloadMode(mode)}
                  />
                  <span>
                    <span className="block font-medium text-slate-900">{label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {downloadMode === 'custom' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  From
                </span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  To
                </span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                />
              </label>
            </div>
          )}

          {downloadError ? <p className="text-sm text-rose-600">{downloadError}</p> : null}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button onClick={() => void runDownload()} disabled={downloading}>
              <FileSpreadsheet size={15} />
              {downloading ? 'Preparing…' : 'Download Excel'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setDownloadOpen(false)}
              disabled={downloading}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
