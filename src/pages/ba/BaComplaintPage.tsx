import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Lightbulb,
  MessageSquareWarning,
  User,
  type LucideIcon,
} from 'lucide-react'
import { stores } from '../../data/mock'
import {
  complaintBrands,
  complaintCategories,
  productComplaintCategories,
  type ComplaintCategory,
  type ProductComplaintCategory,
} from '../../data/complaints'
import { useComplaints } from '../../context/ComplaintsContext'
import { getSkusForCategory } from '../../data/baPerformance'
import { cn } from '../../components/ui'

const BA_PROFILE = {
  id: 'ayesha',
  name: 'Ayesha Khan',
}

type FormTab = 'customer' | 'ba' | 'insights'

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-[#faf6ee] px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/15'

const TABS: { id: FormTab; label: string; icon: LucideIcon }[] = [
  { id: 'customer', label: 'Customer Complaint', icon: User },
  { id: 'ba', label: 'BA Complaint', icon: MessageSquareWarning },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
]

function TabButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-2xl px-3 py-5 text-center shadow-sm transition',
        active
          ? 'bg-navy-900 text-white shadow-md shadow-navy-900/25'
          : 'bg-white text-slate-500 ring-1 ring-black/5',
      )}
    >
      <Icon size={22} strokeWidth={1.75} className={active ? 'text-white' : 'text-slate-400'} />
      <span className="text-[11px] leading-tight font-semibold sm:text-xs">{label}</span>
    </button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h3 className="border-b border-brand-100 pb-2 text-sm font-bold text-brand-700">{title}</h3>
      {children}
    </section>
  )
}

export function BaComplaintPage() {
  const navigate = useNavigate()
  const { submitComplaint } = useComplaints()

  const storeOptions = useMemo(
    () =>
      [...stores]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({ id: s.id, name: s.name, city: s.city })),
    [],
  )

  const [tab, setTab] = useState<FormTab>('customer')
  const [storeId, setStoreId] = useState('')
  const [submittedId, setSubmittedId] = useState<string | null>(null)

  // Customer product complaint
  const [productCategory, setProductCategory] = useState<ProductComplaintCategory | ''>('')
  const [brand, setBrand] = useState('Kashmir')
  const [sku, setSku] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerComplaint, setCustomerComplaint] = useState('')
  const [imageName, setImageName] = useState('')

  // BA store complaint
  const [baCategory, setBaCategory] = useState<ComplaintCategory | ''>('')
  const [subject, setSubject] = useState('')
  const [details, setDetails] = useState('')

  // Insights tab (subject + details only)
  const [insightSubject, setInsightSubject] = useState('')
  const [insightDetails, setInsightDetails] = useState('')

  const skuOptions = useMemo(
    () => getSkusForCategory(productCategory || null),
    [productCategory],
  )

  const canSubmitCustomer =
    storeId !== '' &&
    productCategory !== '' &&
    brand !== '' &&
    sku !== '' &&
    customerName.trim().length >= 2 &&
    customerPhone.trim().length >= 10 &&
    customerComplaint.trim().length >= 12

  const canSubmitBa =
    storeId !== '' &&
    baCategory !== '' &&
    subject.trim().length >= 4 &&
    details.trim().length >= 12

  const canSubmitInsights =
    insightSubject.trim().length >= 4 && insightDetails.trim().length >= 12

  const canSubmit =
    tab === 'customer'
      ? canSubmitCustomer
      : tab === 'ba'
        ? canSubmitBa
        : tab === 'insights'
          ? canSubmitInsights
          : false

  function handleProductCategoryChange(next: ProductComplaintCategory | '') {
    setProductCategory(next)
    setSku('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    if (tab === 'customer') {
      const store = storeOptions.find((s) => String(s.id) === storeId)
      if (!store || !productCategory) return
      const created = submitComplaint({
        kind: 'customer',
        baId: BA_PROFILE.id,
        baName: BA_PROFILE.name,
        storeId: store.id,
        storeName: store.name,
        city: store.city,
        category: 'Product stock',
        productCategory,
        brand,
        sku,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        imageName: imageName || undefined,
        subject: `${productCategory} · ${sku}`,
        details: customerComplaint.trim(),
      })
      setSubmittedId(created.id)
      return
    }

    if (tab === 'ba') {
      const store = storeOptions.find((s) => String(s.id) === storeId)
      if (!store || !baCategory) return
      const created = submitComplaint({
        kind: 'ba',
        baId: BA_PROFILE.id,
        baName: BA_PROFILE.name,
        storeId: store.id,
        storeName: store.name,
        city: store.city,
        category: baCategory,
        subject: subject.trim(),
        details: details.trim(),
      })
      setSubmittedId(created.id)
      return
    }

    if (tab === 'insights') {
      const store =
        storeOptions.find((s) => String(s.id) === storeId) ?? storeOptions[0]
      if (!store) return
      const created = submitComplaint({
        kind: 'insights',
        baId: BA_PROFILE.id,
        baName: BA_PROFILE.name,
        storeId: store.id,
        storeName: store.name,
        city: store.city,
        category: baCategory || 'Other',
        subject: insightSubject.trim(),
        details: insightDetails.trim(),
      })
      setSubmittedId(created.id)
    }
  }

  if (submittedId) {
    return (
      <div className="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center bg-[#f7f4ec] px-4 py-10 text-center">
        <CheckCircle2 className="text-brand-600" size={48} strokeWidth={1.75} />
        <h2 className="mt-4 text-xl font-bold text-slate-900">Complaint submitted</h2>
        <p className="mt-2 max-w-xs text-sm text-slate-500">
          Head Office can now review your complaint. Reference ID{' '}
          <span className="font-semibold text-slate-700">{submittedId}</span>.
        </p>
        <button
          type="button"
          onClick={() => navigate('/ba/home')}
          className="mt-8 w-full max-w-xs rounded-2xl bg-navy-900 py-3.5 text-base font-semibold text-white shadow-md shadow-navy-900/20 transition hover:bg-brand-600"
        >
          Back to Home
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-[#f7f4ec] p-4 pb-8">
      <div className="mb-2 flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate('/ba/home')}
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"
          aria-label="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-navy-900">Submit Complaint</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            File a customer product complaint or a BA store complaint
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            active={tab === t.id}
            label={t.label}
            icon={t.icon}
            onClick={() => setTab(t.id)}
          />
        ))}
      </div>

      {tab === 'customer' && (
        <Section title="Customer Complaint">
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Store</span>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className={fieldClass}
              required
            >
              <option value="">Choose a store…</option>
              {storeOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.city}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Category</span>
            <select
              value={productCategory}
              onChange={(e) =>
                handleProductCategoryChange(e.target.value as ProductComplaintCategory | '')
              }
              className={fieldClass}
              required
            >
              <option value="">Select category…</option>
              {productComplaintCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Brand</span>
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className={fieldClass}
              required
            >
              <option value="">Select brand…</option>
              {complaintBrands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">SKU Selection</span>
            <select
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className={fieldClass}
              required
              disabled={!productCategory}
            >
              <option value="">
                {productCategory ? 'Select SKU…' : 'Select a category first'}
              </option>
              {skuOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Name</span>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name"
              className={fieldClass}
              required
            />
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Number</span>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="03xx xxx xxxx"
              className={fieldClass}
              required
            />
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Complaint</span>
            <textarea
              value={customerComplaint}
              onChange={(e) => setCustomerComplaint(e.target.value)}
              rows={4}
              placeholder="What did the customer report about this product?"
              className={fieldClass}
              required
            />
          </label>

          <div className="mt-3">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Image</span>
            <label className="flex cursor-pointer items-center gap-3">
              <span className="rounded-xl bg-navy-900 px-4 py-2 text-xs font-semibold text-white shadow-sm">
                Choose File
              </span>
              <span className="truncate text-xs text-slate-500">
                {imageName || 'No file chosen'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setImageName(e.target.files?.[0]?.name ?? '')}
              />
            </label>
          </div>
        </Section>
      )}

      {tab === 'ba' && (
        <>
          <Section title="Store">
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Select store</span>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className={fieldClass}
                required
              >
                <option value="">Choose a store…</option>
                {storeOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.city}
                  </option>
                ))}
              </select>
            </label>
          </Section>

          <Section title="BA Complaint">
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Category</span>
              <select
                value={baCategory}
                onChange={(e) => setBaCategory(e.target.value as ComplaintCategory)}
                className={fieldClass}
                required
              >
                <option value="">Select category…</option>
                {complaintCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Subject</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Short summary of the issue"
                maxLength={80}
                className={fieldClass}
                required
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Details</span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={5}
                placeholder="Describe what happened, when, and any impact on your work"
                className={fieldClass}
                required
              />
            </label>
          </Section>
        </>
      )}

      {tab === 'insights' && (
        <Section title="Insights">
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Subject</span>
            <input
              type="text"
              value={insightSubject}
              onChange={(e) => setInsightSubject(e.target.value)}
              placeholder="Short summary of the issue"
              maxLength={80}
              className={fieldClass}
              required
            />
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Details</span>
            <textarea
              value={insightDetails}
              onChange={(e) => setInsightDetails(e.target.value)}
              rows={5}
              placeholder="Describe what happened, when, and any impact on your work"
              className={fieldClass}
              required
            />
          </label>
        </Section>
      )}

      {(tab === 'customer' || tab === 'ba' || tab === 'insights') && (
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-2xl bg-navy-900 py-3.5 text-base font-semibold text-white shadow-md shadow-navy-900/20 transition enabled:hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Submit to Head Office
        </button>
      )}
    </form>
  )
}
