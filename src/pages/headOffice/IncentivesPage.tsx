import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import {
  Avatar,
  Button,
  Card,
  Modal,
  PageHeader,
  StatusBadge,
  Tabs,
} from '../../components/ui'
import {
  buildIncentiveRoster,
  formatPkr,
  incentiveRules,
  type IncentiveBreakdown,
} from '../../lib/incentives'
import { Banknote, CheckCircle2, Wallet } from 'lucide-react'

type PayoutStatus = 'Pending' | 'Approved' | 'Paid'

export function IncentivesPage() {
  const roster = useMemo(() => buildIncentiveRoster(), [])
  const [statusMap, setStatusMap] = useState<Record<string, PayoutStatus>>(() =>
    Object.fromEntries(roster.map((r) => [r.baId, 'Pending' as PayoutStatus])),
  )
  const [tab, setTab] = useState('All')
  const [selected, setSelected] = useState<IncentiveBreakdown | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const filtered = roster.filter((r) => {
    const st = statusMap[r.baId]
    if (tab === 'All') return true
    return st === tab
  })

  const totals = {
    pool: roster.reduce((s, r) => s + r.totalPkr, 0),
    pending: roster
      .filter((r) => statusMap[r.baId] === 'Pending')
      .reduce((s, r) => s + r.totalPkr, 0),
    paid: roster
      .filter((r) => statusMap[r.baId] === 'Paid')
      .reduce((s, r) => s + r.totalPkr, 0),
  }

  function setStatus(baId: string, status: PayoutStatus) {
    setStatusMap((m) => ({ ...m, [baId]: status }))
    const name = roster.find((r) => r.baId === baId)?.name ?? 'BA'
    setToast(
      status === 'Approved'
        ? `${name} incentive approved`
        : status === 'Paid'
          ? `${formatPkr(roster.find((r) => r.baId === baId)!.totalPkr)} marked paid to ${name}`
          : `${name} set back to pending`,
    )
    setTimeout(() => setToast(null), 2800)
  }

  function approveAllPending() {
    setStatusMap((m) => {
      const next = { ...m }
      for (const r of roster) {
        if (next[r.baId] === 'Pending') next[r.baId] = 'Approved'
      }
      return next
    })
    setToast('All pending incentives approved')
    setTimeout(() => setToast(null), 2800)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="BA Performance Incentives"
        description="PKR payouts calculated from conversion, points, sessions and rank"
        actions={
          <>
            <Button variant="secondary" onClick={approveAllPending}>
              Approve all pending
            </Button>
            <Link to="/ho/leaderboard">
              <Button variant="secondary">Leaderboard</Button>
            </Link>
          </>
        }
      />

      {toast && (
        <div className="animate-fade-up rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {toast}
        </div>
      )}

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

      <Card>
        <h3 className="mb-3 font-semibold">How PKR is calculated</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {incentiveRules.map((r) => (
            <div key={r.label} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <div className="font-semibold text-slate-800">{r.label}</div>
              <div className="text-xs text-slate-500">{r.detail}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={['All', 'Pending', 'Approved', 'Paid']} value={tab} onChange={setTab} />
      </div>

      <Card padding={false}>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Ambassador</th>
              <th className="px-4 py-3">Performance</th>
              <th className="px-4 py-3">Incentive (PKR)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const st = statusMap[r.baId]
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
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <div>{r.conversion}% conv · {r.points} pts</div>
                    <div>{r.interactions} sessions</div>
                  </td>
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
                        <Button size="sm" onClick={() => setStatus(r.baId, 'Approved')}>
                          Approve
                        </Button>
                      )}
                      {st === 'Approved' && (
                        <Button size="sm" variant="success" onClick={() => setStatus(r.baId, 'Paid')}>
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
            })}
          </tbody>
        </table>
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Incentive · ${selected.name}` : 'Incentive'}
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl bg-navy-900 px-4 py-3 text-white">
              <div className="text-xs text-emerald-200">Total this week</div>
              <div className="text-2xl font-black">{formatPkr(selected.totalPkr)}</div>
              <div className="text-xs text-slate-300">
                Rank #{selected.rank} · {selected.conversion}% conversion · {selected.points} pts
              </div>
            </div>
            <Row label="Base active pay" value={selected.base} />
            <Row label={`Conversion (${selected.conversion}% × 80)`} value={selected.conversionPay} />
            <Row label={`Points (${selected.points} × 1.5)`} value={selected.pointsPay} />
            <Row label={`Sessions (${selected.interactions} × 25)`} value={selected.sessionPay} />
            <Row label="Rank bonus" value={selected.rankBonus} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Close
              </Button>
              {statusMap[selected.baId] === 'Pending' && (
                <Button
                  onClick={() => {
                    setStatus(selected.baId, 'Approved')
                    setSelected(null)
                  }}
                >
                  Approve
                </Button>
              )}
              {statusMap[selected.baId] === 'Approved' && (
                <Button
                  variant="success"
                  onClick={() => {
                    setStatus(selected.baId, 'Paid')
                    setSelected(null)
                  }}
                >
                  Mark paid
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
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
