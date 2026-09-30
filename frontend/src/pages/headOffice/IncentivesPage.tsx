import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Avatar,
  Button,
  Card,
  Modal,
  PageHeader,
  StatusBadge,
  TableScroll,
  Tabs,
} from '../../components/ui'
import {
  approveAllPendingIncentives,
  approveIncentives,
  buildIncentiveRoster,
  fetchIncentivesOverview,
  formatPkr,
  markIncentivesPaid,
  type IncentiveBreakdown,
  type PayoutStatus,
} from '../../lib/incentives'
import { useKpiConfigSync, type KpiConfig } from '../../lib/kpiConfig'
import { KpiSettingsModal } from './IncentiveKpiSettings'
import { SupervisorIncentives } from './SupervisorIncentives'
import { Banknote, CheckCircle2, Wallet } from 'lucide-react'

function statusOf(r: IncentiveBreakdown): PayoutStatus {
  return r.status ?? 'Pending'
}

export function IncentivesPage() {
  const kpiConfig = useKpiConfigSync()
  const [liveRoster, setLiveRoster] = useState<IncentiveBreakdown[] | null>(null)
  const [weekLabel, setWeekLabel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const fallbackRoster = useMemo(() => buildIncentiveRoster(kpiConfig), [kpiConfig])
  const roster = liveRoster ?? fallbackRoster

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchIncentivesOverview()
      if (data) {
        setLiveRoster(data.results)
        setWeekLabel(data.weekLabel ?? null)
      } else {
        setLiveRoster(null)
        setWeekLabel(null)
      }
    } catch {
      setLiveRoster(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [
    reload,
    kpiConfig.baSalary,
    kpiConfig.baTargetSlab100,
    kpiConfig.baDiscipline,
    kpiConfig.baTravelCap,
    kpiConfig.supSalary,
    kpiConfig.supFuelDa,
  ])

  const [kpiOpen, setKpiOpen] = useState(false)
  const [section, setSection] = useState('Ambassadors')
  const [tab, setTab] = useState('All')
  const [selected, setSelected] = useState<IncentiveBreakdown | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const filtered = roster.filter((r) => {
    const st = statusOf(r)
    if (tab === 'All') return true
    return st === tab
  })

  const totals = {
    pool: roster.reduce((s, r) => s + r.totalPkr, 0),
    pending: roster.filter((r) => statusOf(r) === 'Pending').reduce((s, r) => s + r.totalPkr, 0),
    paid: roster.filter((r) => statusOf(r) === 'Paid').reduce((s, r) => s + r.totalPkr, 0),
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  async function approveOne(baId: string) {
    if (!liveRoster) {
      showToast('Sign in as Head Office to save approvals permanently')
      return
    }
    setBusy(true)
    try {
      const res = await approveIncentives([baId])
      setLiveRoster(res.overview.results)
      const name = roster.find((r) => r.baId === baId)?.name ?? 'BA'
      showToast(`${name} incentive approved (saved)`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setBusy(false)
    }
  }

  async function approveAllPending() {
    if (!liveRoster) {
      showToast('Sign in as Head Office to save approvals permanently')
      return
    }
    setBusy(true)
    try {
      const res = await approveAllPendingIncentives()
      setLiveRoster(res.overview.results)
      showToast(
        res.updated
          ? `${res.updated} pending incentive${res.updated === 1 ? '' : 's'} approved (saved)`
          : 'No pending incentives to approve',
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Approve all failed')
    } finally {
      setBusy(false)
    }
  }

  async function markPaid(baId: string) {
    if (!liveRoster) {
      showToast('Sign in as Head Office to save payouts permanently')
      return
    }
    setBusy(true)
    try {
      const res = await markIncentivesPaid([baId])
      setLiveRoster(res.overview.results)
      const row = res.overview.results.find((r) => r.baId === baId)
      const name = row?.name ?? roster.find((r) => r.baId === baId)?.name ?? 'BA'
      showToast(`${formatPkr(row?.totalPkr ?? 0)} marked paid to ${name} (saved)`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Mark paid failed')
    } finally {
      setBusy(false)
    }
  }

  const sectionTabs = <Tabs tabs={['Ambassadors', 'Supervisors']} value={section} onChange={setSection} />

  if (section === 'Supervisors') {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Supervisor Incentives"
          description="Calculated automatically from the KPIs you set for supervisors"
          actions={
            <Button variant="secondary" onClick={() => setKpiOpen(true)}>
              Set KPIs
            </Button>
          }
        />
        {sectionTabs}
        <SupervisorIncentives />
        <KpiSettingsModal open={kpiOpen} onClose={() => setKpiOpen(false)} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="BA Incentives"
        description={
          liveRoster
            ? `Live from backend${weekLabel ? ` · ${weekLabel}` : ''} · Approve / Paid saved permanently`
            : 'Sign in as HO for live metrics and permanent approvals'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => void approveAllPending()} disabled={busy || !liveRoster}>
              Approve all pending
            </Button>
            <Button variant="secondary" onClick={() => setKpiOpen(true)}>
              Set KPIs
            </Button>
            <Link to="/ho/leaderboard">
              <Button variant="secondary">Leaderboard</Button>
            </Link>
          </>
        }
      />

      {sectionTabs}

      {toast && (
        <div className="animate-fade-up rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Loading live incentives…</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Wallet size={14} /> Total incentive pool
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{formatPkr(totals.pool)}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">Pending approval</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{formatPkr(totals.pending)}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">Paid out</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">{formatPkr(totals.paid)}</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={['All', 'Pending', 'Approved', 'Paid']} value={tab} onChange={setTab} />
      </div>

      <Card padding={false}>
        <TableScroll minWidth={1180}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Ambassador</th>
                <th className="px-4 py-3">BA salary</th>
                <th className="px-4 py-3">Target Ach</th>
                <th className="px-4 py-3">Discipline</th>
                <th className="px-4 py-3">Travelling</th>
                <th className="px-4 py-3">Grooming</th>
                <th className="px-4 py-3">Mobile/Data</th>
                <th className="px-4 py-3">Total (PKR)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-slate-500">
                    No certified / deployed BAs yet — incentives appear once ambassadors are on the
                    leaderboard.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const st = statusOf(r)
                  return (
                    <tr key={r.baId} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-bold text-brand-600">#{r.rank}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={r.name} size="sm" />
                          <div>
                            <Link
                              to={`/ho/ambassadors/${r.baId}`}
                              className="font-medium hover:text-brand-600"
                            >
                              {r.name}
                            </Link>
                            <div className="text-xs text-slate-400">{r.city}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {formatPkr(r.salary ?? r.base)}
                      </td>
                      <td className="px-4 py-3">{formatPkr(r.targetAchPay ?? r.conversionPay)}</td>
                      <td className="px-4 py-3">{formatPkr(r.disciplinePay ?? 0)}</td>
                      <td className="px-4 py-3">{formatPkr(r.travelPay ?? r.sessionPay)}</td>
                      <td className="px-4 py-3">{formatPkr(r.groomingPay ?? 0)}</td>
                      <td className="px-4 py-3">{formatPkr(r.mobilePay ?? 0)}</td>
                      <td className="px-4 py-3">
                        <button
                          className="font-bold text-slate-900 hover:text-brand-600"
                          onClick={() => setSelected(r)}
                        >
                          {formatPkr(r.totalPkr)}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={st === 'Paid' ? 'Active' : st === 'Approved' ? 'Certified' : 'Pending'}
                        />
                        <span className="ml-1 text-[11px] text-slate-500">{st}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => setSelected(r)}>
                            Breakdown
                          </Button>
                          {st === 'Pending' && (
                            <Button
                              size="sm"
                              disabled={busy || !liveRoster}
                              onClick={() => void approveOne(r.baId)}
                            >
                              Approve
                            </Button>
                          )}
                          {st === 'Approved' && (
                            <Button
                              size="sm"
                              variant="success"
                              disabled={busy || !liveRoster}
                              onClick={() => void markPaid(r.baId)}
                            >
                              <Banknote size={13} /> Mark paid
                            </Button>
                          )}
                          {st === 'Paid' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 size={13} /> Paid
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <KpiSettingsModal open={kpiOpen} onClose={() => setKpiOpen(false)} />

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Incentive · ${selected.name}` : 'Incentive'}
      >
        {selected && (
          <BreakdownBody
            selected={selected}
            kpiConfig={kpiConfig}
            busy={busy}
            canPersist={!!liveRoster}
            onClose={() => setSelected(null)}
            onApprove={() => {
              void approveOne(selected.baId).then(() => setSelected(null))
            }}
            onMarkPaid={() => {
              void markPaid(selected.baId).then(() => setSelected(null))
            }}
          />
        )}
      </Modal>
    </div>
  )
}

function BreakdownBody({
  selected,
  kpiConfig,
  busy,
  canPersist,
  onClose,
  onApprove,
  onMarkPaid,
}: {
  selected: IncentiveBreakdown
  kpiConfig: KpiConfig
  busy: boolean
  canPersist: boolean
  onClose: () => void
  onApprove: () => void
  onMarkPaid: () => void
}) {
  const st = statusOf(selected)
  const days = selected.daysWorked ?? 0
  const ach = selected.achievementPct ?? 0

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-xl bg-navy-900 px-4 py-3 text-white">
        <div className="text-xs text-emerald-200">Monthly package (MTD)</div>
        <div className="text-2xl font-black">{formatPkr(selected.totalPkr)}</div>
        <div className="text-xs text-slate-300">
          Rank #{selected.rank} · Target ach {ach}% · {days} days worked · {st}
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        BA package from Set KPIs · Target Ach slabs 90% / 100% / 110%.
      </div>

      <Row label="BA salary" value={selected.salary ?? selected.base} />
      <Row label="Target Ach" value={selected.targetAchPay ?? selected.conversionPay} />
      <Row label="Discipline" value={selected.disciplinePay ?? 0} />
      <Row
        label={`Travelling Allowance ${selected.baTravelPerDay ?? kpiConfig.baTravelPerDay}/-PKR per day`}
        value={selected.travelPay ?? selected.sessionPay}
      />
      <Row label="Grooming" value={selected.groomingPay ?? kpiConfig.baGrooming} />
      <Row label="Mobile/Data" value={selected.mobilePay ?? kpiConfig.baMobile} />
      <Row label="Total" value={selected.totalPkr} />

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {st === 'Pending' && (
          <Button disabled={busy || !canPersist} onClick={onApprove}>
            Approve
          </Button>
        )}
        {st === 'Approved' && (
          <Button variant="success" disabled={busy || !canPersist} onClick={onMarkPaid}>
            Mark paid
          </Button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{formatPkr(value)}</span>
    </div>
  )
}
