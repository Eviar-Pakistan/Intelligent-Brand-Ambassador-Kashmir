import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, PageHeader, SearchInput, cn } from '../../components/ui'
import { fetchMisAuditLogs, type MisAuditLogRow } from '../../lib/misApi'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoIso(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function monthStartIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const ACTION_FILTERS: { id: string; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'edit_daily_report', label: 'Daily reports' },
  { id: 'edit_attendance', label: 'Attendance' },
  { id: 'edit_ambassador', label: 'Ambassadors' },
  { id: 'edit_store', label: 'Stores' },
  { id: 'edit_supervisor_stores', label: 'Supervisors' },
  { id: 'swap_bas', label: 'Deployment' },
]

export function MisAuditLogPage() {
  const [preset, setPreset] = useState<'today' | '7d' | 'month'>('7d')
  const [from, setFrom] = useState(daysAgoIso(6))
  const [to, setTo] = useState(todayIso())
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const [rows, setRows] = useState<MisAuditLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)

  const applyPreset = useCallback((p: 'today' | '7d' | 'month') => {
    setPreset(p)
    if (p === 'today') {
      setFrom(todayIso())
      setTo(todayIso())
    } else if (p === '7d') {
      setFrom(daysAgoIso(6))
      setTo(todayIso())
    } else {
      setFrom(monthStartIso())
      setTo(todayIso())
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchMisAuditLogs({ from, to, q: q.trim() || undefined, action: action || undefined }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load audit log')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [from, to, q, action])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => rows, [rows])

  return (
    <div className="space-y-5">
      <PageHeader
        title="MIS audit log"
        description="Actions performed by MIS users — report edits, attendance changes, store and deployment updates."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['today', 'Today'],
              ['7d', 'Last 7 days'],
              ['month', 'This month'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => applyPreset(id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold',
                preset === id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600',
              )}
            >
              {label}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-1.5 text-xs text-slate-500">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPreset('7d')
                setFrom(e.target.value)
              }}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPreset('7d')
                setTo(e.target.value)
              }}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
            />
          </label>
        </div>
        <SearchInput
          placeholder="Search MIS user, summary…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          {ACTION_FILTERS.map((f) => (
            <button
              key={f.id || 'all'}
              type="button"
              onClick={() => setAction(f.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold',
                action === f.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">MIS user</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No MIS actions in this range.
                  </td>
                </tr>
              )}
              {filtered.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatWhen(row.when)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.misUser || '—'}</div>
                      <div className="text-xs text-slate-400">{row.misEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {row.actionLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.summary}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="text-xs font-semibold text-brand-700"
                        onClick={() => setOpenId(openId === row.id ? null : row.id)}
                      >
                        {openId === row.id ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {openId === row.id && (
                    <tr className="border-t border-slate-50 bg-slate-50/80">
                      <td colSpan={5} className="px-4 py-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="mb-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                              Before
                            </div>
                            <pre className="max-h-56 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] text-emerald-100">
                              {JSON.stringify(row.before ?? {}, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="mb-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                              After
                            </div>
                            <pre className="max-h-56 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] text-amber-100">
                              {JSON.stringify(row.after ?? {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
