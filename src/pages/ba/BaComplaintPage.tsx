import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { stores } from '../../data/mock'
import {
  complaintCategories,
  type ComplaintCategory,
} from '../../data/complaints'
import { useComplaints } from '../../context/ComplaintsContext'

const BA_PROFILE = {
  id: 'ayesha',
  name: 'Ayesha Khan',
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

  const [storeId, setStoreId] = useState('')
  const [category, setCategory] = useState<ComplaintCategory | ''>('')
  const [subject, setSubject] = useState('')
  const [details, setDetails] = useState('')
  const [submittedId, setSubmittedId] = useState<string | null>(null)

  const canSubmit =
    storeId !== '' && category !== '' && subject.trim().length >= 4 && details.trim().length >= 12

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const store = storeOptions.find((s) => String(s.id) === storeId)
    if (!store || !category) return

    const created = submitComplaint({
      baId: BA_PROFILE.id,
      baName: BA_PROFILE.name,
      storeId: store.id,
      storeName: store.name,
      city: store.city,
      category,
      subject: subject.trim(),
      details: details.trim(),
    })
    setSubmittedId(created.id)
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
      <div className="mb-4 flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate('/ba/home')}
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"
          aria-label="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900">Submit Complaint</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Select store and describe the issue for Head Office review
          </p>
        </div>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h3 className="border-b border-slate-100 pb-2 text-sm font-bold text-navy-900">Store</h3>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Select store</span>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-[#faf6ee] px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/15"
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
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h3 className="border-b border-slate-100 pb-2 text-sm font-bold text-navy-900">Complaint</h3>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
            className="w-full rounded-xl border border-slate-200 bg-[#faf6ee] px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/15"
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
            className="w-full rounded-xl border border-slate-200 bg-[#faf6ee] px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/15"
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
            className="w-full rounded-xl border border-slate-200 bg-[#faf6ee] px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/15"
            required
          />
        </label>
      </section>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-2xl bg-navy-900 py-3.5 text-base font-semibold text-white shadow-md shadow-navy-900/20 transition enabled:hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Submit to Head Office
      </button>
    </form>
  )
}
