import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useBaShift } from '../../context/BaShiftContext'
import { useBaSession } from '../../lib/baAccounts'
import { submitBaDailyReportApi } from '../../lib/earlyCheckoutApi'
import { fetchBaOwnTargets, monthInputValue } from '../../lib/baTargets'
import {
  baPerformanceCategories,
  type ProductCategory,
} from '../../data/baPerformance'

import {
  DEFAULT_OTHER_BRANDS,
  SESSION_KEYS,
  STOCK_OPTIONS,
  competitiveFields,
  gheeSalesFields,
  interceptionFields,
  oilSalesFields,
  stockGheeFields,
  stockOilFields,
  stockWaadiFields,
  waadiSalesFields,
  whyNotFields,
  type FieldDef,
  type OtherBrandRow,
} from '../../lib/baReport'

function emptyNumeric(fields: FieldDef[]) {
  return Object.fromEntries(fields.map((f) => [f.key, ''])) as Record<string, string>
}

function emptyStock(fields: FieldDef[]) {
  return Object.fromEntries(fields.map((f) => [f.key, ''])) as Record<string, string>
}

/** Blank is OK; entered numbers must be > 0 (no default 0, no zero allowed). */
function sanitizePositiveInput(raw: string): string {
  const v = raw.trim()
  if (v === '' || v === '.' || v === '-') return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  if (n <= 0) return ''
  return raw
}

function hasInvalidZero(values: Record<string, string>, fields: FieldDef[]) {
  return fields.some((f) => {
    const raw = (values[f.key] ?? '').trim()
    if (!raw) return false
    const n = Number(raw)
    return Number.isFinite(n) && n <= 0
  })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h3 className="border-b border-slate-100 pb-2 text-sm font-bold text-navy-900">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      <input
        type="number"
        min={0.01}
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(sanitizePositiveInput(e.target.value))}
        placeholder="Enter value"
        className="w-full rounded-xl border border-slate-200 bg-[#faf6ee] px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/15"
      />
    </label>
  )
}

function StockCheckboxes({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-[#faf6ee] px-3 py-3">
      <div className="text-xs font-semibold text-slate-700">{label}</div>
      <div className="mt-2.5 flex flex-col gap-2.5">
        {STOCK_OPTIONS.map((opt) => {
          const checked = value === opt
          return (
            <label key={opt} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? '' : opt)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 accent-brand-600 focus:ring-brand-500/30"
              />
              <span className={checked ? 'font-semibold text-brand-700' : 'font-medium'}>{opt}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function PageChrome({
  title,
  subtitle,
  onBack,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"
          aria-label="Back"
        >
          <ArrowLeft size={16} />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  )
}

function categoryFromSkuLabel(sku: string): ProductCategory | null {
  const t = sku.trim().toLowerCase()
  if (!t) return null
  if (baPerformanceCategories.includes(sku as ProductCategory)) return sku as ProductCategory
  if (t.includes('waadi') || t.startsWith('wbp')) return 'Waadi Banaspati'
  if (t.includes('banaspati') || t.startsWith('kbp')) return 'Kashmir Banaspati'
  if (t.includes('cooking oil') || t.startsWith('kpgo') || t.includes('oil')) return 'Kashmir Cooking Oil'
  return null
}

/** Categories this BA has targets for this month; empty = show all. */
function useTargetCategories(token: string | undefined) {
  const [cats, setCats] = useState<Set<ProductCategory> | null>(null)

  useEffect(() => {
    if (!token || token.startsWith('demo-')) {
      setCats(null)
      return
    }
    let cancelled = false
    void fetchBaOwnTargets(token, monthInputValue())
      .then((data) => {
        if (cancelled) return
        const next = new Set<ProductCategory>()
        for (const row of data.rows ?? []) {
          const sku = String(row.sku ?? '')
          const cat = categoryFromSkuLabel(sku)
          if (cat) next.add(cat)
        }
        setCats(next.size ? next : null)
      })
      .catch(() => {
        if (!cancelled) setCats(null)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return cats
}

function showCategory(active: Set<ProductCategory> | null, cat: ProductCategory) {
  return !active || active.has(cat)
}

export function BaDailySalesPage() {
  const navigate = useNavigate()
  const { city } = useBaShift()
  const { account } = useBaSession()
  const targetCats = useTargetCategories(account?.accessToken)
  const [formError, setFormError] = useState<string | null>(null)

  const salesSections = useMemo(() => {
    const sections: { title: string; fields: FieldDef[] }[] = [
      { title: 'Interceptions', fields: interceptionFields },
      { title: 'Competitive User', fields: competitiveFields },
      { title: 'Why Not Kashmir', fields: whyNotFields },
    ]
    if (showCategory(targetCats, 'Kashmir Cooking Oil')) {
      sections.push({ title: 'Kashmir Cooking Oil', fields: oilSalesFields })
    }
    if (showCategory(targetCats, 'Kashmir Banaspati')) {
      sections.push({ title: 'Kashmir Banaspati', fields: gheeSalesFields })
    }
    if (showCategory(targetCats, 'Waadi Banaspati')) {
      sections.push({ title: 'Waadi Banaspati', fields: waadiSalesFields })
    }
    return sections
  }, [targetCats])

  const allFields = useMemo(
    () => salesSections.flatMap((s) => s.fields),
    [salesSections],
  )

  const [values, setValues] = useState(() => emptyNumeric(allFields))

  useEffect(() => {
    setValues((prev) => {
      const next = emptyNumeric(allFields)
      for (const f of allFields) {
        if (prev[f.key] != null && prev[f.key] !== '') next[f.key] = prev[f.key]
      }
      return next
    })
  }, [allFields])

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setFormError(null)
  }

  function handleContinue(e: FormEvent) {
    e.preventDefault()
    if (hasInvalidZero(values, allFields)) {
      setFormError('Values must be greater than 0 (leave blank if none).')
      return
    }
    sessionStorage.setItem(SESSION_KEYS.sales, JSON.stringify(values))
    navigate('/ba/other-brands')
  }

  return (
    <form noValidate onSubmit={handleContinue} className="space-y-4 bg-[#f7f4ec] p-4 pb-8">
      <PageChrome
        title="Daily Sales"
        subtitle={`${city} · enter today's interceptions & SKU sales by category`}
        onBack={() => navigate('/ba/stock-report')}
      />

      {salesSections.map((section) => (
        <Section key={section.title} title={section.title}>
          {section.fields.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              value={values[f.key] ?? ''}
              onChange={(v) => setField(f.key, v)}
            />
          ))}
        </Section>
      ))}

      {formError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {formError}
        </div>
      )}

      <button
        type="submit"
        className="w-full rounded-2xl bg-navy-900 py-3.5 text-base font-semibold text-white shadow-md shadow-navy-900/20 transition hover:bg-brand-600"
      >
        Next · Other Brands
      </button>
    </form>
  )
}

export function BaStockReportPage() {
  const navigate = useNavigate()
  const { checkOut } = useBaShift()
  const { account } = useBaSession()
  const targetCats = useTargetCategories(account?.accessToken)
  const [formError, setFormError] = useState<string | null>(null)

  const stockSections = useMemo(() => {
    const sections: { title: string; fields: FieldDef[] }[] = []
    if (showCategory(targetCats, 'Kashmir Cooking Oil')) {
      sections.push({ title: 'Kashmir Cooking Oil', fields: stockOilFields })
    }
    if (showCategory(targetCats, 'Kashmir Banaspati')) {
      sections.push({ title: 'Kashmir Banaspati', fields: stockGheeFields })
    }
    if (showCategory(targetCats, 'Waadi Banaspati')) {
      sections.push({ title: 'Waadi Banaspati', fields: stockWaadiFields })
    }
    return sections.length
      ? sections
      : [
          { title: 'Kashmir Cooking Oil', fields: stockOilFields },
          { title: 'Kashmir Banaspati', fields: stockGheeFields },
          { title: 'Waadi Banaspati', fields: stockWaadiFields },
        ]
  }, [targetCats])

  const stockFields = useMemo(() => stockSections.flatMap((s) => s.fields), [stockSections])
  const [stock, setStock] = useState(() => emptyStock(stockFields))

  useEffect(() => {
    setStock((prev) => {
      const next = emptyStock(stockFields)
      for (const f of stockFields) {
        if (prev[f.key]) next[f.key] = prev[f.key]
      }
      return next
    })
  }, [stockFields])

  function setField(key: string, value: string) {
    setStock((prev) => ({ ...prev, [key]: value }))
    setFormError(null)
  }

  const allFilled = stockFields.every((f) => stock[f.key])

  function handleContinue(e: FormEvent) {
    e.preventDefault()
    if (!allFilled) {
      setFormError('Mark stock status for every SKU before continuing.')
      return
    }
    let reason: string | undefined
    try {
      reason = sessionStorage.getItem('ba-early-leave-reason') || undefined
      sessionStorage.removeItem('ba-early-leave-reason')
    } catch {
      reason = undefined
    }
    checkOut(reason)
    sessionStorage.setItem(SESSION_KEYS.stock, JSON.stringify(stock))
    navigate('/ba/daily-sales')
  }

  return (
    <form onSubmit={handleContinue} className="space-y-4 bg-[#f7f4ec] p-4 pb-8">
      <PageChrome
        title="Stock Report"
        subtitle="Mark stock by category — In Stock, Out of Stock, or Near Out of Stock"
        onBack={() => navigate('/ba/home')}
      />

      {stockSections.map((section) => (
        <Section key={section.title} title={section.title}>
          {section.fields.map((f) => (
            <StockCheckboxes
              key={f.key}
              label={f.label}
              value={stock[f.key] ?? ''}
              onChange={(v) => setField(f.key, v)}
            />
          ))}
        </Section>
      ))}

      {formError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {formError}
        </div>
      )}

      <button
        type="submit"
        disabled={!allFilled}
        className="w-full rounded-2xl bg-navy-900 py-3.5 text-base font-semibold text-white shadow-md shadow-navy-900/20 transition enabled:hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Next · Daily Sales
      </button>
    </form>
  )
}

export function BaOtherBrandsPage() {
  const navigate = useNavigate()
  const { account } = useBaSession()
  const { markReportSubmitted } = useBaShift()
  const [rows, setRows] = useState<OtherBrandRow[]>(DEFAULT_OTHER_BRANDS)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateRow(id: string, patch: Partial<OtherBrandRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const next = { ...r, ...patch }
        if (patch.price != null) next.price = sanitizePositiveInput(patch.price)
        return next
      }),
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    // Empty Other Brands is allowed — stock/sales from earlier steps are enough.
    const payload = rows.filter(
      (r) => r.name.trim() && r.price.trim() && Number(r.price) > 0,
    )
    sessionStorage.setItem(SESSION_KEYS.otherBrands, JSON.stringify(payload))

    let stock: Record<string, string> = {}
    let sales: Record<string, string> = {}
    try {
      stock = JSON.parse(sessionStorage.getItem(SESSION_KEYS.stock) || '{}') as Record<string, string>
      sales = JSON.parse(sessionStorage.getItem(SESSION_KEYS.sales) || '{}') as Record<string, string>
    } catch {
      stock = {}
      sales = {}
    }

    const token =
      account?.accessToken && !account.accessToken.startsWith('demo-')
        ? account.accessToken
        : undefined

    if (token) {
      setBusy(true)
      setError(null)
      try {
        await submitBaDailyReportApi({
          token,
          stock,
          sales,
          otherBrands: payload,
          source: 'manual',
          storeId: account?.storeId ?? undefined,
        })
      } catch (err) {
        setBusy(false)
        setError(err instanceof Error ? err.message : 'Could not save report.')
        return
      }
      setBusy(false)
    }

    markReportSubmitted()
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center bg-[#f7f4ec] p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <CheckCircle2 size={36} />
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">Your Data has been Submitted</h2>
        <p className="mt-2 max-w-xs text-sm text-slate-500">
          Stock report, daily sales, and other brand prices were saved for today&apos;s shift.
        </p>
        <button
          type="button"
          onClick={() => navigate('/ba/home')}
          className="mt-6 w-full max-w-xs rounded-2xl bg-navy-900 py-3.5 text-base font-semibold text-white shadow-md shadow-navy-900/20 transition hover:bg-brand-600"
        >
          Back to Home
        </button>
      </div>
    )
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-4 bg-[#f7f4ec] p-4 pb-8">
      <PageChrome
        title="Other Brands"
        subtitle="Enter selling price for each competitor brand / pack"
        onBack={() => navigate('/ba/daily-sales')}
      />

      <Section title="Competitor prices">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className="rounded-xl border border-slate-100 bg-[#faf6ee] p-3 space-y-2.5"
          >
            <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              Brand {index + 1}
            </span>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Brand / pack name
              </span>
              <input
                type="text"
                value={row.name}
                disabled
                readOnly
                className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Price (Rs.)</span>
              <input
                type="number"
                min={0.01}
                step="any"
                inputMode="decimal"
                value={row.price}
                onChange={(e) => updateRow(row.id, { price: e.target.value })}
                placeholder="Enter price"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
            </label>
          </div>
        ))}
      </Section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-2xl bg-navy-900 py-3.5 text-base font-semibold text-white shadow-md shadow-navy-900/20 transition enabled:hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? 'Submitting…' : 'Submit'}
      </button>
    </form>
  )
}
