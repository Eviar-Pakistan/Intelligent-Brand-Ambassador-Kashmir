import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, CheckCircle2, RotateCcw, Save, Wallet } from 'lucide-react'
import { Avatar, Button, Card, CardHeader, Modal, StatusBadge, TableScroll } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { buildSupervisorRoster, formatPkr, type SupervisorIncentive } from '../../lib/incentives'
import { useKpiConfigSync } from '../../lib/kpiConfig'
import { useCreatedStores } from '../../lib/storeRegistry'
import {
  resetSupervisorPackage,
  saveSupervisorPackage,
  syncSupervisorPackagesFromApi,
  useSupervisorPackagesSync,
  type SupervisorPackageRow,
} from '../../lib/supervisorPackages'
import { useSupervisorsSync } from '../../lib/supervisors'
import { useRoleBase } from './StoreCreation'

type PayoutStatus = 'Pending' | 'Approved' | 'Paid'

type DraftRow = {
  salary: string
  fuelDa: string
  discipline: string
  mobile: string
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2">
      <span className="text-slate-600">{label}</span>
      <span className="shrink-0 font-semibold text-slate-900">{formatPkr(value)}</span>
    </div>
  )
}

const inputClass =
  'w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm tabular-nums outline-none focus:border-brand-500'

function toDraft(row: SupervisorPackageRow): DraftRow {
  return {
    salary: String(row.salary),
    fuelDa: String(row.fuelDa),
    discipline: String(row.discipline),
    mobile: String(row.mobile),
  }
}

function parseDraft(d: DraftRow): { salary: number; fuelDa: number; discipline: number; mobile: number } | null {
  const salary = Number(d.salary)
  const fuelDa = Number(d.fuelDa)
  const discipline = Number(d.discipline)
  const mobile = Number(d.mobile)
  if (![salary, fuelDa, discipline, mobile].every((n) => Number.isFinite(n) && n >= 0)) return null
  return {
    salary: Math.round(salary),
    fuelDa: Math.round(fuelDa),
    discipline: Math.round(discipline),
    mobile: Math.round(mobile),
  }
}

/** Editable per-supervisor packages (defaults come from Set KPIs). */
function SupervisorPackagesEditor({
  onSaved,
}: {
  onSaved: () => void
}) {
  const packages = useSupervisorPackagesSync()
  const [drafts, setDrafts] = useState<Record<number, DraftRow>>({})
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<number, DraftRow> = { ...prev }
      for (const row of packages) {
        if (!next[row.supervisorId]) next[row.supervisorId] = toDraft(row)
      }
      return next
    })
  }, [packages])

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2500)
  }

  function updateDraft(id: number, key: keyof DraftRow, value: string) {
    setDrafts((m) => ({
      ...m,
      [id]: { ...(m[id] ?? { salary: '0', fuelDa: '0', discipline: '0', mobile: '0' }), [key]: value },
    }))
  }

  async function saveRow(row: SupervisorPackageRow) {
    const draft = drafts[row.supervisorId] ?? toDraft(row)
    const parsed = parseDraft(draft)
    if (!parsed) {
      setError('Enter valid non-negative whole numbers for all package fields.')
      return
    }
    setBusyId(row.supervisorId)
    setError(null)
    try {
      const saved = await saveSupervisorPackage(row.supervisorId, parsed)
      setDrafts((m) => ({ ...m, [row.supervisorId]: toDraft({ ...row, ...saved, isCustom: true }) }))
      showToast(`Saved package for ${row.supervisorName}`)
      onSaved()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not save package',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function resetRow(row: SupervisorPackageRow) {
    setBusyId(row.supervisorId)
    setError(null)
    try {
      const restored = await resetSupervisorPackage(row.supervisorId)
      setDrafts((m) => ({
        ...m,
        [row.supervisorId]: toDraft({
          ...row,
          ...restored,
          supervisorId: row.supervisorId,
          supervisorName: row.supervisorName,
          city: row.city,
        }),
      }))
      showToast(`Reset ${row.supervisorName} to global KPI defaults`)
      onSaved()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not reset package',
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card padding={false}>
      <div className="border-b border-slate-100 px-4 py-3">
        <CardHeader
          title="Supervisor packages"
          subtitle="Set Gross / Attendance / Fuel / Mobile per supervisor. Blank custom rows use Set KPIs defaults until you save."
        />
        {toast ? <p className="mt-2 text-sm text-emerald-700">{toast}</p> : null}
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
      </div>
      <TableScroll minWidth={980}>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Supervisor</th>
              <th className="px-4 py-3">Gross salary</th>
              <th className="px-4 py-3">Attendance</th>
              <th className="px-4 py-3">Fuel / DA</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((row) => {
              const draft = drafts[row.supervisorId] ?? toDraft(row)
              const parsed = parseDraft(draft)
              const total = parsed
                ? parsed.salary + parsed.fuelDa + parsed.discipline + parsed.mobile
                : row.total
              const busy = busyId === row.supervisorId
              return (
                <tr key={row.supervisorId} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.supervisorName}</div>
                    <div className="text-xs text-slate-400">{row.city || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      value={draft.salary}
                      onChange={(e) => updateDraft(row.supervisorId, 'salary', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      value={draft.discipline}
                      onChange={(e) => updateDraft(row.supervisorId, 'discipline', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      value={draft.fuelDa}
                      onChange={(e) => updateDraft(row.supervisorId, 'fuelDa', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      value={draft.mobile}
                      onChange={(e) => updateDraft(row.supervisorId, 'mobile', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">
                    {formatPkr(total)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        row.isCustom
                          ? 'bg-brand-50 text-brand-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.isCustom ? 'Custom' : 'Default KPI'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" disabled={busy} onClick={() => void saveRow(row)}>
                        <Save size={13} /> {busy ? 'Saving…' : 'Save'}
                      </Button>
                      {row.isCustom ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void resetRow(row)}
                        >
                          <RotateCcw size={13} /> Reset
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
            {packages.length === 0 ? (
              <tr className="border-t border-slate-100">
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                  No supervisors yet — add one under Supervisors, then packages appear here.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableScroll>
    </Card>
  )
}

/** Supervisor incentives: base pay plus their stores' team conversion and coverage, from the Set KPIs dialog. */
export function SupervisorIncentives() {
  const base = useRoleBase()
  const config = useKpiConfigSync()
  const supervisors = useSupervisorsSync()
  const createdStores = useCreatedStores()
  const packages = useSupervisorPackagesSync()
  const [rosterTick, setRosterTick] = useState(0)
  const roster = useMemo(
    () => buildSupervisorRoster(config),
    // packages + tick force recompute after per-supervisor saves
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, supervisors, createdStores, packages, rosterTick],
  )
  const [statusMap, setStatusMap] = useState<Record<string, PayoutStatus>>({})
  const [selected, setSelected] = useState<SupervisorIncentive | null>(null)

  const statusOf = (id: string): PayoutStatus => statusMap[id] ?? 'Pending'
  const setStatus = (id: string, status: PayoutStatus) => setStatusMap((m) => ({ ...m, [id]: status }))
  const sum = (rows: SupervisorIncentive[]) => rows.reduce((s, r) => s + r.totalPkr, 0)

  const totals = {
    pool: sum(roster),
    pending: sum(roster.filter((r) => statusOf(r.supervisorId) === 'Pending')),
    paid: sum(roster.filter((r) => statusOf(r.supervisorId) === 'Paid')),
  }

  return (
    <div className="space-y-5">
      <SupervisorPackagesEditor
        onSaved={() => {
          void syncSupervisorPackagesFromApi().finally(() => setRosterTick((n) => n + 1))
        }}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Wallet size={14} /> Supervisor incentive pool
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

      <Card padding={false}>
        <TableScroll minWidth={980}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Supervisor</th>
                <th className="px-4 py-3">Stores</th>
                <th className="px-4 py-3">Sup salary</th>
                <th className="px-4 py-3">Fuel/DA</th>
                <th className="px-4 py-3">Discipline/Attendance</th>
                <th className="px-4 py-3">Mobile/Data</th>
                <th className="px-4 py-3">Total (PKR)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => {
                const st = statusOf(r.supervisorId)
                return (
                  <tr key={r.supervisorId} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={r.name} size="sm" />
                        <div>
                          <Link to={`${base}/supervisors/${r.supervisorId}`} className="font-medium hover:text-brand-600">
                            {r.name}
                          </Link>
                          <div className="text-xs text-slate-400">{r.city}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {r.storeCount} <span className="text-xs text-slate-400">· {r.baCount} BA's</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{formatPkr(r.salary)}</td>
                    <td className="px-4 py-3">{formatPkr(r.fuelDa)}</td>
                    <td className="px-4 py-3">{formatPkr(r.discipline)}</td>
                    <td className="px-4 py-3">{formatPkr(r.mobile)}</td>
                    <td className="px-4 py-3">
                      <button className="font-bold text-slate-900 hover:text-brand-600" onClick={() => setSelected(r)}>
                        {formatPkr(r.totalPkr)}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={st === 'Paid' ? 'Active' : st === 'Approved' ? 'Certified' : 'Pending'} />
                      <span className="ml-1 text-[11px] text-slate-500">{st}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setSelected(r)}>
                          Breakdown
                        </Button>
                        {st === 'Pending' && (
                          <Button size="sm" onClick={() => setStatus(r.supervisorId, 'Approved')}>
                            Approve
                          </Button>
                        )}
                        {st === 'Approved' && (
                          <Button size="sm" variant="success" onClick={() => setStatus(r.supervisorId, 'Paid')}>
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
              {roster.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">
                    No supervisors yet — add one under Supervisors.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Incentive · ${selected.name}` : 'Incentive'}
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl bg-navy-900 px-4 py-3 text-white">
              <div className="text-xs text-emerald-200">Monthly package</div>
              <div className="text-2xl font-black">{formatPkr(selected.totalPkr)}</div>
              <div className="text-xs text-slate-300">
                {selected.storeCount} stores · {selected.baCount} BA's
              </div>
            </div>
            <Row label="Sup salary" value={selected.salary} />
            <Row label="Fuel/DA" value={selected.fuelDa} />
            <Row label="Discipline/Attendance" value={selected.discipline} />
            <Row label="Mobile/Data" value={selected.mobile} />
            <Row label="Total" value={selected.totalPkr} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Close
              </Button>
              {statusOf(selected.supervisorId) === 'Pending' && (
                <Button
                  onClick={() => {
                    setStatus(selected.supervisorId, 'Approved')
                    setSelected(null)
                  }}
                >
                  Approve
                </Button>
              )}
              {statusOf(selected.supervisorId) === 'Approved' && (
                <Button
                  variant="success"
                  onClick={() => {
                    setStatus(selected.supervisorId, 'Paid')
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
