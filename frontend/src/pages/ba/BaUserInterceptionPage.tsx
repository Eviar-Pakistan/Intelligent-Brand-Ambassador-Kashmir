import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Users } from 'lucide-react'
import { useBaSession } from '../../lib/baAccounts'
import {
  submitUserInterceptionApi,
  type InterceptionStatus,
} from '../../lib/userInterceptionApi'
import { cn } from '../../components/ui'

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-[#faf6ee] px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/15'

const fieldErrorClass =
  'w-full rounded-xl border border-red-400 bg-red-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/15'

const STATUS_OPTIONS: { id: InterceptionStatus; label: string }[] = [
  { id: 'Productive', label: 'Productive' },
  { id: 'Trialist', label: 'Trialist' },
  { id: 'Non-productive', label: 'Non-productive' },
]

type FieldKey =
  | 'name'
  | 'contact'
  | 'cityArea'
  | 'previousBrand'
  | 'previousSku'
  | 'currentSku'
  | 'feedback'

type FieldErrors = Partial<Record<FieldKey, string>>

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h3 className="border-b border-brand-100 pb-2 text-sm font-bold text-brand-700">{title}</h3>
      {children}
    </section>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs font-medium text-red-600">{message}</p>
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function isValidPhone(value: string) {
  const digits = digitsOnly(value)
  return digits.length >= 10 && digits.length <= 15
}

export function BaUserInterceptionPage() {
  const navigate = useNavigate()
  const { account } = useBaSession()

  const [status, setStatus] = useState<InterceptionStatus>('Productive')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [cityArea, setCityArea] = useState('')
  const [previousBrand, setPreviousBrand] = useState('')
  const [previousSku, setPreviousSku] = useState('')
  const [currentSku, setCurrentSku] = useState('')
  const [feedback, setFeedback] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submittedId, setSubmittedId] = useState<number | null>(null)

  const isNonProductive = status === 'Non-productive'
  const showCurrentSku = !isNonProductive

  function clearFieldError(key: FieldKey) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function resetForm() {
    setName('')
    setContact('')
    setCityArea('')
    setPreviousBrand('')
    setPreviousSku('')
    setCurrentSku('')
    setFeedback('')
    setFieldErrors({})
    setFormError(null)
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    const trimmedName = name.trim()
    const trimmedContact = contact.trim()
    const trimmedCity = cityArea.trim()
    const trimmedBrand = previousBrand.trim()
    const trimmedPrevSku = previousSku.trim()
    const trimmedCurrentSku = currentSku.trim()
    const trimmedFeedback = feedback.trim()

    if (trimmedName.length < 2) {
      errors.name = 'Enter the shopper name (at least 2 characters).'
    }

    // Productive & Trialist: all fields required. Non-productive: same except Current Purchased SKU.
    if (!trimmedContact) {
      errors.contact = 'Contact is required.'
    } else if (!isValidPhone(trimmedContact)) {
      errors.contact = 'Enter a valid phone number (at least 10 digits).'
    }

    if (trimmedCity.length < 2) {
      errors.cityArea = 'City / Area is required.'
    }

    if (trimmedBrand.length < 2) {
      errors.previousBrand = 'Previous brand usership is required.'
    }

    if (trimmedPrevSku.length < 1) {
      errors.previousSku = 'Previous SKU usership is required.'
    }

    if (showCurrentSku && trimmedCurrentSku.length < 1) {
      errors.currentSku = 'Current Purchased SKU is required.'
    }

    if (trimmedFeedback.length < 4) {
      errors.feedback = 'Add brief feedback (at least 4 characters).'
    }

    return errors
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setFormError('Please complete all required fields.')
      return
    }

    const token = account?.accessToken
    if (!token) {
      setFormError('BA session not found. Open your invite link again.')
      return
    }

    setSubmitting(true)
    try {
      const created = await submitUserInterceptionApi({
        token,
        status,
        name: name.trim(),
        contact: contact.trim(),
        cityArea: cityArea.trim(),
        previousBrand: previousBrand.trim(),
        previousSku: previousSku.trim(),
        currentSku: showCurrentSku ? currentSku.trim() : '',
        feedback: feedback.trim(),
        storeId: account.storeId,
      })
      setSubmittedId(created.id)
      resetForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save interception.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submittedId != null) {
    return (
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 py-8">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <CheckCircle2 size={28} />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-900">Interception saved</h2>
          <p className="mt-2 text-sm text-slate-600">
            Reference ID <span className="font-semibold text-slate-900">#{submittedId}</span>
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setSubmittedId(null)}
              className="w-full rounded-xl bg-navy-900 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Record another
            </button>
            <button
              type="button"
              onClick={() => navigate('/ba/home')}
              className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 pb-10 pt-4">
      <button
        type="button"
        onClick={() => navigate('/ba/home')}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600"
      >
        <ArrowLeft size={16} />
        Home
      </button>

      <div className="mb-4">
        <h1 className="text-lg font-bold text-navy-900">User Interception</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Section title="Interception type">
          <label className="mt-3 block text-sm">
            <select
              className={fieldClass}
              value={status}
              onChange={(e) => {
                const next = e.target.value as InterceptionStatus
                setStatus(next)
                if (next === 'Non-productive') setCurrentSku('')
                setFieldErrors({})
                setFormError(null)
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </Section>

        <Section title="Shopper details">
          <div className="mt-3 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Name *</span>
              <input
                className={fieldErrors.name ? fieldErrorClass : fieldClass}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  clearFieldError('name')
                }}
                placeholder="Shopper name"
                autoComplete="name"
              />
              <FieldError message={fieldErrors.name} />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Contact *</span>
              <input
                className={fieldErrors.contact ? fieldErrorClass : fieldClass}
                value={contact}
                onChange={(e) => {
                  setContact(e.target.value)
                  clearFieldError('contact')
                }}
                placeholder="Phone number"
                inputMode="tel"
              />
              <FieldError message={fieldErrors.contact} />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-600">City / Area *</span>
              <input
                className={fieldErrors.cityArea ? fieldErrorClass : fieldClass}
                value={cityArea}
                onChange={(e) => {
                  setCityArea(e.target.value)
                  clearFieldError('cityArea')
                }}
                placeholder="e.g. Gulberg, Lahore"
              />
              <FieldError message={fieldErrors.cityArea} />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Previous brand usership *
              </span>
              <input
                className={fieldErrors.previousBrand ? fieldErrorClass : fieldClass}
                value={previousBrand}
                onChange={(e) => {
                  setPreviousBrand(e.target.value)
                  clearFieldError('previousBrand')
                }}
                placeholder="e.g. Dalda, Sufi"
              />
              <FieldError message={fieldErrors.previousBrand} />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Previous SKU usership *
              </span>
              <input
                className={fieldErrors.previousSku ? fieldErrorClass : fieldClass}
                value={previousSku}
                onChange={(e) => {
                  setPreviousSku(e.target.value)
                  clearFieldError('previousSku')
                }}
                placeholder="Pack size they used before"
              />
              <FieldError message={fieldErrors.previousSku} />
            </label>

            {showCurrentSku && (
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Current Purchased SKU *
                </span>
                <input
                  className={fieldErrors.currentSku ? fieldErrorClass : fieldClass}
                  value={currentSku}
                  onChange={(e) => {
                    setCurrentSku(e.target.value)
                    clearFieldError('currentSku')
                  }}
                  placeholder="SKU they purchased"
                />
                <FieldError message={fieldErrors.currentSku} />
              </label>
            )}

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Feedback *</span>
              <textarea
                className={cn(
                  fieldErrors.feedback ? fieldErrorClass : fieldClass,
                  'min-h-[88px] resize-none',
                )}
                value={feedback}
                onChange={(e) => {
                  setFeedback(e.target.value)
                  clearFieldError('feedback')
                }}
                placeholder="What did they say?"
                rows={3}
              />
              <FieldError message={fieldErrors.feedback} />
            </label>
          </div>
        </Section>

        {formError && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 py-3.5 text-sm font-semibold text-white shadow-md shadow-navy-900/20 transition hover:bg-brand-600 disabled:opacity-50"
        >
          <Users size={18} />
          {submitting ? 'Saving…' : 'Save interception'}
        </button>
      </form>
    </div>
  )
}
