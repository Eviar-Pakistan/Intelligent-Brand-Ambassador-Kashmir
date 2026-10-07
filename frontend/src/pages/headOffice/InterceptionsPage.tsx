import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Search, Users } from 'lucide-react'
import { Button, Card, PageHeader, TableScroll, cn } from '../../components/ui'
import {
  downloadInterceptionsExcel,
  fetchHoUserInterceptions,
  formatInterceptionWhen,
  type HoInterceptionsSummary,
  type HoUserInterception,
} from '../../lib/userInterceptionsHoApi'

type DatePreset = 'today' | 'last7' | 'month'

function dateInputValue(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function rangeForPreset(preset: DatePreset): { from: string; to: string } {
  const today = startOfLocalDay(new Date())
  if (preset === 'today') {
    const v = dateInputValue(today)
    return { from: v, to: v }
  }
  if (preset === 'last7') {
    const from = new Date(today)
    from.setDate(from.getDate() - 6)
    return { from: dateInputValue(from), to: dateInputValue(today) }
  }
  const from = new Date(today.getFullYear(), today.getMonth(), 1)
  return { from: dateInputValue(from), to: dateInputValue(today) }
}

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'month', label: 'This month' },
]

export function InterceptionsPage() {
  const initial = rangeForPreset('today')
  const [preset, setPreset] = useState<DatePreset | 'custom'>('today')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [q, setQ] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [switchedOnly, setSwitchedOnly] = useState(false)
  const [rows, setRows] = useState<HoUserInterception[]>([])
  const [summary, setSummary] = useState<HoInterceptionsSummary>({
    totalInterceptions: 0,
    switchedToKashmir: 0,
    conversionPct: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchHoUserInterceptions({
        from,
        to,
        q,
        switchedOnly,
      })
      setRows(data.results)
      setSummary(data.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load interceptions.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [from, to, q, switchedOnly])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const t = window.setTimeout(() => setQ(searchInput.trim()), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  function applyPreset(next: DatePreset) {
    const range = rangeForPreset(next)
    setPreset(next)
    setFrom(range.from)
    setTo(range.to)
  }

  async function handleDownload() {
    if (!rows.length) return
    setDownloading(true)
    try {
      await downloadInterceptionsExcel(rows, { from, to })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.')
    } finally {
      setDownloading(false)
    }
  }

  const emptyLabel = useMemo(() => {
    if (loading) return 'Loading…'
    if (error) return error
    if (switchedOnly) return 'No switched-to-Kashmir interceptions in this range.'
    return 'No interceptions in this date range.'
  }, [loading, error, switchedOnly])

  return (
    <div className="space-y-5">
      <PageHeader
        title="User interceptions"
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={!rows.length || downloading}
            onClick={() => void handleDownload()}
          >
            <Download size={16} className="mr-1.5" />
            {downloading ? 'Downloading…' : 'Download'}
          </Button>
        }
      />

      <Card className="bg-[#faf6ee]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-semibold transition',
                  preset === p.id
                    ? 'bg-navy-900 text-white shadow-sm'
                    : 'bg-white text-slate-600 ring-1 ring-black/5 hover:bg-slate-50',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">From</span>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => {
                  setPreset('custom')
                  setFrom(e.target.value)
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">To</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => {
                  setPreset('custom')
                  setTo(e.target.value)
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
            </label>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Total interceptions
          </div>
          <div className="mt-2 text-3xl font-bold text-navy-900">
            {summary.totalInterceptions.toLocaleString()}
          </div>
        </Card>
        <Card>
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Switched to Kashmir
          </div>
          <div className="mt-2 text-3xl font-bold text-brand-600">
            {summary.switchedToKashmir.toLocaleString()}
          </div>
        </Card>
        <Card>
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Conversion
          </div>
          <div className="mt-2 text-3xl font-bold text-navy-900">{summary.conversionPct}%</div>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
            />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search BA, store, shopper…"
              className="w-full rounded-xl border border-slate-200 bg-[#faf6ee] py-2.5 pr-3 pl-9 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/15"
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={switchedOnly}
              onChange={(e) => setSwitchedOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Switched to Kashmir only
          </label>
        </div>

        <TableScroll>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs tracking-wide text-slate-500 uppercase">
                <th className="px-3 py-3 font-semibold">When</th>
                <th className="px-3 py-3 font-semibold">BA</th>
                <th className="px-3 py-3 font-semibold">Store</th>
                <th className="px-3 py-3 font-semibold">Shopper</th>
                <th className="px-3 py-3 font-semibold">Previous</th>
                <th className="px-3 py-3 font-semibold">Purchased</th>
                <th className="px-3 py-3 font-semibold">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                    <div className="inline-flex flex-col items-center gap-2">
                      <Users size={22} className="text-slate-300" />
                      {emptyLabel}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 align-top hover:bg-slate-50/60">
                    <td className="px-3 py-3 whitespace-nowrap text-slate-600">
                      {formatInterceptionWhen(r.createdAt)}
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-900">{r.baName || '—'}</td>
                    <td className="px-3 py-3 text-slate-700">{r.storeName || '—'}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{r.name}</div>
                      {(r.contact || r.cityArea) && (
                        <div className="mt-0.5 text-xs text-slate-500">
                          {[r.contact, r.cityArea].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      <div>{r.previousBrand || '—'}</div>
                      {r.previousSku ? (
                        <div className="mt-0.5 text-xs text-slate-500">{r.previousSku}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-slate-900">{r.currentSku || '—'}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          {r.status}
                        </span>
                        {r.switched ? (
                          <span className="inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                            Switched
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="max-w-[220px] px-3 py-3 text-slate-600">
                      <span className="line-clamp-3">{r.feedback || '—'}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>
    </div>
  )
}
