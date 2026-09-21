import { Link, useParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { ambassadors, baShiftHistory, scheduleDays, stores, type LifecycleStage } from '../../data/mock'
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
import { Check, Copy, ExternalLink, UserPlus } from 'lucide-react'
import { createInvite, inviteLink, useInvites, type Invite } from '../../lib/baInvites'
import { AssessmentReport } from '../ba/AssessmentReport'
import { buildIncentiveRoster, formatPkr } from '../../lib/incentives'
import { shiftLabelFromTimes, useSchedule } from '../../context/ScheduleContext'

const allLifecycle: LifecycleStage[] = [
  'Recruited',
  'AI Screened',
  'Certified',
  'Trained',
  'Deployed',
  'Live'
]

const timeFieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500'

const modalFieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500'

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked — the link is still selectable in the box above
    }
  }

  return (
    <Button variant="secondary" onClick={() => void copy()}>
      {copied ? 'Copied!' : 'Copy link'}
    </Button>
  )
}

/** Opens the BA app screens in a new tab, or copies the link to send to the BA. */
function BaAppLink({ href }: { href: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked — Open still works
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <ExternalLink size={12} /> Open
      </a>
      <button
        type="button"
        onClick={() => void copy()}
        title="Copy link"
        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        <span className="sr-only">Copy link</span>
      </button>
    </div>
  )
}

function CreateAmbassadorModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (invite: Invite) => void
}) {
  const empty = { name: '', city: '', email: '', phone: '' }
  const [form, setForm] = useState(empty)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    const invite = createInvite(form)
    setForm(empty)
    onCreated(invite)
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Ambassador">
      <form onSubmit={submit} className="space-y-4">
        {(
          [
            ['name', 'Name *', 'text'],
            ['city', 'City', 'text'],
            ['email', 'Email', 'email'],
            ['phone', 'Phone', 'tel'],
          ] as const
        ).map(([key, label, type]) => (
          <label key={key} className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{label}</span>
            <input
              type={type}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className={modalFieldClass}
              autoFocus={key === 'name'}
            />
          </label>
        ))}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
          <Button type="submit" disabled={!form.name.trim()}>
            Create &amp; generate link
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function InviteLinkBox({ token }: { token: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 font-mono text-xs break-all text-slate-700">
      {inviteLink(token)}
    </div>
  )
}

function InviteDetailModal({ invite, onClose }: { invite: Invite | null; onClose: () => void }) {
  return (
    <Modal open={!!invite} onClose={onClose} title={invite ? invite.name : 'Ambassador'}>
      {invite && (
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2">
            <StatusBadge status={invite.status} />
            <span className="text-xs text-slate-500">
              {[invite.city, invite.email, invite.phone].filter(Boolean).join(' · ') || 'No contact details'}
            </span>
          </div>

          {invite.result ? (
            <AssessmentReport name={invite.name} result={invite.result} answers={invite.answers} />
          ) : (
            <p className="text-slate-600">
              {invite.videoWatched
                ? `Training video watched · ${invite.answers.length} assessment answer${invite.answers.length === 1 ? '' : 's'} submitted so far.`
                : 'Has not finished the training video yet.'}
            </p>
          )}

          {invite.status !== 'Certified' && (
            <div className="space-y-2">
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Training link</div>
              <InviteLinkBox token={invite.token} />
              <CopyLink link={inviteLink(invite.token)} />
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export function AmbassadorsPage() {
  const [tab, setTab] = useState('All')
  const [q, setQ] = useState('')
  const invites = useInvites()
  const [createOpen, setCreateOpen] = useState(false)
  const [created, setCreated] = useState<Invite | null>(null)
  const [detailToken, setDetailToken] = useState<string | null>(null)

  const filtered = ambassadors.filter((a) => {
    const matchTab = tab === 'All' || a.status === tab
    const matchQ = a.name.toLowerCase().includes(q.toLowerCase())
    return matchTab && matchQ
  })
  const filteredInvites = invites.filter((i) => {
    const matchTab = tab === 'All' || (i.status === 'Invited' ? tab === 'Pending' : i.status === tab)
    return matchTab && i.name.toLowerCase().includes(q.toLowerCase())
  })

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
        <TableScroll>
          <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">BA</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Check-in</th>
              <th className="px-4 py-3">Check-out</th>
              <th className="px-4 py-3">Data filled</th>
              <th className="px-4 py-3">BA app</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvites.map((i) => (
              <tr key={i.token} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => setDetailToken(i.token)} className="flex items-center gap-3 text-left">
                    <Avatar name={i.name} />
                    <span className="font-medium text-slate-900 hover:text-brand-600">{i.name}</span>
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-600">{i.city || '—'}</td>
                <td className="px-4 py-3 font-semibold">{i.result ? `${i.result.quality}%` : '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={i.status} />
                </td>
                <td className="px-4 py-3 text-slate-600">—</td>
                <td className="px-4 py-3 tabular-nums text-slate-700">—</td>
                <td className="px-4 py-3 tabular-nums text-slate-700">—</td>
                <td className="px-4 py-3">
                  <StatusBadge status="Pending" />
                </td>
                <td className="px-4 py-3">
                  <BaAppLink href={inviteLink(i.token)} />
                </td>
              </tr>
            ))}
            {filtered.map((a) => (
              <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <Link to={`/ho/ambassadors/${a.id}`} className="flex items-center gap-3">
                    <Avatar name={a.name} />
                    <span className="font-medium text-slate-900 hover:text-brand-600">{a.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{a.city}</td>
                <td className="px-4 py-3 font-semibold">{a.score}%</td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-4 py-3 text-slate-600">{a.store}</td>
                <td className="px-4 py-3 tabular-nums text-slate-700">{a.checkIn}</td>
                <td className="px-4 py-3 tabular-nums text-slate-700">{a.checkOut}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.dataFilled} />
                </td>
                <td className="px-4 py-3">
                  <BaAppLink href={`${window.location.origin}/ba/home`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableScroll>
      </Card>

      <CreateAmbassadorModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(invite) => {
          setCreateOpen(false)
          setCreated(invite)
        }}
      />

      <Modal open={!!created} onClose={() => setCreated(null)} title="Ambassador created">
        {created && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Share this link with the BA. It opens training and assessment only until they are certified.
            </p>
            <InviteLinkBox token={created.token} />
            <div className="flex justify-end gap-2">
              <CopyLink link={inviteLink(created.token)} />
              <Button onClick={() => setCreated(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>

      <InviteDetailModal
        invite={invites.find((i) => i.token === detailToken) ?? null}
        onClose={() => setDetailToken(null)}
      />
    </div>
  )
}

export function AmbassadorProfilePage() {
  const { id } = useParams()
  const ba = ambassadors.find((a) => a.id === id) ?? ambassadors[0]
  const { schedule, addShift } = useSchedule()
  const [shiftOpen, setShiftOpen] = useState(false)
  const [shiftTab, setShiftTab] = useState('Current shifts')
  const [toast, setToast] = useState<string | null>(null)
  const [form, setForm] = useState({
    day: scheduleDays[0].key,
    start: '10:00',
    end: '14:00',
    storeId: String(stores[0].id),
  })
  const incentive = buildIncentiveRoster().find((r) => r.baId === ba.id)

  const currentShifts = useMemo(() => {
    const dayOrder = scheduleDays.map((d) => d.key)
    return schedule
      .filter((s) => s.baId === ba.id)
      .slice()
      .sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day))
  }, [schedule, ba.id])

  const historyShifts = useMemo(
    () => baShiftHistory.filter((s) => s.baId === ba.id),
    [ba.id],
  )

  function createShift() {
    if (form.start >= form.end) {
      setToast('End time must be after start time')
      setTimeout(() => setToast(null), 3000)
      return
    }
    const store = stores.find((s) => String(s.id) === form.storeId)
    const dayInfo = scheduleDays.find((d) => d.key === form.day)
    if (!store || !dayInfo) return

    addShift({
      day: form.day,
      date: dayInfo.date,
      storeId: store.id,
      storeName: store.name,
      city: store.city,
      shift: shiftLabelFromTimes(form.start, form.end),
      peakRecommended: false,
      baId: ba.id,
      baName: ba.name,
      status: 'Scheduled',
    })
    setShiftOpen(false)
    setToast(`Shift created for ${ba.name} · ${store.name}`)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/ho/ambassadors" className="text-sm text-slate-500 hover:text-brand-600">
          ← Ambassadors
        </Link>
        <Button size="sm" onClick={() => setShiftOpen(true)}>
          Create shift
        </Button>
      </div>

      {toast && (
        <div className="animate-fade-up rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Profile + readiness + scores */}
        <Card className="h-fit lg:sticky lg:top-4">
          <div className="flex flex-col items-center text-center">
            <Avatar name={ba.name} size="lg" />
            <h2 className="mt-3 text-lg font-bold text-slate-900">{ba.name}</h2>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-sm font-bold text-brand-700">
                {ba.certification}
              </span>
              <StatusBadge status={ba.status} />
            </div>
            <p className="mt-2 text-xs text-slate-500">{ba.city}</p>
            <p className="mt-0.5 text-sm text-slate-600">{ba.store}</p>

            <div className="mt-5">
              <ProgressRing value={ba.readiness} size={120} stroke={9} label="Readiness" />
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <ScoreBars
              rows={[
                { label: 'Product Knowledge', value: ba.scores.product },
                { label: 'Communication', value: ba.scores.communication },
                { label: 'Selling Confidence', value: ba.scores.selling },
                { label: 'Objection Handling', value: ba.scores.objection },
                { label: 'Customer Interaction', value: ba.scores.interaction },
              ]}
            />
          </div>

          <div className="mt-4">
            <Link to="/ba/training" className="block">
              <Button variant="secondary" size="sm" className="w-full">
                Open Training
              </Button>
            </Link>
          </div>
        </Card>

        {/* Main content */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Conv. rate" value={`${ba.today.rate}%`} />
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
                const done = ba.lifecycle.includes(stage)
                const current = ba.lifecycle[ba.lifecycle.length - 1] === stage
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
                {shiftTab === 'Current shifts'
                  ? `${currentShifts.length} this week`
                  : `${historyShifts.length} past`}
              </span>
            </div>

            {shiftTab === 'Current shifts' ? (
              currentShifts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center">
                  <p className="text-sm text-slate-500">No shifts this week</p>
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
                        <StatusBadge status="Scheduled" />
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
                    {historyShifts.map((s) => (
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
                          {s.checkIn} → {s.checkOut}
                        </td>
                        <td className="py-2.5">
                          <StatusBadge status={s.status} />
                        </td>
                      </tr>
                    ))}
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

      <Modal open={shiftOpen} onClose={() => setShiftOpen(false)} title={`Create shift · ${ba.name}`}>
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
            <Button onClick={createShift}>Save shift</Button>
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
