import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import {
  ambassadors,
  initialSchedule,
  scheduleDays,
  shiftOptions,
  stores,
  type ShiftSlot,
} from '../../data/mock'
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
  Tabs,
} from '../../components/ui'
import { CalendarClock, Plus, QrCode, Sparkles } from 'lucide-react'

const deployable = ambassadors.filter(
  (a) => a.status === 'Certified' || a.status === 'Deployed',
)

export function StoresPage() {
  return (
    <div>
      <PageHeader
        title="Stores"
        description={`${stores.length} outlets · prioritization by footfall, coverage & peak hours`}
        actions={
          <Link to="/ho/deployment?tab=Scheduler">
            <Button variant="secondary">Open Scheduler</Button>
          </Link>
        }
      />
      <Card padding={false}>
        <TableScroll minWidth={680}>
          <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Footfall</th>
              <th className="px-4 py-3">BAs</th>
              <th className="px-4 py-3">Coverage</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <Link to={`/ho/stores/${s.id}`} className="font-semibold text-brand-600 hover:underline">
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
              </tr>
            ))}
          </tbody>
        </table>
        </TableScroll>
      </Card>
    </div>
  )
}

export function StoreDetailPage() {
  const { id } = useParams()
  const store = stores.find((s) => String(s.id) === id) ?? stores[0]
  const [qrOpen, setQrOpen] = useState(false)

  return (
    <div className="space-y-5">
      <Link to="/ho/stores" className="text-sm text-slate-500 hover:text-brand-600">
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
            <Link to="/ho/deployment?tab=Scheduler">
              <Button variant="secondary">
                <CalendarClock size={15} /> Schedule BA
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => setQrOpen(true)}>
              <QrCode size={15} /> QR Preview
            </Button>
            <Link to="/shopper">
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

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold">Assigned Ambassadors</h3>
          {store.assigned.length === 0 ? (
            <p className="text-sm text-slate-500">No BAs assigned — needs deployment.</p>
          ) : (
            <div className="space-y-2">
              {store.assigned.map((a) => (
                <Link
                  key={a.id}
                  to={`/ho/ambassadors/${a.id}`}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 hover:bg-brand-50"
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={a.name} size="sm" />
                    <span className="text-sm font-medium">{a.name}</span>
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
          <h3 className="mt-5 mb-2 font-semibold">QR Activation</h3>
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-brand-500/40"
          >
            <img
              src="/store-qr.png"
              alt={`QR code for ${store.qrCode}`}
              className="mx-auto h-36 w-36 object-contain"
            />
          </button>
          <p className="mt-2 text-sm text-slate-500">Code: {store.qrCode}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => setQrOpen(true)}>
              QR Preview
            </Button>
            <Button size="sm" variant="secondary">
              Regenerate QR
            </Button>
          </div>
        </Card>
      </div>

      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title="QR Activation Preview">
        <div className="flex flex-col items-center text-center">
          <img
            src="/store-qr.png"
            alt={`Scan me — ${store.qrCode}`}
            className="w-56 max-w-full object-contain"
          />
          <p className="mt-3 text-sm font-mono text-slate-600">{store.qrCode}</p>
          <p className="mt-1 text-xs text-slate-400">
            Scan opens browser shopper journey — no app download
          </p>
          <Link to="/shopper" className="mt-4 w-full" onClick={() => setQrOpen(false)}>
            <Button className="w-full">Simulate Scan → Shopper</Button>
          </Link>
        </div>
      </Modal>
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
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'Scheduler' ? 'Scheduler' : 'Priority'
  const setTab = (t: string) => setParams(t === 'Priority' ? {} : { tab: t })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Intelligent Store Deployment"
        description="Prioritize outlets, schedule certified BAs into peak shifts, and activate QR"
      />
      <Tabs tabs={['Priority', 'Scheduler']} value={tab} onChange={setTab} />
      {tab === 'Priority' ? <PriorityPanel /> : <SchedulerPanel />}
    </div>
  )
}

function PriorityPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {stores
        .slice()
        .sort((a, b) => b.coverage - a.coverage)
        .map((s, i) => (
          <Card key={s.id}>
            <div className="text-xs font-bold text-brand-600">Priority #{i + 1}</div>
            <h3 className="mt-1 font-semibold">
              #{s.id} {s.name}
            </h3>
            <p className="text-sm text-slate-500">{s.city}</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Footfall</span>
                <StatusBadge status={s.footfall} />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Coverage need</span>
                <span className="font-semibold">{100 - s.coverage}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Peak</span>
                <span className="text-right text-xs">{s.peak[0]}</span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Link to={`/ho/stores/${s.id}`} className="flex-1">
                <Button className="w-full" size="sm" variant="secondary">
                  View
                </Button>
              </Link>
              <Link to="/ho/deployment?tab=Scheduler" className="flex-1">
                <Button className="w-full" size="sm">
                  Schedule
                </Button>
              </Link>
            </div>
          </Card>
        ))}
    </div>
  )
}

function SchedulerPanel() {
  const [schedule, setSchedule] = useState<ShiftSlot[]>(initialSchedule)
  const [day, setDay] = useState('Mon')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [form, setForm] = useState({
    storeId: String(stores[0].id),
    baId: deployable[0]?.id ?? '',
    shift: shiftOptions[1],
    day: 'Mon',
  })

  const dayMeta = scheduleDays.find((d) => d.key === day)!
  const daySlots = useMemo(() => schedule.filter((s) => s.day === day), [schedule, day])
  const openCount = schedule.filter((s) => s.status === 'Open').length
  const filledCount = schedule.filter((s) => s.status === 'Scheduled').length

  function openCreate(prefill?: Partial<typeof form> & { slotId?: string }) {
    setEditingId(prefill?.slotId ?? null)
    setForm({
      storeId: prefill?.storeId ?? String(stores[0].id),
      baId: prefill?.baId ?? deployable[0]?.id ?? '',
      shift: prefill?.shift ?? shiftOptions[1],
      day: prefill?.day ?? day,
    })
    setModalOpen(true)
  }

  function autoFillOpen() {
    let next = [...schedule]
    let assigned = 0
    const pool = [...deployable]
    let pi = 0
    next = next.map((slot) => {
      if (slot.status !== 'Open' || !pool.length) return slot
      const ba = pool[pi % pool.length]
      pi += 1
      assigned += 1
      return {
        ...slot,
        baId: ba.id,
        baName: ba.name,
        status: 'Scheduled' as const,
      }
    })
    setSchedule(next)
    setToast(`Auto-scheduled ${assigned} open peak shifts with certified BAs`)
    setTimeout(() => setToast(null), 3500)
  }

  function saveAssignment() {
    const store = stores.find((s) => String(s.id) === form.storeId)!
    const ba = ambassadors.find((a) => a.id === form.baId)
    if (!ba || (ba.status !== 'Certified' && ba.status !== 'Deployed')) {
      setToast('Only certified / deployed BAs can be scheduled')
      setTimeout(() => setToast(null), 3000)
      return
    }
    const dayInfo = scheduleDays.find((d) => d.key === form.day)!
    const peakHit = store.peak.some((p) =>
      form.shift.includes(p.split('—')[0]?.trim().split(' ')[0] ?? '___'),
    )

    if (editingId) {
      setSchedule((prev) =>
        prev.map((s) =>
          s.id === editingId
            ? {
                ...s,
                day: form.day,
                date: dayInfo.date,
                storeId: store.id,
                storeName: store.name,
                city: store.city,
                shift: form.shift,
                peakRecommended: peakHit || store.peak.length > 0,
                baId: ba.id,
                baName: ba.name,
                status: 'Scheduled',
              }
            : s,
        ),
      )
    } else {
      const id = `s${Date.now()}`
      setSchedule((prev) => [
        ...prev,
        {
          id,
          day: form.day,
          date: dayInfo.date,
          storeId: store.id,
          storeName: store.name,
          city: store.city,
          shift: form.shift,
          peakRecommended: true,
          baId: ba.id,
          baName: ba.name,
          status: 'Scheduled',
        },
      ])
    }
    setModalOpen(false)
    setDay(form.day)
    setToast(`Scheduled ${ba.name} → ${store.name}`)
    setTimeout(() => setToast(null), 3000)
  }

  function clearSlot(id: string) {
    setSchedule((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, baId: null, baName: null, status: 'Open' as const } : s,
      ),
    )
  }

  const selectedStore = stores.find((s) => String(s.id) === form.storeId)

  return (
    <div className="space-y-5">
      {toast && (
        <div className="animate-fade-up rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs text-slate-500">Week shifts</div>
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
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Deployment scheduler</h3>
            <p className="text-xs text-slate-500">
              Week of 24–30 Aug 2026 · only certified BAs can be assigned
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={autoFillOpen}>
              <Sparkles size={14} /> Auto-fill open peaks
            </Button>
            <Button size="sm" onClick={() => openCreate({ day })}>
              <Plus size={14} /> New shift
            </Button>
          </div>
        </div>

        <div className="mb-4 overflow-x-auto">
          <div className="grid min-w-[560px] grid-cols-7 gap-2">
          {scheduleDays.map((d) => {
            const count = schedule.filter((s) => s.day === d.key).length
            const open = schedule.filter((s) => s.day === d.key && s.status === 'Open').length
            return (
              <button
                key={d.key}
                onClick={() => setDay(d.key)}
                className={`rounded-xl border px-2 py-3 text-center transition ${
                  day === d.key
                    ? 'border-brand-500 bg-brand-500 text-white shadow-md'
                    : 'border-slate-200 bg-white hover:border-brand-500/40'
                }`}
              >
                <div className="text-xs font-semibold">{d.label}</div>
                <div className={`text-[10px] ${day === d.key ? 'text-blue-100' : 'text-slate-400'}`}>
                  {d.date}
                </div>
                <div className={`mt-1 text-[10px] font-medium ${day === d.key ? 'text-white' : 'text-slate-500'}`}>
                  {count} shifts{open ? ` · ${open} open` : ''}
                </div>
              </button>
            )
          })}
          </div>
        </div>

        <div className="mb-3 text-sm font-semibold text-slate-800">
          {dayMeta.label} {dayMeta.date}
        </div>

        {daySlots.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
            No shifts this day.{' '}
            <button className="font-semibold text-brand-600" onClick={() => openCreate({ day })}>
              Add one
            </button>
          </div>
        ) : (
          <TableScroll minWidth={720}>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Shift</th>
                  <th className="px-4 py-3">Ambassador</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {daySlots.map((slot) => (
                  <tr key={slot.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        #{slot.storeId} {slot.storeName}
                      </div>
                      <div className="text-xs text-slate-400">{slot.city}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{slot.shift}</div>
                      {slot.peakRecommended && (
                        <span className="mt-1 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                          Peak recommended
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {slot.baName ? (
                        <div className="flex items-center gap-2">
                          <Avatar name={slot.baName} size="sm" />
                          <span>{slot.baName}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={slot.status === 'Open' ? 'Pending' : 'Active'} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            openCreate({
                              slotId: slot.id,
                              storeId: String(slot.storeId),
                              baId: slot.baId ?? deployable[0]?.id,
                              shift: slot.shift,
                              day: slot.day,
                            })
                          }
                        >
                          {slot.baId ? 'Reassign' : 'Assign'}
                        </Button>
                        {slot.baId && (
                          <Button size="sm" variant="ghost" onClick={() => clearSlot(slot.id)}>
                            Clear
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold">Full week board</h3>
        <div className="overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-7 gap-2">
            {scheduleDays.map((d) => (
              <div key={d.key} className="rounded-xl bg-slate-50 p-2">
                <div className="mb-2 text-center text-xs font-bold text-slate-600">
                  {d.label}
                  <div className="font-normal text-slate-400">{d.date}</div>
                </div>
                <div className="space-y-1.5">
                  {schedule
                    .filter((s) => s.day === d.key)
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setDay(d.key)
                          openCreate({
                            slotId: s.id,
                            storeId: String(s.storeId),
                            baId: s.baId ?? deployable[0]?.id,
                            shift: s.shift,
                            day: s.day,
                          })
                        }}
                        className={`w-full rounded-lg px-2 py-1.5 text-left text-[10px] leading-snug ${
                          s.status === 'Open'
                            ? 'border border-dashed border-amber-300 bg-amber-50 text-amber-900'
                            : 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-100'
                        }`}
                      >
                        <div className="font-semibold">#{s.storeId}</div>
                        <div className="truncate">{s.baName ?? 'Open slot'}</div>
                        <div className="truncate opacity-70">{s.shift}</div>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Assign / update shift' : 'Schedule new shift'}
      >
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Day</span>
            <Select
              className="w-full"
              value={form.day}
              onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
            >
              {scheduleDays.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label} · {d.date}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Store</span>
            <Select
              className="w-full"
              value={form.storeId}
              onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} {s.name} ({s.city})
                </option>
              ))}
            </Select>
          </label>
          {selectedStore && (
            <div className="rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-800">
              Peak hours recommended: {selectedStore.peak.join(' · ')}
            </div>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Shift</span>
            <Select
              className="w-full"
              value={form.shift}
              onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))}
            >
              {shiftOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              Brand Ambassador (certified only)
            </span>
            <Select
              className="w-full"
              value={form.baId}
              onChange={(e) => setForm((f) => ({ ...f, baId: e.target.value }))}
            >
              {deployable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.certification} · readiness {a.readiness}%
                </option>
              ))}
            </Select>
          </label>
          <p className="text-[11px] text-slate-400">
            Pending / training-only candidates are gated out until certified (Step 1).
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAssignment}>Save schedule</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
