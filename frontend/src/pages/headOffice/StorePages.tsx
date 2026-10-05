import { Link, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { stores } from '../../data/mock'
import {
  Avatar,
  Button,
  Card,
  Modal,
  PageHeader,
  ProgressBar,
  Select,
  StatusBadge,
  TableScroll,
} from '../../components/ui'
import { CalendarClock, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Plus, Upload } from 'lucide-react'
import { parseShiftLabelTimes, shiftLabelFromTimes, useSchedule } from '../../context/ScheduleContext'
import { StoreQrCard } from '../../components/StoreQrCard'
import { findCreatedStore, shopperPath, syncStoresFromApi, useCreatedStores } from '../../lib/storeRegistry'
import { BulkStoreModal, useRoleBase } from './StoreCreation'
import {
  syncAmbassadorsFromApi,
  useBaAccounts,
  isDemoBa,
  getBaAccounts,
} from '../../lib/baAccounts'
import { resolveBaByCode, resolveBaByName } from '../../lib/baCodes'
import {
  downloadBulkShiftTemplate,
  expandBulkShiftRow,
  parseBulkShiftFile,
  type BulkShiftParseResult,
} from '../../lib/bulkShiftUpload'
import {
  assignBaToStoreShift,
  createShift,
  deleteShift,
  deployAmbassador,
  undeployAmbassador,
  updateShift,
} from '../../lib/deploymentApi'
import { isApiAuthenticated } from '../../lib/api'

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function partsFromHhmm(hhmm: string) {
  const [hRaw, mRaw] = (hhmm || '10:00').split(':')
  let h = Number(hRaw)
  let m = Number(mRaw)
  if (Number.isNaN(h)) h = 10
  if (Number.isNaN(m)) m = 0
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  const snapped = Math.round(m / 5) * 5
  const minute = String(snapped === 60 ? 55 : snapped).padStart(2, '0')
  return { hour: String(hour12), minute, ampm }
}

function hhmmFromParts(hour: string, minute: string, ampm: string) {
  let h = Number(hour)
  if (ampm === 'PM' && h < 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function storeCodeLabel(id: number, code?: string) {
  return (code || '').trim() || String(id)
}

export function StoresPage() {
  const base = useRoleBase()
  const [bulkOpen, setBulkOpen] = useState(false)
  useCreatedStores() // re-render when stores are added

  useEffect(() => {
    void syncStoresFromApi().catch(() => {})
  }, [])

  return (
    <div>
      <PageHeader
        title="Stores"
        description={`${stores.length} outlets · prioritization by footfall, coverage & peak hours`}
        actions={
          <>
            <Link to={`${base}/stores/new`}>
              <Button>
                <Plus size={15} /> Create Store
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => setBulkOpen(true)}>
              <FileSpreadsheet size={15} /> Bulk upload
            </Button>
            <Link to={base === '/manager' ? '/manager/deployment' : '/ho/deployment'}>
              <Button variant="secondary">Open Scheduler</Button>
            </Link>
          </>
        }
      />
      <Card padding={false}>
        <TableScroll minWidth={780}>
          <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Store code</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Footfall</th>
              <th className="px-4 py-3">BAs</th>
              <th className="px-4 py-3">Coverage</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Shopper QR</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => {
              const code = s.code || findCreatedStore(s.id)?.code || String(s.id)
              return (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">{code}</td>
                <td className="px-4 py-3">
                  <Link to={`${base}/stores/${s.id}`} className="font-semibold text-brand-600 hover:underline">
                    #{s.id} {s.name}
                  </Link>
                  <div className="text-xs text-slate-400">{s.city}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={s.footfall} />
                </td>
                <td className="px-4 py-3">{s.bas}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24">
                      <ProgressBar value={s.coverage} />
                    </div>
                    <span className="text-xs text-slate-500">{s.coverage}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-4 py-3">
                  <Link to={`${base}/stores/${s.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                    View QR →
                  </Link>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
        </TableScroll>
      </Card>
      <BulkStoreModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </div>
  )
}

export function StoreDetailPage() {
  const { id } = useParams()
  const base = useRoleBase()
  useCreatedStores()
  const accounts = useBaAccounts()
  const { schedule, refreshSchedule } = useSchedule()
  const store = stores.find((s) => String(s.id) === id) ?? stores[0]
  const record = findCreatedStore(store.id)

  useEffect(() => {
    void Promise.all([
      syncStoresFromApi(),
      syncAmbassadorsFromApi(),
      refreshSchedule(), // current week — catches shift-only BAs
    ]).catch(() => {})
  }, [id, refreshSchedule])

  type AssignedRow = { id: string; name: string; code?: string; state: 'Active' | 'Break' | 'Offline' }

  const assignedFromAccounts: AssignedRow[] = accounts
    .filter((a) => a.storeId === store.id && (a.status === 'Deployed' || a.status === 'Certified'))
    .map((a) => {
      const state: 'Active' | 'Break' | 'Offline' =
        a.checkIn && !a.checkOut ? 'Active' : 'Offline'
      return { id: a.id, name: a.name, ...(a.code ? { code: a.code } : {}), state }
    })

  const assignedFromShifts: AssignedRow[] = schedule
    .filter((s) => s.storeId === store.id && s.baId && s.baName)
    .map((s) => {
      const ba = accounts.find((a) => a.id === String(s.baId))
      return {
        id: String(s.baId),
        name: s.baName as string,
        ...(ba?.code ? { code: ba.code } : {}),
        state: 'Offline' as const,
      }
    })

  const assignedById = new Map<string, AssignedRow>()
  for (const a of store.assigned) assignedById.set(a.id, a)
  for (const a of assignedFromShifts) {
    if (!assignedById.has(a.id)) assignedById.set(a.id, a)
  }
  for (const a of assignedFromAccounts) {
    const prev = assignedById.get(a.id)
    assignedById.set(
      a.id,
      prev
        ? {
            ...prev,
            name: a.name || prev.name,
            code: a.code || prev.code,
            state: a.state,
          }
        : a,
    )
  }
  const assigned = [...assignedById.values()]

  return (
    <div className="space-y-5">
      <Link to={`${base}/stores`} className="text-sm text-slate-500 hover:text-brand-600">
        ← Back to stores
      </Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <StatusBadge status={store.status} />
            <h2 className="mt-2 text-2xl font-bold">STORE #{store.id}</h2>
            <p className="text-slate-600">
              {store.name} · {store.city}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/ho/deployment">
              <Button variant="secondary">
                <CalendarClock size={15} /> Schedule BA
              </Button>
            </Link>
            <Link to={shopperPath(store)}>
              <Button>Open Shopper Experience</Button>
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Today's Footfall" value={store.todayFootfall.toLocaleString()} />
          <Stat label="BA Coverage" value={`${store.coverage}%`} />
          <Stat label="Engagement" value={`${store.engagement}%`} />
          <Stat label="Conversion" value={`${store.conversion}%`} />
        </div>
      </Card>

      <StoreQrCard store={store} />

      {record && (
        <Card>
          <h3 className="mb-3 font-semibold">Store details</h3>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Address" value={record.address} />
            <Detail label="Footfall" value={record.footfall} />
            <Detail
              label="Coordinates"
              value={record.latitude !== null && record.longitude !== null ? `${record.latitude}, ${record.longitude}` : ''}
            />
            <Detail label="Peak hours" value={record.peakHours} />
          </dl>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold">Assigned Ambassadors</h3>
          {assigned.length === 0 ? (
            <p className="text-sm text-slate-500">No BAs assigned â€” needs deployment.</p>
          ) : (
            <div className="space-y-2">
              {assigned.map((a) => (
                <Link
                  key={a.id}
                  to={`/ho/ambassadors/${a.id}`}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 hover:bg-brand-50"
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={a.name} size="sm" />
                    <div className="min-w-0">
                      {a.code ? (
                        <span className="font-mono text-xs font-semibold text-slate-500">
                          {a.code}
                        </span>
                      ) : null}
                      <span className={`text-sm font-medium ${a.code ? 'ml-1.5' : ''}`}>
                        {a.name}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={a.state} />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold">Peak Hours</h3>
          <div className="space-y-3">
            {store.peak.map((p) => (
              <div
                key={p}
                className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium"
              >
                {p}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value || '—'}</dd>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900">{value}</div>
    </div>
  )
}

export function DeploymentPage() {
  return <SchedulerPanel />
}

type TimeParts = { hour: string; minute: string; ampm: string }

function SchedulerPanel() {
  const accounts = useBaAccounts()
  const createdStores = useCreatedStores()
  const { schedule, loading, refreshSchedule } = useSchedule()
  const [monthYm, setMonthYm] = useState('2026-09')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [createTab, setCreateTab] = useState<'individual' | 'bulk'>('individual')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [previousBaId, setPreviousBaId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkFileName, setBulkFileName] = useState('')
  const [bulkResult, setBulkResult] = useState<BulkShiftParseResult | null>(null)
  const bulkInputRef = useRef<HTMLInputElement>(null)

  const deployable = accounts.filter((a) => !isDemoBa(a.id))
  const storeOptions =
    createdStores.length > 0
      ? createdStores.map((s) => ({
          id: s.id,
          name: s.name,
          city: s.city,
          code: s.code || storeCodeLabel(s.id),
          peak: s.peakHours ? [s.peakHours] : [],
        }))
      : stores.map((s) => ({
          id: s.id,
          name: s.name,
          city: s.city,
          code: storeCodeLabel(s.id),
          peak: s.peak,
        }))

  const [form, setForm] = useState({
    storeId: String(storeOptions[0]?.id ?? ''),
    baId: '' as string, // '' = unassigned
    start: { hour: '10', minute: '00', ampm: 'AM' } as TimeParts,
    end: { hour: '6', minute: '00', ampm: 'PM' } as TimeParts,
  })

  useEffect(() => {
    void Promise.all([
      syncStoresFromApi(),
      syncAmbassadorsFromApi(),
      refreshSchedule(monthYm),
    ]).catch(() => {})
  }, [refreshSchedule, monthYm])

  useEffect(() => {
    setForm((f) => ({
      ...f,
      storeId: f.storeId || String(storeOptions[0]?.id ?? ''),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeOptions.length])

  const conflictCount = schedule.filter((s) => s.status === 'Conflict').length
  const openCount = schedule.filter((s) => s.status === 'Open' || !s.baId).length
  const filledCount = schedule.filter((s) => s.status === 'Scheduled' && s.baId).length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return schedule
    return schedule.filter((slot) => {
      const storeMeta = storeOptions.find((s) => s.id === slot.storeId)
      const ba = accounts.find((a) => a.id === slot.baId)
      const hay = [
        slot.storeName,
        slot.city,
        storeMeta?.code,
        slot.baName,
        ba?.code,
        slot.shift,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [schedule, search, storeOptions, accounts])

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3200)
  }

  function openCreate(prefill?: {
    slotId?: string
    previousBaId?: string | null
    storeId?: string
    baId?: string | null
    shift?: string
  }) {
    setEditingId(prefill?.slotId ?? null)
    setPreviousBaId(prefill?.previousBaId ?? null)
    setCreateTab('individual')
    setBulkResult(null)
    setBulkFileName('')
    const parsed = prefill?.shift ? parseShiftLabelTimes(prefill.shift) : null
    const start = parsed ? partsFromHhmm(parsed.start) : { hour: '10', minute: '00', ampm: 'AM' }
    const end = parsed ? partsFromHhmm(parsed.end) : { hour: '6', minute: '00', ampm: 'PM' }
    setForm({
      storeId: prefill?.storeId ?? String(storeOptions[0]?.id ?? ''),
      baId: prefill?.baId ?? '',
      start,
      end,
    })
    setModalOpen(true)
  }

  async function onBulkFile(file: File | undefined) {
    if (!file) return
    setBulkBusy(true)
    setBulkFileName(file.name)
    await syncStoresFromApi().catch(() => {})
    setBulkResult(await parseBulkShiftFile(file))
    setBulkBusy(false)
  }

  async function importBulkRows() {
    if (!bulkResult?.rows.length) return
    if (!isApiAuthenticated()) {
      showToast('Sign in to Head Office to save deployment')
      return
    }
    await syncStoresFromApi().catch(() => {})
    await syncAmbassadorsFromApi().catch(() => {})
    const liveAccounts = getBaAccounts()
    const extras = liveAccounts
      .filter((a) => !isDemoBa(a.id))
      .map((a) => ({
        id: a.id,
        name: a.name,
        code: a.code,
        storeId: a.storeId,
        status: a.status,
      }))
    const storeExtras = storeOptions.map((s) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      code: s.code,
    }))

    setBulkBusy(true)
    let saved = 0
    const errors: string[] = [...bulkResult.errors]
    let firstMonth = monthYm
    // Same display name can be multiple BAs — once a name-match claims an id, next row gets another.
    const claimedByName = new Set<string>()

    for (const r of bulkResult.rows) {
      let matchedByName = false
      let ba = resolveBaByCode(r.input.baCode, extras)
      if (!ba || isDemoBa(ba.id)) {
        ba = resolveBaByName(r.input.baCode, extras, claimedByName)
        matchedByName = !!ba && !isDemoBa(ba.id)
      }
      if (!ba || isDemoBa(ba.id)) {
        errors.push(
          `Row ${r.row}: unknown BA "${r.input.baCode}" — use a BA code (BA-…) or exact name from Ambassadors.`,
        )
        continue
      }
      const expanded = expandBulkShiftRow(r.input, storeExtras)
      if (expanded.error) {
        errors.push(`Row ${r.row}: ${expanded.error}`)
        continue
      }
      if (!expanded.slots.length) continue
      firstMonth = r.input.month
      try {
        await deployAmbassador(ba.id, expanded.slots[0].storeId)
        const ex = extras.find((e) => e.id === ba.id)
        if (ex) {
          ex.storeId = expanded.slots[0].storeId
          ex.status = 'Deployed'
        }
        if (matchedByName) claimedByName.add(ba.id)
      } catch (err) {
        errors.push(
          `Row ${r.row}: deploy failed — ${err instanceof Error ? err.message : 'error'}`,
        )
        continue
      }
      for (const slot of expanded.slots) {
        try {
          await createShift({
            storeId: slot.storeId,
            ambassadorId: ba.id,
            dateIso: slot.ymd,
            shift: slot.shift,
            peakRecommended: slot.peakRecommended,
          })
          saved += 1
        } catch (err) {
          errors.push(
            `Failed ${ba.name} @ ${slot.storeName} (${slot.ymd}): ${
              err instanceof Error ? err.message : 'save failed'
            }`,
          )
        }
      }
    }

    setBulkBusy(false)
    if (saved) {
      setMonthYm(firstMonth)
      await Promise.all([refreshSchedule(firstMonth), syncAmbassadorsFromApi().catch(() => {})])
      setModalOpen(false)
      setBulkResult(null)
      setBulkFileName('')
      showToast(`Imported ${saved} month assignment${saved === 1 ? '' : 's'} from Excel.`)
      return
    }
    setBulkResult({ rows: bulkResult.rows, errors: errors.length ? errors : ['Nothing could be imported.'] })
  }

  async function saveAssignment() {
    const store = storeOptions.find((s) => String(s.id) === form.storeId)
    if (!store) {
      showToast('Pick a store')
      return
    }
    const startHhmm = hhmmFromParts(form.start.hour, form.start.minute, form.start.ampm)
    const endHhmm = hhmmFromParts(form.end.hour, form.end.minute, form.end.ampm)
    if (startHhmm >= endHhmm) {
      showToast('End time must be after start time')
      return
    }
    if (!isApiAuthenticated()) {
      showToast('Sign in to Head Office to save deployment')
      return
    }

    const ba = form.baId ? deployable.find((a) => a.id === form.baId) : null
    if (form.baId && !ba) {
      showToast('Pick a certified brand ambassador')
      return
    }

    const shift = shiftLabelFromTimes(startHhmm, endHhmm)
    const peakHit = store.peak.some((p) =>
      shift.toLowerCase().includes((p.split(/[—-]/)[0] ?? '').trim().toLowerCase().slice(0, 4)),
    )
    const peakRecommended = peakHit || store.peak.length > 0

    setSaving(true)
    try {
      if (editingId) {
        // Update a single existing shift row
        if (ba) {
          await assignBaToStoreShift({
            shiftId: editingId,
            storeId: store.id,
            ambassadorId: ba.id,
            previousAmbassadorId: previousBaId,
            dateIso: schedule.find((s) => s.id === editingId)?.dateIso || `${monthYm}-01`,
            shift,
            peakRecommended,
          })
        } else {
          await updateShift(editingId, {
            storeId: store.id,
            ambassadorId: null,
            shift,
            peakRecommended,
          })
          if (previousBaId) await undeployAmbassador(previousBaId).catch(() => {})
        }
        showToast(`Updated shift · ${store.name}`)
      } else {
        // One assignment for the whole month (hours apply all month)
        if (ba) await deployAmbassador(ba.id, store.id)
        const dateIso = `${monthYm}-01`
        await createShift({
          storeId: store.id,
          ambassadorId: ba?.id ?? null,
          dateIso,
          shift,
          peakRecommended,
        })
        showToast(
          ba
            ? `Scheduled ${ba.name} → ${store.name} · ${label}`
            : `Open shift created · ${store.name} · ${label}`,
        )
      }
      await Promise.all([refreshSchedule(monthYm), syncAmbassadorsFromApi().catch(() => {})])
      setModalOpen(false)
      setPreviousBaId(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save assignment')
    } finally {
      setSaving(false)
    }
  }

  async function removeSlot(id: string) {
    if (!isApiAuthenticated()) {
      showToast('Sign in to delete shifts')
      return
    }
    try {
      const slot = schedule.find((s) => s.id === id)
      await deleteShift(id)
      if (slot?.baId) await undeployAmbassador(slot.baId).catch(() => {})
      await refreshSchedule(monthYm)
      showToast('Shift deleted')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete shift')
    }
  }

  const selectedStore = storeOptions.find((s) => String(s.id) === form.storeId)
  const label = monthLabel(monthYm)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Intelligent Store Deployment"
        description="Schedule certified BAs into peak shifts and activate QR"
        actions={
          <Button onClick={() => openCreate()} disabled={!storeOptions.length}>
            <CalendarClock size={15} /> Create shifts
          </Button>
        }
      />

      {toast && (
        <div className="animate-fade-up rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="text-xs text-slate-500">Monthly shifts</div>
          <div className="text-2xl font-bold">{schedule.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">Scheduled</div>
          <div className="text-2xl font-bold text-emerald-600">{filledCount}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">Open (need BA)</div>
          <div className="text-2xl font-bold text-amber-600">{openCount}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">Conflicts</div>
          <div className="text-2xl font-bold text-rose-600">{conflictCount}</div>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-900">Deployment scheduler</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1 py-0.5">
              <button
                type="button"
                className="rounded-full p-1.5 text-slate-600 hover:bg-slate-50"
                onClick={() => setMonthYm((m) => shiftMonth(m, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-[9.5rem] text-center text-sm font-semibold text-slate-800">{label}</span>
              <button
                type="button"
                className="rounded-full p-1.5 text-slate-600 hover:bg-slate-50"
                onClick={() => setMonthYm((m) => shiftMonth(m, 1))}
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <Button size="sm" onClick={() => openCreate()} disabled={!storeOptions.length}>
              <Plus size={14} /> Add shift
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <input
            type="search"
            placeholder="Search store, BA name or code..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading && <p className="mb-3 text-xs text-slate-400">Loading shifts…</p>}

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
            No shifts for {label}.{' '}
            <button type="button" className="font-semibold text-brand-600" onClick={() => openCreate()}>
              Add one
            </button>
          </div>
        ) : (
          <TableScroll minWidth={860}>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Ambassador</th>
                  <th className="px-4 py-3">Shift time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((slot) => {
                  const storeMeta = storeOptions.find((s) => s.id === slot.storeId)
                  const ba = accounts.find((a) => a.id === slot.baId)
                  const statusLabel =
                    slot.status === 'Conflict'
                      ? 'Conflict'
                      : slot.baId
                        ? 'Scheduled'
                        : 'Open'
                  return (
                    <tr key={slot.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{slot.storeName}</div>
                        <div className="text-xs text-slate-400">
                          {storeMeta?.code || storeCodeLabel(slot.storeId)} · {slot.city}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {slot.baName ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={slot.baName} size="sm" />
                            <div>
                              <div className="font-medium">{slot.baName}</div>
                              {ba?.code && <div className="text-xs text-slate-400">{ba.code}</div>}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{slot.shift}</div>
                        <div className="text-xs text-slate-400">{label}</div>
                        {slot.peakRecommended && (
                          <span className="mt-1 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                            Peak recommended
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={statusLabel} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-3 text-sm font-semibold">
                          <button
                            type="button"
                            className="text-brand-600 hover:underline"
                            onClick={() =>
                              openCreate({
                                slotId: slot.id,
                                storeId: String(slot.storeId),
                                baId: slot.baId,
                                shift: slot.shift,
                                previousBaId: slot.baId,
                              })
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-rose-600 hover:underline"
                            onClick={() => void removeSlot(slot.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setBulkResult(null)
          setBulkFileName('')
        }}
        title={editingId ? `Edit shift · ${label}` : 'Create shifts'}
      >
        <div className="space-y-4">
          {!editingId && (
            <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
              <button
                type="button"
                className={`flex-1 rounded-lg px-3 py-2 transition ${
                  createTab === 'individual' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
                onClick={() => setCreateTab('individual')}
              >
                Individual
              </button>
              <button
                type="button"
                className={`flex-1 rounded-lg px-3 py-2 transition ${
                  createTab === 'bulk' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
                onClick={() => setCreateTab('bulk')}
              >
                Bulk (Excel)
              </button>
            </div>
          )}

          {(editingId || createTab === 'individual') && (
            <div className="space-y-3">
              {!editingId && (
                <p className="text-xs text-slate-500">
                  New shift · {label} — one assignment for the whole month.
                </p>
              )}
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Store</span>
                <Select
                  className="w-full"
                  value={form.storeId}
                  onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
                >
                  {storeOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name} ({s.city})
                    </option>
                  ))}
                </Select>
              </label>

              {selectedStore && selectedStore.peak.length > 0 && (
                <div className="rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-800">
                  Peak hours recommended: {selectedStore.peak.join(' · ')}
                </div>
              )}

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Brand Ambassador</span>
                <Select
                  className="w-full"
                  value={form.baId}
                  onChange={(e) => setForm((f) => ({ ...f, baId: e.target.value }))}
                >
                  <option value="">Unassigned (open shift)</option>
                  {deployable.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code ? `${a.code} · ` : ''}
                      {a.name}
                      {a.city ? ` (${a.city})` : ''}
                    </option>
                  ))}
                </Select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <TimePickers
                  label="Start time"
                  value={form.start}
                  onChange={(start) => setForm((f) => ({ ...f, start }))}
                />
                <TimePickers
                  label="End time"
                  value={form.end}
                  onChange={(end) => setForm((f) => ({ ...f, end }))}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {editingId
                  ? 'Updates this shift only.'
                  : 'Same hours for the whole month, Karachi time.'}
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void saveAssignment()} disabled={saving || !storeOptions.length}>
                  {saving ? 'Saving…' : 'Save shift'}
                </Button>
              </div>
            </div>
          )}

          {!editingId && createTab === 'bulk' && (
            <div className="space-y-4 text-sm">
              <div className="space-y-2">
                <div className="font-semibold text-slate-900">1. Download the template</div>
                <p className="text-xs text-slate-500">
                  Put BA <strong>names</strong> and store <strong>names</strong> (or codes). Example: Ammara bibi →
                  Al Fazal Store, 12:00 PM–8:00 PM, 2026-09. The system converts names to BA/Store codes and assigns
                  the BA to that store for the whole month.
                </p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void downloadBulkShiftTemplate({
                      defaultMonth: monthYm,
                      baSamples: deployable
                        .filter((a) => a.code)
                        .slice(0, 8)
                        .map((a) => ({ code: a.code, name: a.name })),
                      storeSamples: storeOptions.slice(0, 40).map((s) => ({
                        id: s.id,
                        name: s.name,
                        city: s.city,
                        code: s.code,
                      })),
                    })
                  }
                >
                  <Download size={14} /> Download shift template
                </Button>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-4">
                <div className="font-semibold text-slate-900">2. Upload the filled template</div>
                <input
                  ref={bulkInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    void onBulkFile(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    disabled={bulkBusy}
                    onClick={() => bulkInputRef.current?.click()}
                  >
                    <Upload size={14} />{' '}
                    {bulkBusy ? 'Working…' : bulkResult ? 'Choose another file' : 'Upload Excel file'}
                  </Button>
                  {bulkFileName && <span className="truncate text-xs text-slate-500">{bulkFileName}</span>}
                </div>
              </div>

              {bulkResult && (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  {bulkResult.rows.length > 0 && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                      {bulkResult.rows.length}{' '}
                      {bulkResult.rows.length === 1 ? 'row is' : 'rows are'} ready to import (one
                      assignment per row for its Month).
                    </div>
                  )}
                  {bulkResult.errors.length > 0 && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                      <div className="font-semibold">
                        {bulkResult.rows.length > 0
                          ? `${bulkResult.errors.length} ${
                              bulkResult.errors.length === 1 ? 'issue' : 'issues'
                            } found:`
                          : 'Nothing can be imported yet:'}
                      </div>
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                        {bulkResult.errors.slice(0, 8).map((err) => (
                          <li key={err}>{err}</li>
                        ))}
                      </ul>
                      {bulkResult.errors.length > 8 && (
                        <div className="mt-1 font-medium">
                          …and {bulkResult.errors.length - 8} more
                        </div>
                      )}
                    </div>
                  )}
                  {bulkResult.rows.length > 0 && (
                    <Button
                      className="w-full"
                      disabled={bulkBusy}
                      onClick={() => void importBulkRows()}
                    >
                      {bulkBusy ? 'Saving…' : 'Import shifts'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function TimePickers({
  label,
  value,
  onChange,
}: {
  label: string
  value: TimeParts
  onChange: (next: TimeParts) => void
}) {
  return (
    <div className="text-sm">
      <div className="mb-1 font-medium text-slate-700">{label}</div>
      <div className="flex gap-2">
        <Select
          className="w-full"
          value={value.hour}
          onChange={(e) => onChange({ ...value, hour: e.target.value })}
        >
          {HOUR_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </Select>
        <Select
          className="w-full"
          value={value.minute}
          onChange={(e) => onChange({ ...value, minute: e.target.value })}
        >
          {MINUTE_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Select
          className="w-full"
          value={value.ampm}
          onChange={(e) => onChange({ ...value, ampm: e.target.value })}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </Select>
      </div>
    </div>
  )
}

