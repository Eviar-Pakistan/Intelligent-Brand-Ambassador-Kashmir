import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { stores, type LifecycleStage } from '../../data/mock'
import {
  Avatar,
  Button,
  Card,
  Modal,
  PageHeader,
  ProgressRing,
  ScoreBars,
  SearchInput,
  Select,
  StatusBadge,
  TableScroll,
  Tabs,
} from '../../components/ui'
import { Check, Copy, Download, ExternalLink, FileSpreadsheet, Target, Upload, UserPlus } from 'lucide-react'
import {
  baAccessUrl,
  baEmailInUse,
  createBaAccountAsync,
  createBaAccountsAsync,
  downloadAmbassadorTemplate,
  downloadBaLinks,
  getBaAccounts,
  isDemoBa,
  isPlaceholderBaName,
  parseAmbassadorFile,
  syncAmbassadorsFromApi,
  useBaAccounts,
  type AmbassadorParseResult,
  type BaAccount,
  type BaStatus,
} from '../../lib/baAccounts'
import { AssessmentReport } from '../ba/AssessmentReport'
import { fetchIncentivesOverview, formatPkr, type IncentiveBreakdown } from '../../lib/incentives'
import { shiftLabelFromTimes } from '../../context/ScheduleContext'
import {
  createShift as createShiftApi,
  deployAmbassador,
  fetchAmbassadorShifts,
  type ApiShift,
} from '../../lib/deploymentApi'
import { findCreatedStore, syncStoresFromApi, useCreatedStores } from '../../lib/storeRegistry'
import { isApiAuthenticated } from '../../lib/api'
import {
  monthInputValue,
  upsertBaTargets,
  useBaTargetsSync,
} from '../../lib/baTargets'
import { baCodeForId, resolveBaByCode, resolveBaByName } from '../../lib/baCodes'
import {
  downloadSalesBulkTemplate,
  parseSalesBulkFile,
  type SalesParseResult,
} from '../../lib/salesBulkUpload'
import { baPerformanceCategories } from '../../data/baPerformance'

const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

/** Set monthly targets for one BA — all three product categories (no category/SKU picker). */
function SetTargetSalesModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: (name: string) => void
}) {
  const accounts = useBaAccounts()
  const baOptions = useMemo(
    () =>
      accounts
        .filter((a) => !isDemoBa(a.id))
        .map((a) => ({ id: a.id, name: a.name, code: a.code || baCodeForId(a.id) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [accounts],
  )
  const [baId, setBaId] = useState('')
  const [month, setMonth] = useState(() => monthInputValue())
  const [targetsByCat, setTargetsByCat] = useState<Record<string, string>>(() =>
    Object.fromEntries(baPerformanceCategories.map((c) => [c, ''])),
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setBaId((prev) => (prev && baOptions.some((b) => b.id === prev) ? prev : baOptions[0]?.id ?? ''))
    setMonth(monthInputValue())
    setTargetsByCat(Object.fromEntries(baPerformanceCategories.map((c) => [c, ''])))
    setSaveError(null)
  }, [open, baOptions])

  const totalPreview = baPerformanceCategories.reduce((s, c) => {
    const n = Number(targetsByCat[c])
    return s + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)

  async function save() {
    const ba = baOptions.find((b) => b.id === baId)
    if (!ba) {
      setSaveError('Select an ambassador.')
      return
    }
    if (!month) {
      setSaveError('Month is required.')
      return
    }
    const rows: Parameters<typeof upsertBaTargets>[0] = []
    for (const cat of baPerformanceCategories) {
      const n = Number(targetsByCat[cat])
      if (!Number.isFinite(n) || n <= 0) {
        setSaveError(`Enter a target greater than 0 for ${cat}.`)
        return
      }
      rows.push({
        baId: ba.id,
        baName: ba.name,
        baCode: ba.code,
        month,
        sku: cat,
        targetKg: n,
        salesKg: null,
      })
    }
    setSaving(true)
    setSaveError(null)
    try {
      await upsertBaTargets(rows)
      onSaved(ba.name)
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save target')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Set target">
      <div className="space-y-3 text-sm">
        {!baOptions.length ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
            No ambassadors yet. Create one first (Add ambassador or Bulk upload).
          </p>
        ) : null}
        {saveError && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-rose-800">{saveError}</p>
        )}
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Sets targets for all three categories. The Ambassadors table shows their sum.
        </p>
        <label className="block">
          <span className="mb-1 block font-medium text-slate-700">Ambassador</span>
          <Select
            className="w-full"
            value={baId}
            onChange={(e) => setBaId(e.target.value)}
            disabled={!baOptions.length}
          >
            {baOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code ? `${b.code} — ` : ''}
                {b.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium text-slate-700">Month</span>
          <input
            type="month"
            required
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
          />
        </label>
        {baPerformanceCategories.map((cat) => (
          <label key={cat} className="block">
            <span className="mb-1 block font-medium text-slate-700">{cat} — Target (Kg)</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              required
              value={targetsByCat[cat] ?? ''}
              onChange={(e) =>
                setTargetsByCat((prev) => ({ ...prev, [cat]: e.target.value }))
              }
              placeholder="Enter target"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
            />
          </label>
        ))}
        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-[#faf6ee] px-3 py-2.5">
          <span className="font-medium text-slate-700">Total target</span>
          <span className="font-bold text-slate-900">{totalPreview || '—'}</span>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => void save()} disabled={!baOptions.length || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const allLifecycle: LifecycleStage[] = [
  'Recruited',
  'AI Screened',
  'Certified',
  'Trained',
  'Deployed',
  'Live',
]

function certificationGrade(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return '—'
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B+'
  if (score >= 60) return 'B'
  return 'C'
}

function lifecycleFromStatus(status: BaStatus): LifecycleStage[] {
  if (status === 'Deployed') return [...allLifecycle]
  if (status === 'Certified') return ['Recruited', 'AI Screened', 'Certified', 'Trained']
  if (status === 'Training') return ['Recruited', 'AI Screened', 'Trained']
  return ['Recruited']
}

function scoresFromAccount(account: BaAccount) {
  const r = account.result
  if (!r) {
    return { product: 0, communication: 0, selling: 0, objection: 0, interaction: 0, readiness: 0 }
  }
  return {
    product: Math.round(Number(r.relevance) || 0),
    communication: Math.round(Number(r.communication) || 0),
    selling: Math.round(Number(r.quality) || 0),
    objection: Math.round(Number(r.alignment) || 0),
    interaction: Math.round(Math.max(0, Math.min(100, 100 - Number(r.nervousness || 0)))),
    readiness: Math.round(Number(r.quality) || 0),
  }
}

function formatShiftClock(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function todayIsoLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function historyStatusForShift(s: ApiShift): 'Completed' | 'Missed' | 'Cancelled' | 'Scheduled' {
  const today = todayIsoLocal()
  if (s.checkedOut || s.checkedOutAt) return 'Completed'
  if (s.dateIso && s.dateIso < today && !(s.checkedIn || s.checkedInAt)) return 'Missed'
  if (s.status === 'Open') return 'Cancelled'
  if (s.dateIso && s.dateIso < today) return 'Completed'
  return 'Scheduled'
}

function dayOptionsFromToday(count = 14) {
  const out: { key: string; label: string; date: string; iso: string }[] = []
  const start = new Date()
  start.setHours(12, 0, 0, 0)
  for (let i = 0; i < count; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    out.push({
      key: iso,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      iso,
    })
  }
  return out
}

const timeFieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500'

const modalFieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500'

function AccountLinkPanel({ account }: { account: BaAccount }) {
  const [copied, setCopied] = useState(false)
  const url = baAccessUrl(account)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked — the link is selectable above
    }
  }

  return (
    <div className="space-y-3">
      <pre className="rounded-xl bg-slate-50 px-4 py-3 font-mono text-xs break-all whitespace-pre-wrap text-slate-700">
        {url}
      </pre>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void copy()}>
          <Copy size={14} /> {copied ? 'Copied!' : 'Copy link'}
        </Button>
        <Button type="button" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
          <ExternalLink size={14} /> Open account
        </Button>
      </div>
    </div>
  )
}

function AccountLinkModal({
  account,
  title,
  onClose,
}: {
  account: BaAccount | null
  title: string
  onClose: () => void
}) {
  return (
    <Modal open={!!account} onClose={onClose} title={title}>
      {account && (
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            Share this link with {account.name}. Opening it takes them straight into their account. There is no
            password.
          </p>
          <AccountLinkPanel account={account} />
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function CreateAmbassadorModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (account: BaAccount) => void
}) {
  const fresh = () => ({ name: '', city: '', email: '', phone: '' })
  const [form, setForm] = useState(fresh)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function close() {
    if (busy) return
    setForm(fresh())
    setError(null)
    onClose()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setError('Name is required.')
    if (!validEmail(form.email)) return setError('Enter a valid email.')
    if (baEmailInUse(form.email)) return setError('Another ambassador already uses this email.')
    setBusy(true)
    setError(null)
    try {
      const account = await createBaAccountAsync(form)
      onCreated(account)
      setForm(fresh())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create ambassador.')
    } finally {
      setBusy(false)
    }
  }

  const set = (key: 'name' | 'city' | 'email' | 'phone') => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: e.target.value })
    setError(null)
  }

  return (
    <Modal open={open} onClose={close} title="Create Ambassador">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Name *</span>
          <input value={form.name} onChange={set('name')} className={modalFieldClass} autoFocus required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">City</span>
          <input value={form.city} onChange={set('city')} className={modalFieldClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Email *</span>
          <input type="email" value={form.email} onChange={set('email')} className={modalFieldClass} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Phone</span>
          <input type="tel" value={form.phone} onChange={set('phone')} className={modalFieldClass} />
        </label>
        <p className="text-xs text-slate-500">
          After you create the ambassador, you get a personal link. They open that link to enter their account.
        </p>
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create ambassador'}
          </Button>
          <Button type="button" variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Create many ambassadors from Excel (Name *, City, Email *, Phone). */
function BulkAmbassadorModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (accounts: BaAccount[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<AmbassadorParseResult | null>(null)

  function close() {
    setResult(null)
    setFileName('')
    onClose()
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setFileName(file.name)
    setResult(await parseAmbassadorFile(file))
    setBusy(false)
  }

  return (
    <Modal open={open} onClose={close} title="Bulk upload (Excel)">
      <div className="space-y-4 text-sm">
        <div className="space-y-2">
          <div className="font-semibold text-slate-900">1. Download the template</div>
          <p className="text-xs text-slate-500">
            Columns: Name *, City, Phone. Email is ignored — each BA gets an auto email
            (name@kashmir.pk). Every named row is created.
          </p>
          <Button variant="secondary" onClick={() => void downloadAmbassadorTemplate()}>
            <Download size={14} /> Download ambassador template
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
                {result.rows.length} {result.rows.length === 1 ? 'ambassador is' : 'ambassadors are'} ready to
                create.
              </div>
            )}
            {result.errors.length > 0 && (
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
                {result.errors.length > 8 && <div className="mt-1 font-medium">…and {result.errors.length - 8} more</div>}
              </div>
            )}
            {result.rows.length > 0 && (
              <Button
                className="w-full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const { created, errors } = await createBaAccountsAsync(
                      result.rows.map((r) => r.input),
                    )
                    await syncAmbassadorsFromApi().catch(() => {})
                    if (!created.length) {
                      setResult({
                        rows: result.rows,
                        errors: errors.length ? errors : ['Nothing could be created.'],
                      })
                      return
                    }
                    close()
                    onCreated(created)
                    if (errors.length) {
                      console.warn('[bulk-ba] partial create', errors)
                    }
                  } catch (err) {
                    setResult({
                      rows: result.rows,
                      errors: [err instanceof Error ? err.message : 'Could not create ambassadors.'],
                    })
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {busy
                  ? 'Creating…'
                  : `Create ${result.rows.length} ${result.rows.length === 1 ? 'ambassador' : 'ambassadors'}`}
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Upload BA targets from Excel (BA Name, Month, SKU, Target). */
function UploadTargetsModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: (count: number) => void
}) {
  const accounts = useBaAccounts()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<SalesParseResult | null>(null)

  const liveBas = accounts.filter((a) => !isDemoBa(a.id) && a.code)

  function close() {
    setResult(null)
    setFileName('')
    onClose()
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setFileName(file.name)
    await syncAmbassadorsFromApi().catch(() => {})
    setResult(await parseSalesBulkFile(file))
    setBusy(false)
  }

  async function importRows() {
    if (!result?.rows.length) return
    setBusy(true)
    await syncAmbassadorsFromApi().catch(() => {})
    const liveAccounts = getBaAccounts().filter((a) => !isDemoBa(a.id))
    const extras = liveAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      code: a.code,
      storeId: a.storeId,
      status: a.status,
    }))
    const valid: Parameters<typeof upsertBaTargets>[0] = []
    const unknown: string[] = []

    for (const r of result.rows) {
      let ba = r.input.code ? resolveBaByCode(r.input.code, extras) : null
      if ((!ba || isDemoBa(ba.id)) && r.input.baName) {
        ba = resolveBaByName(r.input.baName, extras)
      }
      if (!ba || isDemoBa(ba.id)) {
        const hint = r.input.code
          ? `BA Code "${r.input.code}"`
          : `BA Name "${r.input.baName}"`
        unknown.push(
          `Row ${r.row}: unknown ${hint} — use a name/code from Ambassadors.`,
        )
        continue
      }
      if (!ba.code) {
        ba = { ...ba, code: baCodeForId(ba.id, extras) || ba.code }
      }
      valid.push({
        baId: ba.id,
        baName: ba.name,
        baCode: ba.code,
        month: (() => {
          const m = r.input.month.trim()
          if (/^\d{4}-\d{2}$/.test(m)) return m
          const d = new Date(`${m} 1, ${new Date().getFullYear()}`)
          if (!Number.isNaN(d.getTime())) return monthInputValue(d)
          return monthInputValue()
        })(),
        targetKg: r.input.target,
        salesKg: null,
        sku: r.input.sku,
      })
    }

    if (!valid.length) {
      setBusy(false)
      setResult({ rows: result.rows, errors: unknown.length ? unknown : ['Nothing could be imported.'] })
      return
    }

    try {
      const { saved, errors } = await upsertBaTargets(valid)
      const allErrors = [...unknown, ...errors]
      setBusy(false)
      if (!saved) {
        setResult({ rows: result.rows, errors: allErrors.length ? allErrors : ['Nothing could be imported.'] })
        return
      }
      close()
      onImported(saved)
    } catch (err) {
      setBusy(false)
      setResult({
        rows: result.rows,
        errors: [err instanceof Error ? err.message : 'Upload failed'],
      })
    }
  }

  return (
    <Modal open={open} onClose={close} title="Upload targets">
      <div className="space-y-4 text-sm">
        <div className="space-y-2">
          <div className="font-semibold text-slate-900">1. Download the template</div>
          <p className="text-xs text-slate-500">
            Columns: BA Name, Month, Category, SKU, Target. Same BA can have many rows (e.g. all three
            categories; one or more SKUs each). SKU must match the category — see sheet
            &quot;Categories &amp; SKUs&quot; in the file.
          </p>
          <Button
            variant="secondary"
            onClick={() =>
              void downloadSalesBulkTemplate({
                baSamples: liveBas.slice(0, 8).map((a) => ({ code: a.code, name: a.name })),
              })
            }
          >
            <Download size={14} /> Download targets template
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
              <Upload size={14} /> {busy ? 'Working…' : result ? 'Choose another file' : 'Upload Excel file'}
            </Button>
            {fileName && <span className="truncate text-xs text-slate-500">{fileName}</span>}
          </div>
        </div>

        {result && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            {result.rows.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                {result.rows.length} {result.rows.length === 1 ? 'row is' : 'rows are'} ready to import.
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                <div className="font-semibold">
                  {result.rows.length > 0
                    ? `${result.errors.length} ${result.errors.length === 1 ? 'row' : 'rows'} will be skipped:`
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
              <Button className="w-full" disabled={busy} onClick={() => void importRows()}>
                {busy
                  ? 'Importing…'
                  : `Import ${result.rows.length} ${result.rows.length === 1 ? 'row' : 'rows'}`}
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function AmbassadorDetailModal({
  account,
  onClose,
}: {
  account: BaAccount | null
  onClose: () => void
}) {
  return (
    <Modal open={!!account} onClose={onClose} title={account ? account.name : 'Ambassador'}>
      {account && (
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2">
            <StatusBadge status={account.status} />
            <span className="text-xs text-slate-500">
              {[account.city, account.email, account.phone].filter(Boolean).join(' · ') || 'No contact details'}
            </span>
          </div>

          {account.result ? (
            <AssessmentReport name={account.name} result={account.result} answers={account.answers} />
          ) : (
            <p className="text-slate-600">
              {account.videoWatched
                ? `Training video watched · ${account.answers.length} assessment answer${account.answers.length === 1 ? '' : 's'} submitted so far.`
                : 'Has not finished the training video yet.'}
            </p>
          )}

          <div>
            <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Account link</div>
            <AccountLinkPanel account={account} />
          </div>
        </div>
      )}
    </Modal>
  )
}

export function AmbassadorsPage() {
  const [tab, setTab] = useState('All')
  const [q, setQ] = useState('')
  const accounts = useBaAccounts()
  const targetRows = useBaTargetsSync()
  const targetMonth = monthInputValue()

  const [createOpen, setCreateOpen] = useState(false)
  const [linkPrompt, setLinkPrompt] = useState<{ account: BaAccount; title: string } | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [uploadTargetsOpen, setUploadTargetsOpen] = useState(false)
  const [targetOpen, setTargetOpen] = useState(false)
  const [bulkCreated, setBulkCreated] = useState<BaAccount[] | null>(null)
  const [bulkToast, setBulkToast] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    void syncAmbassadorsFromApi().catch(() => {})
    const refresh = () => {
      void syncAmbassadorsFromApi().catch(() => {})
    }
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(refresh, 20_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(timer)
    }
  }, [])

  const filteredAccounts = accounts.filter((a) => {
    if (isDemoBa(a.id)) return false
    if (isPlaceholderBaName(a.name)) return false
    const matchTab =
      tab === 'All' ||
      (a.status === 'Invited' ? tab === 'Pending' : a.status === tab)
    const qLower = q.toLowerCase()
    const matchQ =
      !qLower ||
      a.name.toLowerCase().includes(qLower) ||
      (a.code || '').toLowerCase().includes(qLower) ||
      (a.email || '').toLowerCase().includes(qLower)
    return matchTab && matchQ
  })

  const targetTotalByBa = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of targetRows) {
      if (r.month !== targetMonth) continue
      map.set(r.baId, (map.get(r.baId) ?? 0) + (Number(r.targetKg) || 0))
    }
    return map
  }, [targetRows, targetMonth])

  return (
    <div>
      <PageHeader
        title="Ambassadors"
        description="Full BA lifecycle — recruitment through live performance"
        actions={
          <>
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus size={15} /> Add ambassador
            </Button>
            <Button variant="secondary" onClick={() => setTargetOpen(true)}>
              <Target size={15} /> Set target
            </Button>
            <Button variant="secondary" onClick={() => setBulkOpen(true)}>
              <FileSpreadsheet size={15} /> Bulk upload (Excel)
            </Button>
            <Button
              variant="secondary"
              disabled={filteredAccounts.length === 0}
              onClick={() =>
                void downloadBaLinks(
                  filteredAccounts.map((a) => {
                    const store = a.storeId != null ? findCreatedStore(a.storeId) : undefined
                    return {
                      name: a.name,
                      url: baAccessUrl(a),
                      storeName: a.storeName || store?.name || '',
                      city: store?.city || a.city || '',
                    }
                  }),
                )
              }
            >
              <Download size={15} /> Download BA links
            </Button>
            <Button variant="secondary" onClick={() => setUploadTargetsOpen(true)}>
              <FileSpreadsheet size={15} /> Upload targets
            </Button>
            <Link to="/ho/ambassadors/training">
              <Button variant="secondary">Training videos</Button>
            </Link>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search ambassador..." value={q} onChange={(e) => setQ(e.target.value)} />
        <Tabs tabs={['All', 'Certified', 'Training', 'Deployed', 'Pending']} value={tab} onChange={setTab} />
      </div>
      <Card padding={false}>
        <TableScroll minWidth={1080}>
          <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">BA code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Check-in</th>
              <th className="px-4 py-3">Check-out</th>
              <th className="px-4 py-3">Data filled</th>
              <th className="px-4 py-3">Open link</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500">
                  No ambassadors match this filter.
                </td>
              </tr>
            )}
            {filteredAccounts.map((a) => {
              const totalTarget = targetTotalByBa.get(a.id) ?? 0
              return (
              <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                  {a.code || '—'}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/ho/ambassadors/${a.id}`}
                    className="flex items-center gap-3 text-left"
                  >
                    <Avatar name={a.name} />
                    <span className="font-medium text-slate-900 hover:text-brand-600">{a.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{a.city || '—'}</td>
                <td className="px-4 py-3 font-semibold">{a.result ? `${a.result.quality}%` : '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {a.storeName
                    ? a.storeId
                      ? `Store #${a.storeId} — ${a.storeName}`
                      : a.storeName
                    : '—'}
                </td>
                <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">
                  {totalTarget > 0 ? Math.round(totalTarget * 10) / 10 : '—'}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-700">{a.checkIn || '—'}</td>
                <td className="px-4 py-3 tabular-nums text-slate-700">{a.checkOut || '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.checkOut ? 'Submitted' : a.checkIn ? 'Incomplete' : 'Pending'} />
                </td>
                <td className="px-4 py-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setLinkPrompt({ account: a, title: `${a.name} · account link` })}
                  >
                    <ExternalLink size={13} /> Open link
                  </Button>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
        </TableScroll>
      </Card>

      <CreateAmbassadorModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(account) => {
          setCreateOpen(false)
          setLinkPrompt({ account, title: 'Ambassador created' })
        }}
      />

      <AccountLinkModal
        account={linkPrompt?.account ?? null}
        title={linkPrompt?.title ?? 'Account link'}
        onClose={() => setLinkPrompt(null)}
      />

      <BulkAmbassadorModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onCreated={(created) => setBulkCreated(created)}
      />

      <UploadTargetsModal
        open={uploadTargetsOpen}
        onClose={() => setUploadTargetsOpen(false)}
        onImported={(count) => {
          setBulkToast(`Imported ${count} target ${count === 1 ? 'row' : 'rows'} from Excel.`)
          setTimeout(() => setBulkToast(null), 3200)
        }}
      />

      <SetTargetSalesModal
        open={targetOpen}
        onClose={() => setTargetOpen(false)}
        onSaved={(name) => {
          setBulkToast(`Saved target for ${name}.`)
          setTimeout(() => setBulkToast(null), 3200)
        }}
      />

      <Modal open={!!bulkCreated} onClose={() => setBulkCreated(null)} title="Ambassadors created">
        {bulkCreated && (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              {bulkCreated.length} {bulkCreated.length === 1 ? 'ambassador' : 'ambassadors'} created. Share each
              account link — opening it enters that ambassador&apos;s account.
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              {bulkCreated.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setDetailId(a.id)
                      setBulkCreated(null)
                    }}
                    className="font-medium hover:text-brand-600"
                  >
                    {a.name}
                  </button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setBulkCreated(null)
                      setLinkPrompt({ account: a, title: `${a.name} · account link` })
                    }}
                  >
                    <ExternalLink size={13} /> Open link
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  void downloadBaLinks(
                    bulkCreated.map((a) => {
                      const store = a.storeId != null ? findCreatedStore(a.storeId) : undefined
                      return {
                        name: a.name,
                        url: baAccessUrl(a),
                        storeName: a.storeName || store?.name || '',
                        city: store?.city || a.city || '',
                      }
                    }),
                  )
                }
              >
                <Download size={14} /> Download BA links
              </Button>
              <Button variant="secondary" onClick={() => setBulkCreated(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {bulkToast && (
        <div className="fixed right-4 bottom-4 z-50 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg">
          {bulkToast}
        </div>
      )}

      <AmbassadorDetailModal
        account={accounts.find((a) => a.id === detailId) ?? null}
        onClose={() => setDetailId(null)}
      />
    </div>
  )
}

export function AmbassadorProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const accounts = useBaAccounts()
  useCreatedStores()
  const account = useMemo(
    () => accounts.find((a) => a.id === id) ?? accounts.find((a) => !isDemoBa(a.id)) ?? null,
    [accounts, id],
  )

  const [shiftOpen, setShiftOpen] = useState(false)
  const [shiftTab, setShiftTab] = useState('Current shifts')
  const [toast, setToast] = useState<string | null>(null)
  const [incentive, setIncentive] = useState<IncentiveBreakdown | null>(null)
  const [apiShifts, setApiShifts] = useState<ApiShift[]>([])
  const [loadingShifts, setLoadingShifts] = useState(false)
  const [savingShift, setSavingShift] = useState(false)
  const dayOptions = useMemo(() => dayOptionsFromToday(21), [])
  const [form, setForm] = useState({
    dayIso: dayOptions[0]?.iso || todayIsoLocal(),
    start: '10:00',
    end: '14:00',
    storeId: '',
  })

  useEffect(() => {
    void Promise.all([syncAmbassadorsFromApi(), syncStoresFromApi()]).catch(() => {})
  }, [])

  useEffect(() => {
    if (!account?.id || isDemoBa(account.id)) {
      setIncentive(null)
      return
    }
    let cancelled = false
    void fetchIncentivesOverview()
      .then((ov) => {
        if (cancelled) return
        const row = ov?.results.find((r) => String(r.baId) === String(account.id)) ?? null
        setIncentive(row)
      })
      .catch(() => {
        if (!cancelled) setIncentive(null)
      })
    return () => {
      cancelled = true
    }
  }, [account?.id])

  useEffect(() => {
    if (!account?.id || isDemoBa(account.id) || !isApiAuthenticated()) {
      setApiShifts([])
      return
    }
    let cancelled = false
    setLoadingShifts(true)
    void fetchAmbassadorShifts(account.id)
      .then((list) => {
        if (!cancelled) setApiShifts(list)
      })
      .catch(() => {
        if (!cancelled) setApiShifts([])
      })
      .finally(() => {
        if (!cancelled) setLoadingShifts(false)
      })
    return () => {
      cancelled = true
    }
  }, [account?.id])

  useEffect(() => {
    if (stores[0] && !form.storeId) {
      setForm((f) => ({ ...f, storeId: String(stores[0].id) }))
    }
  }, [form.storeId, stores.length])

  const scores = account ? scoresFromAccount(account) : null
  const lifecycle = account ? lifecycleFromStatus(account.status) : []
  const storeLabel = account?.storeName
    ? account.storeId
      ? `Store #${account.storeId} — ${account.storeName}`
      : account.storeName
    : 'No store assigned'

  const today = todayIsoLocal()
  const currentShifts = useMemo(
    () =>
      apiShifts
        .filter((s) => s.dateIso && s.dateIso >= today)
        .slice()
        .sort((a, b) => String(a.dateIso).localeCompare(String(b.dateIso))),
    [apiShifts, today],
  )
  const historyShifts = useMemo(
    () =>
      apiShifts
        .filter((s) => s.dateIso && s.dateIso < today)
        .slice()
        .sort((a, b) => String(b.dateIso).localeCompare(String(a.dateIso))),
    [apiShifts, today],
  )

  async function saveShift() {
    if (!account || isDemoBa(account.id)) return
    if (form.start >= form.end) {
      setToast('End time must be after start time')
      setTimeout(() => setToast(null), 3000)
      return
    }
    const store = stores.find((s) => String(s.id) === form.storeId)
    const dayInfo = dayOptions.find((d) => d.iso === form.dayIso)
    if (!store || !dayInfo) {
      setToast('Pick a store and day')
      setTimeout(() => setToast(null), 3000)
      return
    }
    if (!isApiAuthenticated()) {
      setToast('Sign in to Head Office to save shifts')
      setTimeout(() => setToast(null), 3000)
      return
    }
    setSavingShift(true)
    try {
      await deployAmbassador(account.id, store.id)
      await createShiftApi({
        storeId: store.id,
        ambassadorId: account.id,
        dateIso: dayInfo.iso,
        shift: shiftLabelFromTimes(form.start, form.end),
        peakRecommended: false,
      })
      const list = await fetchAmbassadorShifts(account.id)
      setApiShifts(list)
      setShiftOpen(false)
      setToast(`Shift created for ${account.name} · ${store.name}`)
      setTimeout(() => setToast(null), 3000)
      void syncAmbassadorsFromApi().catch(() => {})
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not create shift')
      setTimeout(() => setToast(null), 4000)
    } finally {
      setSavingShift(false)
    }
  }

  if (!account) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <p className="text-slate-600">Ambassador not found.</p>
        <Button variant="secondary" onClick={() => navigate('/ho/ambassadors')}>
          ← Back to Ambassadors
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/ho/ambassadors" className="text-sm text-slate-500 hover:text-brand-600">
          ← Ambassadors
        </Link>
        <Button size="sm" onClick={() => setShiftOpen(true)} disabled={isDemoBa(account.id)}>
          Create shift
        </Button>
      </div>

      {toast && (
        <div className="animate-fade-up rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit lg:sticky lg:top-4">
          <div className="flex flex-col items-center text-center">
            <Avatar name={account.name} size="lg" />
            <h2 className="mt-3 text-lg font-bold text-slate-900">{account.name}</h2>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-sm font-bold text-brand-700">
                {certificationGrade(account.result?.quality)}
              </span>
              <StatusBadge status={account.status} />
            </div>
            {account.code && (
              <p className="mt-2 font-mono text-xs font-semibold text-slate-500">{account.code}</p>
            )}
            <p className="mt-2 text-xs text-slate-500">{account.city || '—'}</p>
            <p className="mt-0.5 text-sm text-slate-600">{storeLabel}</p>

            <div className="mt-5">
              <ProgressRing value={scores?.readiness ?? 0} size={120} stroke={9} label="Readiness" />
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <ScoreBars
              rows={[
                { label: 'Product Knowledge', value: scores?.product ?? 0 },
                { label: 'Communication', value: scores?.communication ?? 0 },
                { label: 'Selling Confidence', value: scores?.selling ?? 0 },
                { label: 'Objection Handling', value: scores?.objection ?? 0 },
                { label: 'Customer Interaction', value: scores?.interaction ?? 0 },
              ]}
            />
            {!account.result && (
              <p className="mt-3 text-center text-xs text-slate-400">
                Scores appear after the BA completes assessment.
              </p>
            )}
          </div>

          <div className="mt-4">
            <Link to="/ba/training" className="block">
              <Button variant="secondary" size="sm" className="w-full">
                Open Training
              </Button>
            </Link>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              label="Conv. rate"
              value={incentive ? `${Math.round(incentive.conversion)}%` : '—'}
            />
            <MiniStat
              label="Incentive"
              value={incentive ? formatPkr(incentive.totalPkr) : '—'}
            />
          </div>

          <Card>
            <div className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Lifecycle
            </div>
            <ol className="mt-2 flex gap-1 overflow-x-auto pb-1">
              {allLifecycle.map((stage, i) => {
                const done = lifecycle.includes(stage)
                const current = lifecycle[lifecycle.length - 1] === stage
                return (
                  <li
                    key={stage}
                    className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] sm:text-xs ${
                      current
                        ? 'bg-brand-50 font-semibold text-brand-800 ring-1 ring-brand-200'
                        : done
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-slate-50 text-slate-400'
                    }`}
                  >
                    {done ? (
                      <Check size={12} className="shrink-0" />
                    ) : (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-300" />
                    )}
                    <span className="truncate">
                      {i + 1}. {stage}
                    </span>
                  </li>
                )
              })}
            </ol>
          </Card>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Tabs
                tabs={['Current shifts', 'Shift history']}
                value={shiftTab}
                onChange={setShiftTab}
              />
              <span className="text-xs text-slate-400">
                {loadingShifts
                  ? 'Loading…'
                  : shiftTab === 'Current shifts'
                    ? `${currentShifts.length} upcoming`
                    : `${historyShifts.length} past`}
              </span>
            </div>

            {shiftTab === 'Current shifts' ? (
              currentShifts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center">
                  <p className="text-sm text-slate-500">No upcoming shifts</p>
                  <Button size="sm" className="mt-3" onClick={() => setShiftOpen(true)}>
                    Create shift
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {currentShifts.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">
                          {s.day} · {s.date}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          #{s.storeId} {s.storeName} · {s.city}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">{s.shift}</span>
                        <StatusBadge status={s.status === 'Conflict' ? 'Conflict' : 'Scheduled'} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : historyShifts.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No past shifts on record.</p>
            ) : (
              <TableScroll minWidth={520}>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="pb-2 pr-3 font-medium">Date</th>
                      <th className="pb-2 pr-3 font-medium">Store</th>
                      <th className="pb-2 pr-3 font-medium">Shift</th>
                      <th className="pb-2 pr-3 font-medium">In / Out</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyShifts.map((s) => {
                      const st = historyStatusForShift(s)
                      return (
                        <tr key={s.id} className="border-t border-slate-100">
                          <td className="py-2.5 pr-3">
                            <div className="font-medium">{s.day}</div>
                            <div className="text-xs text-slate-400">{s.date}</div>
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="max-w-[140px] truncate">
                              #{s.storeId} {s.storeName}
                            </div>
                            <div className="text-xs text-slate-400">{s.city}</div>
                          </td>
                          <td className="py-2.5 pr-3 font-medium whitespace-nowrap">{s.shift}</td>
                          <td className="py-2.5 pr-3 tabular-nums text-slate-600 whitespace-nowrap">
                            {formatShiftClock(s.checkedInAt)} → {formatShiftClock(s.checkedOutAt)}
                          </td>
                          <td className="py-2.5">
                            <StatusBadge status={st} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </Card>

          {incentive && (
            <Card className="flex flex-wrap items-center justify-between gap-3 bg-emerald-50/80">
              <div>
                <div className="text-xs font-semibold text-emerald-800 uppercase">Week incentive</div>
                <div className="text-xl font-black text-emerald-900">{formatPkr(incentive.totalPkr)}</div>
                <div className="text-xs text-emerald-700/80">Rank #{incentive.rank}</div>
              </div>
              <Link to="/ho/incentives">
                <Button size="sm" variant="secondary">
                  View incentives
                </Button>
              </Link>
            </Card>
          )}
        </div>
      </div>

      <Modal open={shiftOpen} onClose={() => setShiftOpen(false)} title={`Create shift · ${account.name}`}>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Day</span>
            <Select
              className="w-full"
              value={form.dayIso}
              onChange={(e) => setForm((f) => ({ ...f, dayIso: e.target.value }))}
            >
              {dayOptions.map((d) => (
                <option key={d.iso} value={d.iso}>
                  {d.label} · {d.date}
                </option>
              ))}
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Start time</span>
              <input
                type="time"
                className={timeFieldClass}
                value={form.start}
                onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">End time</span>
              <input
                type="time"
                className={timeFieldClass}
                value={form.end}
                onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
              />
            </label>
          </div>
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShiftOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveShift()} disabled={savingShift || !stores.length}>
              {savingShift ? 'Saving…' : 'Save shift'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}
