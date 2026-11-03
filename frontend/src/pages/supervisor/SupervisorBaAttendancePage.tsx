import { useEffect, useMemo, useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { Card, Modal, StatusBadge, TableScroll, cn } from '../../components/ui'
import {
  fetchSupervisorBaAttendance,
  type SupervisorAttendanceFilterStatus,
  type SupervisorBaAttendanceRow,
} from '../../lib/supervisorAttendanceApi'
import { usePortal } from './SupervisorPortal'

const MAX_RANGE_DAYS = 31

type StatusTab = 'all' | SupervisorAttendanceFilterStatus

const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'present', label: 'Present' },
  { id: 'on_shift', label: 'On shift' },
  { id: 'not_checked_in', label: 'Not checked in' },
  { id: 'absent', label: 'Absent' },
  { id: 'on_leave', label: 'On leave' },
]

function todayInput() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function daysBetween(from: string, to: string) {
  const a = parseIso(from)
  const b = parseIso(to)
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1
}

function formatDateLabel(iso: string, day: string) {
  try {
    const d = parseIso(iso)
    const label = d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    return { label, day }
  } catch {
    return { label: iso, day }
  }
}

function formatClock(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function mapsHref(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return null
  }
  return `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}`
}

function statusBadgeLabel(status: string) {
  switch (status) {
    case 'present':
      return 'Present'
    case 'on_shift':
      return 'On shift'
    case 'not_checked_in':
      return 'Not checked in'
    case 'absent':
      return 'Absent'
    case 'on_leave':
      return 'On leave'
    default:
      return status
  }
}

export function SupervisorBaAttendancePage() {
  const { supervisor, header, overviewMode } = usePortal(
    'BA Attendance',
    'check-in and check-out for your ambassadors',
  )

  const [from, setFrom] = useState(todayInput)
  const [to, setTo] = useState(todayInput)
  const [appliedFrom, setAppliedFrom] = useState(todayInput)
  const [appliedTo, setAppliedTo] = useState(todayInput)
  const [statusTab, setStatusTab] = useState<StatusTab>('all')
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<SupervisorBaAttendanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [rangeError, setRangeError] = useState<string | null>(null)

  useEffect(() => {
    if (!supervisor) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchSupervisorBaAttendance({
      mode: overviewMode,
      supervisorId: supervisor.id,
      from: appliedFrom,
      to: appliedTo,
    })
      .then((data) => {
        if (cancelled) return
        setRows(data.results || [])
      })
      .catch((err) => {
        if (cancelled) return
        setRows([])
        setError(err instanceof Error ? err.message : 'Could not load attendance')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supervisor, overviewMode, appliedFrom, appliedTo])

  const applyRange = () => {
    const span = daysBetween(from, to)
    if (span < 1) {
      setRangeError('End date must be on or after start date.')
      return
    }
    if (span > MAX_RANGE_DAYS) {
      setRangeError(`Date range cannot exceed ${MAX_RANGE_DAYS} days.`)
      return
    }
    setRangeError(null)
    setAppliedFrom(from)
    setAppliedTo(to)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusTab !== 'all' && r.filterStatus !== statusTab) return false
      if (!q) return true
      return (
        r.baName.toLowerCase().includes(q) ||
        r.baCode.toLowerCase().includes(q) ||
        r.storeName.toLowerCase().includes(q) ||
        r.storeCode.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q)
      )
    })
  }, [rows, statusTab, query])

  if (!supervisor) {
    return (
      <div className="space-y-5">
        {header}
        <Card>
          <p className="text-sm text-slate-500">Sign in to see BA attendance.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {header}

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-slate-600">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              />
            </label>
            <button
              type="button"
              onClick={applyRange}
              className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Apply
            </button>
            <span className="pb-2 text-xs text-slate-400">Max {MAX_RANGE_DAYS} days</span>
          </div>
          <div className="relative min-w-[220px] flex-1 lg:max-w-sm">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search BA, code or store..."
              className="w-full rounded-full border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>
        {rangeError ? <p className="mt-2 text-sm text-rose-600">{rangeError}</p> : null}

        <div className="mt-4 flex flex-wrap gap-1 rounded-full bg-slate-100 p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatusTab(t.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                statusTab === t.id
                  ? 'bg-white text-navy-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <Card padding={false}>
        {error ? (
          <p className="px-4 py-6 text-center text-sm text-rose-600">{error}</p>
        ) : loading ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Loading attendance…</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            No attendance rows for this selection.
          </p>
        ) : (
          <TableScroll minWidth={980}>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Ambassador</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Coverage details</th>
                  <th className="px-4 py-3">Check-in</th>
                  <th className="px-4 py-3">Check-out</th>
                  <th className="px-4 py-3">Report</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const { label, day } = formatDateLabel(row.date, row.day)
                  const inMap = mapsHref(row.checkInLat, row.checkInLng)
                  const outMap = mapsHref(row.checkOutLat, row.checkOutLng)
                  return (
                    <tr
                      key={`${row.date}-${row.baId}`}
                      className="border-t border-slate-100 align-top"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{label}</div>
                        <div className="text-xs text-slate-400">{day}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{row.baName}</div>
                        <div className="text-xs text-slate-400">{row.baCode || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[200px] truncate font-semibold text-slate-900">
                          {row.storeName || '—'}
                        </div>
                        <div className="max-w-[220px] truncate text-xs text-slate-400">
                          {[row.storeCode, row.city].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                        {row.shift || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold tabular-nums text-slate-900">
                          {formatClock(row.checkedInAt)}
                        </div>
                        {inMap ? (
                          <a
                            href={inMap}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                          >
                            <MapPin size={12} />
                            View on map
                          </a>
                        ) : null}
                        {row.checkInPhotoUrl ? (
                          <button
                            type="button"
                            onClick={() => setPhotoPreviewUrl(row.checkInPhotoUrl || null)}
                            className="mt-1.5 block overflow-hidden rounded-lg ring-1 ring-slate-200 hover:ring-brand-400"
                            title="View check-in photo"
                          >
                            <img
                              src={row.checkInPhotoUrl}
                              alt=""
                              className="h-10 w-10 object-cover"
                            />
                          </button>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold tabular-nums text-slate-900">
                          {formatClock(row.checkedOutAt)}
                        </div>
                        {outMap ? (
                          <a
                            href={outMap}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                          >
                            <MapPin size={12} />
                            View on map
                          </a>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.reportSubmitted ? (
                          <span className="text-sm font-medium text-emerald-700">Submitted</span>
                        ) : (
                          <span className="text-sm text-slate-400">Not submitted</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={statusBadgeLabel(row.filterStatus)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
        {!loading && filtered.length > 0 ? (
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            Showing {filtered.length} of {rows.length} rows
          </div>
        ) : null}
      </Card>

      <Modal
        open={!!photoPreviewUrl}
        onClose={() => setPhotoPreviewUrl(null)}
        title="Check-in photo"
      >
        {photoPreviewUrl ? (
          <img
            src={photoPreviewUrl}
            alt="BA check-in"
            className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg"
          />
        ) : null}
      </Modal>
    </div>
  )
}
