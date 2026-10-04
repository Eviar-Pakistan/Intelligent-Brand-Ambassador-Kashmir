import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { Button, Card, Modal, PageHeader } from '../../components/ui'
import {
  CITIES,
  DEFAULT_PEAK_HOURS,
  FOOTFALLS,
  createStoresAsync,
  downloadStoreLinks,
  downloadStoreTemplate,
  parseStoreFile,
  storeExists,
  type CreatedStore,
  type Footfall,
  type StoreParseResult,
} from '../../lib/storeRegistry'

/** '/ho', '/manager' or '/admin' — store pages are shared between the three experiences. */
export function useRoleBase() {
  const { pathname } = useLocation()
  return `/${pathname.split('/')[1]}`
}

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500'

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-sm ${className ?? ''}`}>
      <span className="mb-1.5 block font-semibold text-slate-800">{label}</span>
      {children}
    </label>
  )
}

const emptyForm = {
  code: '',
  name: '',
  city: CITIES[0],
  footfall: 'Medium' as Footfall,
  latitude: '',
  longitude: '',
  peakHours: DEFAULT_PEAK_HOURS,
}

export function CreateStorePage() {
  const navigate = useNavigate()
  const base = useRoleBase()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (key: keyof typeof emptyForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm({ ...form, [key]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    const code = form.code.trim()
    const name = form.name.trim()
    if (!code) return setError('Store code is required.')
    if (!name) return setError('Store name is required.')
    if (storeExists(name, form.city)) return setError(`A store named "${name}" already exists in ${form.city}.`)

    const coord = (text: string, limit: number, label: string) => {
      if (!text.trim()) return null
      const n = Number(text)
      if (!Number.isFinite(n) || Math.abs(n) > limit) {
        setError(`${label} must be a number between -${limit} and ${limit}.`)
        return undefined
      }
      return n
    }
    const latitude = coord(form.latitude, 90, 'Latitude')
    if (latitude === undefined) return
    const longitude = coord(form.longitude, 180, 'Longitude')
    if (longitude === undefined) return

    setBusy(true)
    setError(null)
    try {
      const [store] = await createStoresAsync([
        {
          code,
          name,
          city: form.city,
          footfall: form.footfall,
          address: form.city,
          latitude,
          longitude,
          peakHours: form.peakHours.trim() || DEFAULT_PEAK_HOURS,
        },
      ])
      navigate(`${base}/stores/${store.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create store. Is the backend running?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link to={`${base}/stores`} className="inline-block text-sm text-slate-500 hover:text-brand-600">
        ← Back to stores
      </Link>
      <PageHeader
        title="Create Store"
        description="Add a new store outlet for field operations"
        actions={
          <Button variant="secondary" onClick={() => setBulkOpen(true)}>
            <FileSpreadsheet size={15} /> Bulk upload (Excel)
          </Button>
        }
      />
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Store code">
            <input
              className={fieldClass}
              value={form.code}
              onChange={set('code')}
              placeholder="e.g. 33991 or DTR000297"
              autoFocus
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Required. If this code already exists, it is saved as code-1, code-2, …
            </p>
          </Field>

          <Field label="Store name">
            <input
              className={fieldClass}
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. Carrefour Johar Town"
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City">
              <select className={fieldClass} value={form.city} onChange={set('city')}>
                {CITIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Footfall">
              <select className={fieldClass} value={form.footfall} onChange={set('footfall')}>
                {FOOTFALLS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Latitude (optional)">
              <input className={fieldClass} value={form.latitude} onChange={set('latitude')} placeholder="e.g. 24.8607" inputMode="decimal" />
            </Field>
            <Field label="Longitude (optional)">
              <input className={fieldClass} value={form.longitude} onChange={set('longitude')} placeholder="e.g. 67.0011" inputMode="decimal" />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-slate-500">
            Optional — used for the Head Office live map. Example Karachi center: 24.8607, 67.0011
          </p>

          <Field label="Peak hours">
            <input className={fieldClass} value={form.peakHours} onChange={set('peakHours')} />
          </Field>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create Store'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`${base}/stores`)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>

      <BulkStoreModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </div>
  )
}

/** Download the template → fill it in → upload it → review → create many stores at once. */
export function BulkStoreModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const base = useRoleBase()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<StoreParseResult | null>(null)
  const [created, setCreated] = useState<CreatedStore[] | null>(null)

  function close() {
    if (creating) return
    setResult(null)
    setCreated(null)
    setFileName('')
    setProgress(null)
    setCreateError(null)
    onClose()
  }

  async function onFile(file: File | undefined) {
    if (!file || creating) return
    setBusy(true)
    setFileName(file.name)
    setCreateError(null)
    setResult(await parseStoreFile(file))
    setBusy(false)
  }

  async function createAll() {
    if (!result?.rows.length || creating) return
    setCreating(true)
    setCreateError(null)
    setProgress({ done: 0, total: result.rows.length, name: '' })
    try {
      const stores = await createStoresAsync(
        result.rows.map((r) => r.input),
        {
          onProgress: (done, total, name) => setProgress({ done, total, name }),
        },
      )
      setCreated(stores)
      setProgress(null)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create stores.')
      setProgress(null)
    } finally {
      setCreating(false)
    }
  }

  const progressPct =
    progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0

  return (
    <Modal open={open} onClose={close} title="Create stores from Excel">
      <div className="space-y-4 text-sm">
        {created ? (
          <>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-emerald-800">
              {created.length} {created.length === 1 ? 'store' : 'stores'} created. Each one has its own shopper QR
              code — open a store to see it.
            </div>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-3 text-slate-700">
              {created.map((s) => (
                <li key={s.id}>
                  <Link to={`${base}/stores/${s.id}`} onClick={close} className="font-medium hover:text-brand-600">
                    {s.code} · {s.name}
                  </Link>{' '}
                  <span className="text-xs text-slate-400">{s.city}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Link to={`${base}/stores`} onClick={close}>
                <Button className="w-full">View all stores</Button>
              </Link>
              <Button variant="secondary" onClick={() => void downloadStoreLinks(created.map((s) => ({ ...s, qrCode: s.slug })))}>
                <Download size={14} /> Download shopper links
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <div className="font-semibold text-slate-900">1. Download the template</div>
              <p className="text-xs text-slate-500">
                Columns: Store Code *, Store name *, City *, Footfall (optional), Latitude, Longitude.
                Duplicate codes are saved as code-1, code-2, …. Blank or "-" lat/lng still creates the store.
              </p>
              <Button variant="secondary" disabled={creating} onClick={() => void downloadStoreTemplate()}>
                <Download size={14} /> Download store template
              </Button>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <div className="font-semibold text-slate-900">2. Upload the filled template</div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                disabled={creating}
                onChange={(e) => {
                  void onFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <div className="flex items-center gap-3">
                <Button variant="secondary" disabled={busy || creating} onClick={() => inputRef.current?.click()}>
                  <Upload size={14} /> {busy ? 'Checking…' : result ? 'Choose another file' : 'Upload Excel file'}
                </Button>
                {fileName && <span className="truncate text-xs text-slate-500">{fileName}</span>}
              </div>
            </div>

            {result && (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                {result.rows.length > 0 && !creating && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                    {result.rows.length} {result.rows.length === 1 ? 'store is' : 'stores are'} ready to create.
                  </div>
                )}
                {creating && progress && (
                  <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-3 text-brand-900">
                    <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                      <span>
                        Creating {progress.done} of {progress.total}…
                      </span>
                      <span className="tabular-nums text-brand-700">{progressPct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-brand-100">
                      <div
                        className="h-full rounded-full bg-brand-600 transition-[width] duration-200"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    {progress.name ? (
                      <p className="truncate text-xs text-brand-800/80">Adding {progress.name}</p>
                    ) : (
                      <p className="text-xs text-brand-800/80">Please wait — do not close this window.</p>
                    )}
                  </div>
                )}
                {createError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
                    {createError}
                  </div>
                )}
                {result.errors.length > 0 && !creating && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                    <div className="font-semibold">
                      {result.rows.length > 0
                        ? `${result.errors.length} ${result.errors.length === 1 ? 'row' : 'rows'} will be skipped:`
                        : 'Nothing can be created yet:'}
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
                  <Button className="w-full" disabled={creating} onClick={() => void createAll()}>
                    {creating
                      ? `Creating… ${progress?.done ?? 0}/${progress?.total ?? result.rows.length}`
                      : `Create ${result.rows.length} ${result.rows.length === 1 ? 'store' : 'stores'}`}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
