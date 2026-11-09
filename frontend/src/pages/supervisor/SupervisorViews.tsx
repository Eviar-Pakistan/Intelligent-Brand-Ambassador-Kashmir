import { useCallback, useEffect, useState } from 'react'
import { Download, FileSpreadsheet, MapPin } from 'lucide-react'
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  KpiCard,
  LoadingState,
  Modal,
  ProgressBar,
  Select,
  StatusBadge,
  TableScroll,
} from '../../components/ui'
import { calculateSupervisorIncentive, formatPkr } from '../../lib/incentives'
import { useKpiConfigSync } from '../../lib/kpiConfig'
import { findCreatedStore, useCreatedStores } from '../../lib/storeRegistry'
import {
  checkInWithGeo,
  checkOutWithGeo,
  fetchSupervisorVisits,
  visitApiErrorMessage,
  type SupervisorStoreVisit,
} from '../../lib/supervisorVisitApi'
import {
  downloadSupervisorBaReportsExcel,
  fetchMySupervisorOverview,
  fetchSupervisorOverview,
  fetchSupervisorReportDates,
  fetchSupervisorReportsForDate,
  isSupervisorOverviewCacheFresh,
  peekSupervisorOverviewCache,
  setSupervisorOverviewCache,
  supervisorOverview,
  supervisorOverviewCacheKey,
  type Supervisor,
  type SupervisorOverview,
} from '../../lib/supervisors'
import { SupervisorFaceCheckInModal } from './SupervisorFaceCheckInModal'

/** The sections of a supervisor's view. Used in their own portal and on Head Office's supervisor page. */

function useLiveOverview(supervisor: Supervisor, mode: 'ho' | 'me') {
  const fallback = supervisorOverview(supervisor)
  const cacheKey = supervisorOverviewCacheKey(mode, supervisor.id)
  const cached = peekSupervisorOverviewCache(cacheKey)
  const [live, setLive] = useState<SupervisorOverview | null>(cached)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const existing = peekSupervisorOverviewCache(cacheKey)
    if (existing) {
      setLive(existing)
      setLoading(false)
      // Still fresh — skip network this visit.
      if (isSupervisorOverviewCacheFresh(cacheKey)) return () => {
        cancelled = true
      }
    } else {
      setLive(null)
      setLoading(true)
    }

    const finish = () => {
      if (!cancelled) setLoading(false)
    }

    const load = () => {
      const req =
        mode === 'me' ? fetchMySupervisorOverview() : fetchSupervisorOverview(supervisor.id)
      void req
        .then((data) => {
          if (cancelled) return
          if (data) {
            setSupervisorOverviewCache(cacheKey, data)
            setLive(data)
            finish()
            return
          }
          // Auth/token not ready yet — retry briefly instead of sticking on nameless fallback.
          if (attempts < 6) {
            attempts += 1
            timer = setTimeout(load, 150 * attempts)
          } else {
            finish()
          }
        })
        .catch(() => {
          if (cancelled) return
          if (attempts < 6) {
            attempts += 1
            timer = setTimeout(load, 150 * attempts)
          } else {
            finish()
          }
        })
    }

    load()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [supervisor.id, mode, cacheKey, supervisor.storeIds.join(',')])

  return { overview: live ?? fallback, loading }
}

function formatReportDateLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Date picker + Excel download (one sheet per BA) for that supervisor's team. */
export function SupervisorDownloadReport({
  supervisor,
  mode = 'ho',
}: {
  supervisor: Supervisor
  mode?: 'ho' | 'me'
}) {
  const [open, setOpen] = useState(false)
  const [dates, setDates] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [loadingDates, setLoadingDates] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingDates(true)
    setError(null)
    void fetchSupervisorReportDates(mode, supervisor.id)
      .then((list) => {
        if (cancelled) return
        setDates(list)
        setSelected(list[0] ?? '')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setDates([])
        setSelected('')
        setError(err instanceof Error ? err.message : 'Could not load report dates.')
      })
      .finally(() => {
        if (!cancelled) setLoadingDates(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, mode, supervisor.id])

  async function onDownload() {
    if (!selected) return
    setDownloading(true)
    setError(null)
    try {
      const { date, reports } = await fetchSupervisorReportsForDate(mode, supervisor.id, selected)
      await downloadSupervisorBaReportsExcel(date, reports, supervisor.name)
      setOpen(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Download failed.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold text-slate-900">BA daily reports</div>
            <p className="mt-0.5 text-sm text-slate-500">
              Download checkout reports for all ambassadors under this supervisor (one Excel sheet per
              BA). BA's who did not submit still get a sheet with a note.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            <Download size={15} /> Download report
          </Button>
        </div>
      </Card>

      <Modal open={open} onClose={() => !downloading && setOpen(false)} title="Download BA reports">
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            Choose a date that matches Daily Reports (WHEN). Download includes one Excel sheet per BA
            under this supervisor.
          </p>

          {loadingDates ? (
            <p className="text-slate-500">Loading available dates…</p>
          ) : dates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-slate-500">
              No daily reports yet for ambassadors under {supervisor.name}.
            </p>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Report date</span>
              <Select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-full">
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {formatReportDateLabel(d)}
                  </option>
                ))}
              </Select>
            </label>
          )}

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              onClick={() => void onDownload()}
              disabled={!selected || downloading || loadingDates || dates.length === 0}
            >
              <FileSpreadsheet size={15} />
              {downloading ? 'Preparing…' : 'Download Excel'}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={downloading}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

export function SupervisorSummary({
  supervisor,
  mode = 'ho',
}: {
  supervisor: Supervisor
  mode?: 'ho' | 'me'
}) {
  useCreatedStores()
  const { overview: o, loading } = useLiveOverview(supervisor, mode)
  if (loading) return <LoadingState label="Loading overview…" />
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <KpiCard label="Stores" value={o.stores.length} />
      <KpiCard label="Ambassadors" value={new Set(o.bas.map((b) => b.id)).size} />
      <KpiCard
        label="Store coverage"
        value={`${o.coverage}%`}
        hint="Stores with BA checked in today"
      />
    </div>
  )
}

function formatVisitTime(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export function SupervisorStoreCards({
  supervisor,
  mode = 'ho',
}: {
  supervisor: Supervisor
  mode?: 'ho' | 'me'
}) {
  useCreatedStores()
  const { overview, loading } = useLiveOverview(supervisor, mode)
  const stores = overview.stores
  const canVisit = mode === 'me'

  const [openVisit, setOpenVisit] = useState<SupervisorStoreVisit | null>(null)
  const [todayVisits, setTodayVisits] = useState<SupervisorStoreVisit[]>([])
  const [checkInStore, setCheckInStore] = useState<{ id: number; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const reloadVisits = useCallback(() => {
    if (!canVisit) return
    void fetchSupervisorVisits()
      .then((data) => {
        setOpenVisit(data.openVisit)
        setTodayVisits(data.visits || [])
      })
      .catch(() => {
        /* keep last known */
      })
  }, [canVisit])

  useEffect(() => {
    reloadVisits()
  }, [reloadVisits])

  const handleFaceConfirmed = async (photo: Blob) => {
    if (!checkInStore) return
    setBusy(true)
    setActionError(null)
    try {
      const visit = await checkInWithGeo(checkInStore.id, photo)
      setOpenVisit(visit)
      setCheckInStore(null)
      reloadVisits()
    } catch (err) {
      setActionError(visitApiErrorMessage(err, 'Check-in failed.'))
    } finally {
      setBusy(false)
    }
  }

  const handleCheckOut = async (visitId?: number) => {
    setBusy(true)
    setActionError(null)
    try {
      await checkOutWithGeo(visitId)
      setOpenVisit(null)
      reloadVisits()
    } catch (err) {
      setActionError(visitApiErrorMessage(err, 'Check-out failed.'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState label="Loading stores…" />

  if (stores.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">No stores are assigned to this supervisor yet.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {canVisit && openVisit ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Currently checked in
              </div>
              <div className="mt-0.5 font-semibold text-slate-900">
                {openVisit.storeName}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  since {formatVisitTime(openVisit.checkedInAt)}
                </span>
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => void handleCheckOut(openVisit.id)}
            >
              {busy ? 'Checking out…' : 'Check out'}
            </Button>
          </div>
        </Card>
      ) : null}

      {actionError && !checkInStore ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {actionError}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {stores.map((s) => {
          const details = findCreatedStore(s.id)
          const isHere = openVisit?.storeId === s.id
          const storeVisitsToday = todayVisits.filter((v) => v.storeId === s.id)
          return (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">
                    #{s.id} {s.name}
                  </div>
                  <div className="text-xs text-slate-500">{s.city}</div>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {isHere ? <StatusBadge status="LIVE" /> : null}
                  <StatusBadge status={s.status} />
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>BA coverage</span>
                  <span className="font-semibold text-slate-800">{s.coverage}%</span>
                </div>
                <ProgressBar value={s.coverage} />
              </div>

              <dl className="mt-4 space-y-1.5 text-xs">
                <Row label="Peak hours" value={s.peak.join(' · ') || '—'} />
                <Row
                  label="Ambassadors"
                  value={
                    s.assigned.length
                      ? s.assigned
                          .map((a) => (a.code ? `${a.code} · ${a.name}` : a.name))
                          .join(', ')
                      : 'None assigned'
                  }
                />
                {details && <Row label="Address" value={details.address} />}
              </dl>

              {canVisit ? (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  {storeVisitsToday.length > 0 ? (
                    <ul className="mb-3 space-y-1 text-xs text-slate-600">
                      {storeVisitsToday.map((v) => (
                        <li key={v.id} className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                          <span>
                            {formatVisitTime(v.checkedInAt)}
                            {' → '}
                            {v.checkedOutAt ? formatVisitTime(v.checkedOutAt) : 'open'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {isHere ? (
                    <Button
                      variant="danger"
                      className="w-full"
                      disabled={busy}
                      onClick={() => void handleCheckOut(openVisit?.id)}
                    >
                      Check out of this store
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={busy || !!openVisit}
                      title={
                        openVisit
                          ? `Check out of ${openVisit.storeName} first`
                          : undefined
                      }
                      onClick={() => {
                        setActionError(null)
                        setCheckInStore({ id: s.id, name: s.name })
                      }}
                    >
                      {openVisit ? 'Finish other visit first' : 'Check in'}
                    </Button>
                  )}
                </div>
              ) : null}
            </Card>
          )
        })}
      </div>

      {checkInStore ? (
        <SupervisorFaceCheckInModal
          open
          storeName={checkInStore.name}
          busy={busy}
          submitError={actionError}
          onClose={() => {
            if (!busy) {
              setCheckInStore(null)
              setActionError(null)
            }
          }}
          onConfirmed={(photo) => void handleFaceConfirmed(photo)}
        />
      ) : null}
    </div>
  )
}

export function SupervisorBaTable({
  supervisor,
  mode = 'ho',
}: {
  supervisor: Supervisor
  mode?: 'ho' | 'me'
}) {
  useCreatedStores()
  const { overview, loading } = useLiveOverview(supervisor, mode)
  const bas = overview.bas
  const sorted = [...bas].sort((a, b) => {
    const aAch = a.targetAchievement ?? -1
    const bAch = b.targetAchievement ?? -1
    if (bAch !== aAch) return bAch - aAch
    return b.conversion - a.conversion
  })

  if (loading) return <LoadingState label="Loading BA performance…" />

  if (!sorted.length) {
    return (
      <Card>
        <CardHeader title="BA performance" subtitle="Ambassadors working in your stores" />
        <p className="text-sm text-slate-500">No ambassadors in this supervisor&apos;s stores yet.</p>
      </Card>
    )
  }

  return (
    <Card padding={false}>
      <div className="px-4 pt-4 sm:px-5">
        <CardHeader title="BA performance" subtitle="Ambassadors working in your stores" />
      </div>
      <TableScroll minWidth={720}>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">BA</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Weekly off</th>
              <th className="px-4 py-3">Conversion</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Achievement</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={`${b.id}-${b.storeId}`} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={b.name} size="sm" />
                    <div className="min-w-0">
                      {b.code ? (
                        <span className="font-mono text-xs font-semibold text-slate-500">
                          {b.code}
                        </span>
                      ) : null}
                      <span className={`font-medium ${b.code ? 'ml-1.5' : ''}`}>{b.name}</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{b.store || '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={b.state} />
                </td>
                <td className="px-4 py-3">
                  {b.weeklyOff ? (
                    <div>
                      <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                        {b.weeklyOff}
                      </span>
                      {b.weeklyOffDate ? (
                        <div className="mt-1 text-[10px] text-slate-400">{b.weeklyOffDate}</div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                      Not set
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-semibold">{b.conversion}%</td>
                <td className="px-4 py-3 tabular-nums text-slate-700">
                  {b.targetKg == null ? '—' : `${b.targetKg.toLocaleString()} kg`}
                </td>
                <td className="px-4 py-3 font-semibold tabular-nums">
                  {b.targetAchievement == null ? '—' : `${Math.round(b.targetAchievement)}%`}
                  {b.targetAchievement != null && b.salesKg > 0 ? (
                    <div className="text-[10px] font-normal text-slate-400">
                      {b.salesKg.toLocaleString()} kg sold
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Card>
  )
}

export function SupervisorIncentiveCard({ supervisor }: { supervisor: Supervisor }) {
  const config = useKpiConfigSync()
  useCreatedStores()
  const pay = calculateSupervisorIncentive(supervisor, config)

  return (
    <Card>
      <CardHeader title="Supervisor package" subtitle="Monthly package from Head Office KPIs" />
      <div className="mt-1 text-2xl font-black">{formatPkr(pay.totalPkr)}</div>
      <div className="mt-3 space-y-2 text-sm">
        <PayRow label="Sup salary" value={formatPkr(pay.salary)} />
        <PayRow label="Fuel/DA" value={formatPkr(pay.fuelDa)} />
        <PayRow label="Discipline/Attendance" value={formatPkr(pay.discipline)} />
        <PayRow label="Mobile/Data" value={formatPkr(pay.mobile)} />
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-bold text-slate-900">
          <span>Total</span>
          <span className="text-brand-700">{formatPkr(pay.totalPkr)}</span>
        </div>
      </div>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  )
}

function PayRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 py-1.5 last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className="shrink-0 font-semibold text-slate-900">{value}</span>
    </div>
  )
}
