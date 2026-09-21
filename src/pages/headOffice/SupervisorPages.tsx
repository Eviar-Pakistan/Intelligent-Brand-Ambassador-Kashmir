import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Eye, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { Avatar, Button, Card, Modal, PageHeader, TableScroll } from '../../components/ui'
import { stores } from '../../data/mock'
import { CITIES, useCreatedStores } from '../../lib/storeRegistry'
import {
  assignStores,
  createSupervisor,
  deleteSupervisor,
  emailInUse,
  generatePassword,
  setLogin,
  signIn,
  supervisorOfStore,
  supervisorOverview,
  useSupervisors,
  type Supervisor,
} from '../../lib/supervisors'
import {
  SupervisorBaTable,
  SupervisorIncentiveCard,
  SupervisorStoreCards,
  SupervisorSummary,
} from '../supervisor/SupervisorViews'
import { useRoleBase } from './StoreCreation'

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500'

const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

type Credentials = { name: string; email: string; password: string; updated: boolean }

/** Pick the stores a supervisor looks after. A store already with someone else moves to this supervisor. */
function StoreChecklist({
  selected,
  onChange,
  supervisorId,
}: {
  selected: number[]
  onChange: (ids: number[]) => void
  supervisorId: string | null
}) {
  useCreatedStores() // include stores created since this page opened
  useSupervisors()

  return (
    <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
      {stores.map((s) => {
        const owner = supervisorOfStore(s.id)
        const takenBy = owner && owner.id !== supervisorId ? owner.name : null
        const checked = selected.includes(s.id)
        return (
          <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange(checked ? selected.filter((id) => id !== s.id) : [...selected, s.id])}
              className="h-4 w-4 accent-brand-600"
            />
            <span className="min-w-0 flex-1 truncate">
              #{s.id} {s.name} <span className="text-xs text-slate-400">· {s.city}</span>
            </span>
            {takenBy && (
              <span className="shrink-0 text-[11px] text-amber-600">
                {checked ? `moves from ${takenBy}` : `with ${takenBy}`}
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium text-slate-700">Password *</span>
      <div className="flex gap-2">
        <input className={`${fieldClass} font-mono`} value={value} onChange={(e) => onChange(e.target.value)} />
        <Button type="button" variant="secondary" onClick={() => onChange(generatePassword())}>
          Generate
        </Button>
      </div>
      <span className="mt-1 block text-xs text-slate-400">At least 6 characters. You will see it once after saving.</span>
    </label>
  )
}

function AddSupervisorModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (c: Credentials) => void
}) {
  const fresh = () => ({ name: '', phone: '', email: '', city: CITIES[0], password: generatePassword() })
  const [form, setForm] = useState(fresh)
  const [storeIds, setStoreIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  function close() {
    setForm(fresh())
    setStoreIds([])
    setError(null)
    onClose()
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setError('Name is required.')
    if (!validEmail(form.email)) return setError('Enter a valid email — the supervisor signs in with it.')
    if (emailInUse(form.email)) return setError('Another supervisor already uses this email.')
    if (form.password.length < 6) return setError('Password must be at least 6 characters.')
    createSupervisor(form, storeIds)
    onCreated({ name: form.name.trim(), email: form.email.trim(), password: form.password, updated: false })
    close()
  }

  const set = (key: 'name' | 'phone' | 'email' | 'city') => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [key]: e.target.value })
    setError(null)
  }

  return (
    <Modal open={open} onClose={close} title="Add Supervisor">
      <form onSubmit={submit} className="space-y-4 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium text-slate-700">Name *</span>
          <input className={fieldClass} value={form.name} onChange={set('name')} autoFocus />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-medium text-slate-700">Phone</span>
            <input className={fieldClass} value={form.phone} onChange={set('phone')} placeholder="03XX-XXXXXXX" inputMode="tel" />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium text-slate-700">City</span>
            <select className={fieldClass} value={form.city} onChange={set('city')}>
              {CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block font-medium text-slate-700">Email * (sign-in name)</span>
          <input className={fieldClass} type="email" value={form.email} onChange={set('email')} />
        </label>
        <PasswordField
          value={form.password}
          onChange={(password) => {
            setForm({ ...form, password })
            setError(null)
          }}
        />
        <div>
          <span className="mb-1 block font-medium text-slate-700">Assign stores</span>
          <StoreChecklist selected={storeIds} onChange={setStoreIds} supervisorId={null} />
          <p className="mt-1 text-xs text-slate-400">
            {storeIds.length} selected. A store has one supervisor, so picking one that is already assigned moves it.
          </p>
        </div>
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
        )}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
          <Button type="submit">Create supervisor</Button>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Change the email and password a supervisor signs in with. */
function LoginDetailsModal({ supervisor, onClose, onSaved }: { supervisor: Supervisor | null; onClose: () => void; onSaved: (c: Credentials) => void }) {
  const [draft, setDraft] = useState<{ id: string; email: string; password: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // start fresh (current email + a new password) each time a supervisor is opened
  const current =
    supervisor && draft?.id === supervisor.id
      ? draft
      : supervisor
        ? { id: supervisor.id, email: supervisor.email, password: generatePassword() }
        : null

  function close() {
    setDraft(null)
    setError(null)
    onClose()
  }

  function save() {
    if (!supervisor || !current) return
    if (!validEmail(current.email)) return setError('Enter a valid email.')
    if (emailInUse(current.email, supervisor.id)) return setError('Another supervisor already uses this email.')
    if (current.password.length < 6) return setError('Password must be at least 6 characters.')
    setLogin(supervisor.id, current.email, current.password)
    onSaved({ name: supervisor.name, email: current.email.trim(), password: current.password, updated: true })
    close()
  }

  return (
    <Modal open={!!supervisor} onClose={close} title={supervisor ? `Login · ${supervisor.name}` : 'Login'}>
      {supervisor && current && (
        <div className="space-y-4 text-sm">
          <label className="block">
            <span className="mb-1 block font-medium text-slate-700">Email (sign-in name)</span>
            <input
              className={fieldClass}
              type="email"
              value={current.email}
              onChange={(e) => {
                setDraft({ ...current, email: e.target.value })
                setError(null)
              }}
            />
          </label>
          <PasswordField
            value={current.password}
            onChange={(password) => {
              setDraft({ ...current, password })
              setError(null)
            }}
          />
          {!supervisor.passwordHash && (
            <p className="text-xs text-amber-700">This supervisor has no password yet, so they cannot sign in.</p>
          )}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button onClick={save}>Save login</Button>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** The sign-in details, shown once — passwords are stored hashed and cannot be looked up later. */
function CredentialsModal({ credentials, onClose }: { credentials: Credentials | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/login`
  const text = credentials ? `Supervisor sign in\n${url}\nEmail: ${credentials.email}\nPassword: ${credentials.password}` : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked — the details are selectable above
    }
  }

  return (
    <Modal
      open={!!credentials}
      onClose={onClose}
      title={credentials?.updated ? 'Login updated' : 'Supervisor created'}
    >
      {credentials && (
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            Share these sign-in details with {credentials.name}. The password is shown only now — it is stored
            hashed and cannot be looked up later (use “Login” to set a new one).
          </p>
          <pre className="rounded-xl bg-slate-50 px-4 py-3 font-mono text-xs break-all whitespace-pre-wrap text-slate-700">
            {text}
          </pre>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? 'Copied!' : 'Copy details'}
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function EditStoresModal({ supervisor, onClose }: { supervisor: Supervisor | null; onClose: () => void }) {
  const [draft, setDraft] = useState<{ id: string; ids: number[] } | null>(null)
  // start from the supervisor's current stores each time a different one is opened
  const selected = supervisor && draft?.id === supervisor.id ? draft.ids : (supervisor?.storeIds ?? [])

  function close() {
    setDraft(null)
    onClose()
  }

  return (
    <Modal open={!!supervisor} onClose={close} title={supervisor ? `Stores · ${supervisor.name}` : 'Stores'}>
      {supervisor && (
        <div className="space-y-4 text-sm">
          <StoreChecklist
            selected={selected}
            onChange={(ids) => setDraft({ id: supervisor.id, ids })}
            supervisorId={supervisor.id}
          />
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              onClick={() => {
                assignStores(supervisor.id, selected)
                close()
              }}
            >
              Save stores
            </Button>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Head Office opens the supervisor's portal as a preview — no password needed, and it is labelled. */
function usePreview() {
  const navigate = useNavigate()
  return (id: string) => {
    signIn(id, true)
    navigate('/supervisor')
  }
}

export function SupervisorsPage() {
  const base = useRoleBase()
  const supervisors = useSupervisors()
  useCreatedStores()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const preview = usePreview()

  return (
    <div>
      <PageHeader
        title="Supervisors"
        description="Create supervisors, give them a login and assign the stores they oversee"
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={15} /> Add supervisor
          </Button>
        }
      />
      <Card padding={false}>
        <TableScroll minWidth={860}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Supervisor</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Stores</th>
                <th className="px-4 py-3">BAs</th>
                <th className="px-4 py-3">Team conversion</th>
                <th className="px-4 py-3">Coverage</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {supervisors.map((s) => {
                const o = supervisorOverview(s)
                return (
                  <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <Link to={`${base}/supervisors/${s.id}`} className="flex items-center gap-3">
                        <Avatar name={s.name} />
                        <span>
                          <span className="block font-medium text-slate-900 hover:text-brand-600">{s.name}</span>
                          <span className="block text-xs text-slate-400">{s.email || s.phone || '—'}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.city || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{o.stores.length}</div>
                      <div className="max-w-56 truncate text-xs text-slate-400">
                        {o.stores.map((x) => x.name).join(', ') || 'None assigned'}
                      </div>
                    </td>
                    <td className="px-4 py-3">{new Set(o.bas.map((b) => b.id)).size}</td>
                    <td className="px-4 py-3 font-semibold">{o.teamConversion}%</td>
                    <td className="px-4 py-3 font-semibold">{o.coverage}%</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(s.id)}>
                          <Pencil size={12} /> Stores
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => preview(s.id)}>
                          <Eye size={12} /> Preview
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {supervisors.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                    No supervisors yet. Use “Add supervisor” to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <AddSupervisorModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={setCredentials} />
      <EditStoresModal supervisor={supervisors.find((s) => s.id === editing) ?? null} onClose={() => setEditing(null)} />
      <CredentialsModal credentials={credentials} onClose={() => setCredentials(null)} />
    </div>
  )
}

export function SupervisorDetailPage() {
  const { id } = useParams()
  const base = useRoleBase()
  const navigate = useNavigate()
  const supervisors = useSupervisors()
  const supervisor = supervisors.find((s) => s.id === id)
  const [editing, setEditing] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const preview = usePreview()

  if (!supervisor) {
    return (
      <div className="space-y-3">
        <Link to={`${base}/supervisors`} className="text-sm text-slate-500 hover:text-brand-600">
          ← Back to supervisors
        </Link>
        <Card>
          <p className="text-sm text-slate-500">This supervisor no longer exists.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Link to={`${base}/supervisors`} className="text-sm text-slate-500 hover:text-brand-600">
        ← Back to supervisors
      </Link>
      <PageHeader
        title={supervisor.name}
        description={[supervisor.city, supervisor.phone, supervisor.email].filter(Boolean).join(' · ') || 'Supervisor'}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Edit stores
            </Button>
            <Button variant="secondary" onClick={() => setLoginOpen(true)}>
              <KeyRound size={14} /> Login
            </Button>
            <Button variant="secondary" onClick={() => preview(supervisor.id)}>
              <Eye size={14} /> Preview portal
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} /> Delete
            </Button>
          </>
        }
      />

      <SupervisorSummary supervisor={supervisor} />
      <SupervisorIncentiveCard supervisor={supervisor} />
      <SupervisorStoreCards supervisor={supervisor} />
      <SupervisorBaTable supervisor={supervisor} />

      <EditStoresModal supervisor={editing ? supervisor : null} onClose={() => setEditing(false)} />
      <LoginDetailsModal
        supervisor={loginOpen ? supervisor : null}
        onClose={() => setLoginOpen(false)}
        onSaved={setCredentials}
      />
      <CredentialsModal credentials={credentials} onClose={() => setCredentials(null)} />

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete supervisor?">
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            {supervisor.name} will be removed and can no longer sign in. Their {supervisor.storeIds.length} assigned{' '}
            {supervisor.storeIds.length === 1 ? 'store is' : 'stores are'} left without a supervisor.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              variant="danger"
              onClick={() => {
                deleteSupervisor(supervisor.id)
                navigate(`${base}/supervisors`)
              }}
            >
              Delete supervisor
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
