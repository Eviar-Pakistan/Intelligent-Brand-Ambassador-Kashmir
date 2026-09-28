import { Link, useParams } from 'react-router-dom'
import { useRef, useState } from 'react'
import {
  ambassadors,
  scheduleDays,
  shiftOptions,
  stores,
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
} from '../../components/ui'
import { CalendarClock, Download, FileSpreadsheet, Plus, Upload } from 'lucide-react'
import { useSchedule } from '../../context/ScheduleContext'
import { StoreQrCard } from '../../components/StoreQrCard'
import { findCreatedStore, shopperPath, useCreatedStores } from '../../lib/storeRegistry'
import { BulkStoreModal, useRoleBase } from './StoreCreation'
import { useBaAccounts } from '../../lib/baAccounts'
import { resolveBaByCode } from '../../lib/baCodes'
import {
  downloadBulkShiftTemplate,
  expandBulkShiftRow,
  parseBulkShiftFile,
  type BulkShiftParseResult,
} from '../../lib/bulkShiftUpload'

const deployable = ambassadors.filter(
  (a) => a.status === 'Certified' || a.status === 'Deployed',
)

export function StoresPage() {
  const base = useRoleBase()
  const [bulkOpen, setBulkOpen] = useState(false)
  useCreatedStores() // re-render when stores are added

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
        <TableScroll minWidth={680}>
          <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Footfall</th>
              <th className="px-4 py-3">BAs</th>
              <th className="px-4 py-3">Coverage</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Shopper QR</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/70">
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
            ))}
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
  const store = stores.find((s) => String(s.id) === id) ?? stores[0]
  const record = findCreatedStore(store.id)

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
            <Detail label="Contact person" value={record.contactPerson} />
            <Detail label="Contact phone" value={record.contactPhone} />
          </dl>
        </Card>
      )}

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
  return (
    <div className="space-y-5">
      <PageHeader
        title="Intelligent Store Deployment"
        description="Schedule certified BAs into peak shifts and activate QR"
      />
      <SchedulerPanel />
    </div>
  )
}

function SchedulerPanel() {
  const { schedule, setSchedule, clearBaFromSlot } = useSchedule()
  const [modalOpen, setModalOpen] = useState(false)
  const [bulkShiftOpen, setBulkShiftOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [form, setForm] = useState({
    storeId: String(stores[0].id),
    baId: deployable[0]?.id ?? '',
    shift: shiftOptions[1],
    day: 'Mon',
  })

  const openCount = schedule.filter((s) => s.status === 'Open').length
  const filledCount = schedule.filter((s) => s.status === 'Scheduled').length

  function openCreate(prefill?: Partial<typeof form> & { slotId?: string }) {
    setEditingId(prefill?.slotId ?? null)
    setForm({
      storeId: prefill?.storeId ?? String(stores[0].id),
      baId: prefill?.baId ?? deployable[0]?.id ?? '',
      shift: prefill?.shift ?? shiftOptions[1],
      day: prefill?.day ?? 'Mon',
    })
    setModalOpen(true)
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
    setToast(`Scheduled ${ba.name} → ${store.name}`)
    setTimeout(() => setToast(null), 3000)
  }

  function clearSlot(id: string) {
    clearBaFromSlot(id)
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
            <Button size="sm" variant="secondary" onClick={() => setBulkShiftOpen(true)}>
              <FileSpreadsheet size={14} /> Bulk Shift
            </Button>
            <Button size="sm" onClick={() => openCreate()}>
              <Plus size={14} /> New shift
            </Button>
          </div>
        </div>

        {schedule.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
            No shifts scheduled.{' '}
            <button className="font-semibold text-brand-600" onClick={() => openCreate()}>
              Add one
            </button>
          </div>
        ) : (
          <TableScroll minWidth={780}>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Shift</th>
                  <th className="px-4 py-3">Ambassador</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((slot) => (
                  <tr key={slot.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium">{slot.day}</div>
                      <div className="text-xs text-slate-400">{slot.date}</div>
                    </td>
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
            Only certified or deployed ambassadors can be assigned.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAssignment}>Save schedule</Button>
          </div>
        </div>
      </Modal>

      <BulkShiftModal
        open={bulkShiftOpen}
        onClose={() => setBulkShiftOpen(false)}
        onImported={(count) => {
          setToast(`Imported ${count} shift ${count === 1 ? 'slot' : 'slots'} from Excel.`)
          setTimeout(() => setToast(null), 3200)
        }}
      />
    </div>
  )
}

/** Download template → fill → upload → create shifts across a date range. */
function BulkShiftModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: (count: number) => void
}) {
  const accounts = useBaAccounts()
  const { setSchedule } = useSchedule()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<BulkShiftParseResult | null>(null)

  function close() {
    setResult(null)
    setFileName('')
    onClose()
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setFileName(file.name)
    setResult(await parseBulkShiftFile(file))
    setBusy(false)
  }

  function importRows() {
    if (!result?.rows.length) return
    const extras = accounts.map((a) => ({ id: a.id, name: a.name, code: a.code }))
    const errors: string[] = []
    const toAdd: {
      day: string
      date: string
      storeId: number
      storeName: string
      city: string
      shift: string
      peakRecommended: boolean
      baId: string
      baName: string
      status: 'Scheduled'
    }[] = []

    for (const r of result.rows) {
      const ba = resolveBaByCode(r.input.baCode, extras)
      if (!ba) {
        errors.push(`Row ${r.row}: unknown BA Code "${r.input.baCode}"`)
        continue
      }
      const expanded = expandBulkShiftRow(r.input)
      if (expanded.error) {
        errors.push(`Row ${r.row}: ${expanded.error}`)
        continue
      }
      for (const slot of expanded.slots) {
        toAdd.push({
          day: slot.day,
          date: slot.date,
          storeId: slot.storeId,
          storeName: slot.storeName,
          city: slot.city,
          shift: slot.shift,
          peakRecommended: slot.peakRecommended,
          baId: ba.id,
          baName: ba.name,
          status: 'Scheduled',
        })
      }
    }

    if (!toAdd.length) {
      setResult({ rows: [], errors: errors.length ? errors : ['Nothing could be imported.'] })
      return
    }

    setSchedule((prev) => [
      ...prev,
      ...toAdd.map((s, i) => ({ ...s, id: `s${Date.now()}-${i}` })),
    ])
    close()
    onImported(toAdd.length)
  }

  return (
    <Modal open={open} onClose={close} title="Bulk Shift">
      <div className="space-y-4 text-sm">
        <div className="space-y-2">
          <div className="font-semibold text-slate-900">1. Download the template</div>
          <p className="text-xs text-slate-500">
            Columns: BA Code, Store Code, Start Date, End Date, Shift Start Date, Shift End Date.
          </p>
          <Button variant="secondary" onClick={() => void downloadBulkShiftTemplate()}>
            <Download size={14} /> Download shift template
          </Button>
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-4">
          <div className="font-semibold text-slate-900">2. Upload the filled template</div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <div className="flex items-center gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Upload size={14} /> {busy ? 'Checking…' : result ? 'Choose another file' : 'Upload Excel file'}
            </Button>
            {fileName && <span className="truncate text-xs text-slate-500">{fileName}</span>}
          </div>
        </div>

        {result && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            {result.rows.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                {result.rows.length} {result.rows.length === 1 ? 'row is' : 'rows are'} ready to import
                (expands to one shift per day in each date range).
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                <div className="font-semibold">
                  {result.rows.length > 0
                    ? `${result.errors.length} ${result.errors.length === 1 ? 'issue' : 'issues'} found:`
                    : 'Nothing can be imported yet:'}
                </div>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                  {result.errors.slice(0, 8).map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
                {result.errors.length > 8 && (
                  <div className="mt-1 font-medium">…and {result.errors.length - 8} more</div>
                )}
              </div>
            )}
            {result.rows.length > 0 && (
              <Button className="w-full" onClick={importRows}>
                Import shifts
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
