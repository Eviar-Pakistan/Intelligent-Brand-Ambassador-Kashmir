import { Link, useParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { ambassadors, candidates, type LifecycleStage } from '../../data/mock'
import {
  Avatar,
  Button,
  Card,
  Modal,
  PageHeader,
  ProgressRing,
  ScoreBars,
  SearchInput,
  StatusBadge,
  Tabs,
} from '../../components/ui'
import { Check } from 'lucide-react'
import { buildIncentiveRoster, formatPkr } from '../../lib/incentives'

const allLifecycle: LifecycleStage[] = [
  'Recruited',
  'AI Screened',
  'Certified',
  'Trained',
  'Deployed',
  'Live',
]

export function AmbassadorsPage() {
  const [tab, setTab] = useState('All')
  const [q, setQ] = useState('')
  const filtered = ambassadors.filter((a) => {
    const matchTab = tab === 'All' || a.status === tab
    const matchQ = a.name.toLowerCase().includes(q.toLowerCase())
    return matchTab && matchQ
  })

  return (
    <div>
      <PageHeader
        title="Ambassadors"
        description="Full BA lifecycle — recruitment through live performance"
        actions={
          <Link to="/ho/candidates">
            <Button variant="secondary">View Candidates</Button>
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search ambassador..." value={q} onChange={(e) => setQ(e.target.value)} />
        <Tabs tabs={['All', 'Certified', 'Training', 'Deployed', 'Pending']} value={tab} onChange={setTab} />
      </div>
      <Card padding={false}>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">BA</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Store</th>
            </tr>
          </thead>
          <tbody>
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
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

export function AmbassadorProfilePage() {
  const { id } = useParams()
  const ba = ambassadors.find((a) => a.id === id) ?? ambassadors[0]
  const [deployOpen, setDeployOpen] = useState(false)
  const incentive = buildIncentiveRoster().find((r) => r.baId === ba.id)

  return (
    <div className="space-y-5">
      <Link to="/ho/ambassadors" className="text-sm text-slate-500 hover:text-brand-600">
        ← Back to ambassadors
      </Link>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <div className="flex flex-col items-center text-center">
            <Avatar name={ba.name} size="lg" />
            <h2 className="mt-4 text-xl font-bold">{ba.name}</h2>
            <div className="mt-2 flex gap-2">
              <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-sm font-bold text-brand-700">
                {ba.certification}
              </span>
              <StatusBadge status={ba.status} />
            </div>
            <p className="mt-3 text-sm text-slate-500">{ba.store}</p>
            <div className="mt-6">
              <ProgressRing value={ba.readiness} size={130} stroke={10} label="Readiness" />
            </div>
            <div className="mt-4 flex gap-2">
              <Link to="/ba/training">
                <Button variant="secondary" size="sm">
                  Open Training
                </Button>
              </Link>
              <Button size="sm" onClick={() => setDeployOpen(true)}>
                Deploy
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-5 xl:col-span-2">
          <Card>
            <h3 className="mb-4 font-semibold">Score Breakdown</h3>
            <ScoreBars
              rows={[
                { label: 'Product Knowledge', value: ba.scores.product },
                { label: 'Communication', value: ba.scores.communication },
                { label: 'Selling Confidence', value: ba.scores.selling },
                { label: 'Objection Handling', value: ba.scores.objection },
                { label: 'Customer Interaction', value: ba.scores.interaction },
              ]}
            />
          </Card>

          <Card>
            <h3 className="mb-4 font-semibold">Lifecycle</h3>
            <ol className="grid gap-2 sm:grid-cols-2">
              {allLifecycle.map((stage) => {
                const done = ba.lifecycle.includes(stage)
                const current = ba.lifecycle[ba.lifecycle.length - 1] === stage
                return (
                  <li
                    key={stage}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                      done ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-400'
                    }`}
                  >
                    {done ? <Check size={15} /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />}
                    <span className={current ? 'font-bold' : ''}>{stage}</span>
                  </li>
                )
              })}
            </ol>
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold">Today&apos;s Performance</h3>
            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Interactions" value={ba.today.interactions} />
              <MiniStat label="Conversions" value={ba.today.conversions} />
              <MiniStat label="Conversion Rate" value={`${ba.today.rate}%`} />
            </div>
            {incentive && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3">
                <div>
                  <div className="text-xs font-semibold text-emerald-800 uppercase">
                    Week incentive (PKR)
                  </div>
                  <div className="text-xl font-black text-emerald-900">
                    {formatPkr(incentive.totalPkr)}
                  </div>
                  <div className="text-xs text-emerald-700/80">
                    Rank #{incentive.rank} · based on points, conversion & sessions
                  </div>
                </div>
                <Link to="/ho/incentives">
                  <Button size="sm" variant="secondary">
                    Open incentives
                  </Button>
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal open={deployOpen} onClose={() => setDeployOpen(false)} title="Deploy Ambassador">
        <p className="text-sm text-slate-600">
          Assign <strong>{ba.name}</strong> to Store #12 — Carrefour DHA (Lahore) for today&apos;s
          peak hours.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeployOpen(false)}>
            Cancel
          </Button>
          <Link to="/ho/deployment?tab=Scheduler" onClick={() => setDeployOpen(false)}>
            <Button>Open Scheduler</Button>
          </Link>
        </div>
      </Modal>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}

export function CandidatesPage() {
  const [tab, setTab] = useState('All')
  const filtered = useMemo(
    () => candidates.filter((c) => tab === 'All' || c.status === tab),
    [tab],
  )

  return (
    <div>
      <PageHeader
        title="Candidates"
        description="524 applications · AI screening across five certification criteria"
        actions={
          <>
            <Button variant="secondary">Import Candidates</Button>
            <Button>Add Candidate</Button>
          </>
        }
      />
      <div className="mb-4">
        <Tabs
          tabs={['All', 'Pending', 'Assessed', 'Certified', 'Training', 'Rejected']}
          value={tab}
          onChange={setTab}
        />
      </div>
      <Card padding={false}>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Candidate</th>
              <th className="px-4 py-3">Knowledge</th>
              <th className="px-4 py-3">Communication</th>
              <th className="px-4 py-3">Selling</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <Link to={`/ho/candidates/${c.id}`} className="font-medium text-brand-600 hover:underline">
                    {c.name}
                  </Link>
                  <div className="text-xs text-slate-400">{c.city}</div>
                </td>
                <td className="px-4 py-3">{c.knowledge ? `${c.knowledge}%` : '—'}</td>
                <td className="px-4 py-3">{c.communication ? `${c.communication}%` : '—'}</td>
                <td className="px-4 py-3">{c.selling ? `${c.selling}%` : '—'}</td>
                <td className="px-4 py-3 font-semibold">{c.score ? `${c.score}%` : '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

export function CandidateDetailPage() {
  const { id } = useParams()
  const c = candidates.find((x) => x.id === id) ?? candidates[0]
  const [certified, setCertified] = useState(c.status === 'Certified')

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/ho/candidates" className="text-sm text-slate-500 hover:text-brand-600">
        ← Back to candidates
      </Link>
      <Card>
        <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          AI Certification Assessment
        </div>
        <h2 className="mt-2 text-2xl font-bold">{c.name}</h2>
        <div className="mt-4 flex items-center gap-6">
          <ProgressRing value={c.score || 0} size={120} stroke={10} label="Overall" />
          <div>
            <div className="text-3xl font-bold">{c.score || 0} / 100</div>
            <StatusBadge status={certified ? 'Certified' : c.status} />
          </div>
        </div>
        <div className="mt-6">
          <ScoreBars
            rows={[
              { label: 'Product Knowledge', value: c.knowledge },
              { label: 'Communication', value: c.communication },
              { label: 'Selling Confidence', value: c.selling },
              { label: 'Objection Handling', value: c.objection },
              { label: 'Customer Interaction', value: c.interaction },
            ]}
          />
        </div>
        <div className="mt-6 rounded-xl bg-brand-50 p-4 text-sm text-slate-700">
          <div className="font-semibold text-brand-700">AI Recommendation</div>
          <p className="mt-1">{c.recommendation}</p>
        </div>
        <div className="mt-5 flex gap-2">
          <Button
            variant="success"
            disabled={certified || c.score < 75}
            onClick={() => setCertified(true)}
          >
            {certified ? 'Certified ✓' : 'Certify Candidate'}
          </Button>
          <Link to="/ho/ambassadors/ayesha">
            <Button variant="secondary">Open BA Profile</Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
