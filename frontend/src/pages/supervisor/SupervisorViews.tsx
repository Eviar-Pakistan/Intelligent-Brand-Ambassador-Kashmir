import { useEffect, useState } from 'react'
import { Avatar, Card, CardHeader, KpiCard, ProgressBar, StatusBadge, TableScroll } from '../../components/ui'
import { calculateSupervisorIncentive, formatPkr } from '../../lib/incentives'
import { useKpiConfigSync } from '../../lib/kpiConfig'
import { findCreatedStore, useCreatedStores } from '../../lib/storeRegistry'
import {
  fetchMySupervisorOverview,
  fetchSupervisorOverview,
  supervisorOverview,
  type Supervisor,
  type SupervisorOverview,
} from '../../lib/supervisors'

/** The sections of a supervisor's view. Used in their own portal and on Head Office's supervisor page. */

function useLiveOverview(supervisor: Supervisor, mode: 'ho' | 'me') {
  const fallback = supervisorOverview(supervisor)
  const [live, setLive] = useState<SupervisorOverview | null>(null)

  useEffect(() => {
    let cancelled = false
    const load =
      mode === 'me' ? fetchMySupervisorOverview() : fetchSupervisorOverview(supervisor.id)
    void load
      .then((data) => {
        if (!cancelled) setLive(data)
      })
      .catch(() => {
        if (!cancelled) setLive(null)
      })
    return () => {
      cancelled = true
    }
  }, [supervisor.id, mode, supervisor.storeIds.join(',')])

  return live ?? fallback
}

export function SupervisorSummary({
  supervisor,
  mode = 'ho',
}: {
  supervisor: Supervisor
  mode?: 'ho' | 'me'
}) {
  useCreatedStores()
  const o = useLiveOverview(supervisor, mode)
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard label="Stores" value={o.stores.length} />
      <KpiCard label="Ambassadors" value={new Set(o.bas.map((b) => b.id)).size} />
      <KpiCard label="Team conversion" value={`${o.teamConversion}%`} hint="Average of their BAs" />
      <KpiCard label="Store coverage" value={`${o.coverage}%`} hint="Average of their stores" />
      <KpiCard label="Today's footfall" value={o.todayFootfall.toLocaleString()} />
    </div>
  )
}

export function SupervisorStoreCards({
  supervisor,
  mode = 'ho',
}: {
  supervisor: Supervisor
  mode?: 'ho' | 'me'
}) {
  useCreatedStores()
  const { stores } = useLiveOverview(supervisor, mode)

  if (stores.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">No stores are assigned to this supervisor yet.</p>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {stores.map((s) => {
        const details = findCreatedStore(s.id)
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
                <StatusBadge status={s.status} />
                <StatusBadge status={s.footfall} />
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>BA coverage</span>
                <span className="font-semibold text-slate-800">{s.coverage}%</span>
              </div>
              <ProgressBar value={s.coverage} />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Stat label="Engagement" value={`${s.engagement}%`} />
              <Stat label="Conversion" value={`${s.conversion}%`} />
              <Stat label="Footfall today" value={s.todayFootfall.toLocaleString()} />
            </div>

            <dl className="mt-4 space-y-1.5 text-xs">
              <Row label="Peak hours" value={s.peak.join(' · ') || '—'} />
              <Row
                label="Ambassadors"
                value={s.assigned.length ? s.assigned.map((a) => a.name).join(', ') : 'None assigned'}
              />
              {details && <Row label="Address" value={details.address} />}
            </dl>
          </Card>
        )
      })}
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
  const { bas } = useLiveOverview(supervisor, mode)
  const sorted = [...bas].sort((a, b) => {
    const aAch = a.targetAchievement ?? -1
    const bAch = b.targetAchievement ?? -1
    if (bAch !== aAch) return bAch - aAch
    return b.conversion - a.conversion
  })

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
      <TableScroll minWidth={640}>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">BA</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Status</th>
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
                    <span className="font-medium">{b.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{b.store || '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={b.state} />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-2">
      <div className="text-sm font-bold text-slate-900">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
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
