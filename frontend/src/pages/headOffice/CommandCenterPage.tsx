import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { aiRecommendations, faqs } from '../../data/mock'
import { Card, CardHeader, KpiCard, ProgressBar, StatusBadge } from '../../components/ui'
import { MapPin, Sparkles, Zap } from 'lucide-react'
import {
  fetchCommandCenterLive,
  operationsFromManager,
  pinsToMapLayout,
  preferredBrandRows,
  type CommandCenterLive,
  type InsightRow,
} from '../../lib/intelligenceApi'
import { isApiAuthenticated } from '../../lib/api'

export function CommandCenterPage() {
  const [live, setLive] = useState<CommandCenterLive | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        if (!isApiAuthenticated()) {
          if (!cancelled) {
            setLive(null)
            setError('Sign in to Head Office to load live dashboard data.')
          }
          return
        }
        const data = await fetchCommandCenterLive()
        if (!cancelled) setLive(data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load dashboard')
          setLive(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const kpis = live?.overview.kpis
  const trend = live?.overview.engagement_trend ?? []
  const shopperIntel = live?.overview.shopper_intelligence
  const ops = useMemo(() => operationsFromManager(live?.manager ?? null), [live?.manager])
  const mapPins = useMemo(() => pinsToMapLayout(live?.pins ?? []), [live?.pins])
  const brandInsights: InsightRow[] = useMemo(
    () => (live ? preferredBrandRows(live.overview) : []),
    [live],
  )
  const baTop = (live?.leaderboard ?? []).slice(0, 4)
  const topStores = useMemo(() => {
    const pins = [...(live?.pins ?? [])]
    pins.sort((a, b) => b.conversion_rate - a.conversion_rate || b.shoppers - a.shoppers)
    return pins.slice(0, 4)
  }, [live?.pins])

  const shoppersDelta =
    live?.manager?.summary.shoppers_today != null
      ? `+${live.manager.summary.shoppers_today} today`
      : 'Live from API'
  const storesDelta = `${ops.gpsOnline} BA's GPS online`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Performance overview</h2>
          <p className="text-sm text-slate-500">Kashmir Cooking Oil · live Retail Command Center</p>
        </div>
        {loading ? (
          <span className="text-xs font-medium text-slate-400">Syncing…</span>
        ) : live ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            ● Live backend
          </span>
        ) : null}
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Shoppers Engaged"
          value={loading ? '…' : (kpis?.shoppers_engaged ?? 0).toLocaleString()}
          delta={live ? shoppersDelta : '—'}
        />
        <KpiCard
          label="Active Stores"
          value={loading ? '…' : String(kpis?.active_stores ?? 0)}
          delta={live ? storesDelta : '—'}
        />
        <KpiCard
          label="Engagement Rate"
          value={loading ? '…' : `${kpis?.engagement_rate ?? 0}%`}
          delta="From surveys / footfall"
        />
        <KpiCard
          label="Conversion Rate"
          value={loading ? '…' : `${kpis?.conversion_rate ?? 0}%`}
          delta="Switch intent (survey)"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Engagement Trend" subtitle="Last 7 days · shopper sessions" />
          <div className="h-52 sm:h-64">
            {loading ? (
              <p className="p-4 text-sm text-slate-500">Loading trend…</p>
            ) : trend.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No shopper sessions in the last 7 days yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="eng" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0b7a3e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0b7a3e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="engagement"
                    stroke="#0b7a3e"
                    fill="url(#eng)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Live Store Map" subtitle="Performance pins" />
          <div className="relative h-52 overflow-hidden rounded-xl bg-gradient-to-br from-slate-100 via-brand-50 to-slate-200 sm:h-64">
            <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(#94a3b8_1px,transparent_1px),linear-gradient(90deg,#94a3b8_1px,transparent_1px)] [background-size:36px_36px]" />
            {!loading && mapPins.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
                No stores with coordinates yet
              </p>
            )}
            {mapPins.map((pin) => (
              <div
                key={pin.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                title={pin.label}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-white shadow-lg ${
                    pin.level === 'high'
                      ? 'bg-success'
                      : pin.level === 'medium'
                        ? 'bg-warning'
                        : 'bg-danger'
                  }`}
                >
                  <MapPin size={14} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-3 text-[11px] text-slate-500">
            <span>● High</span>
            <span>● Medium</span>
            <span>● Low</span>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-4">
        <Card>
          <CardHeader title="Consumer Insights" />
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : brandInsights.length === 0 ? (
            <p className="text-sm text-slate-500">No survey answers yet.</p>
          ) : (
            <MiniBars rows={brandInsights} />
          )}
          <div className="mt-3 text-[11px] text-slate-400">Preferred brand · from live surveys</div>
          <Link to="/ho/consumers" className="mt-3 inline-block text-xs font-semibold text-brand-600">
            Open full intelligence →
          </Link>
        </Card>

        <Card>
          <CardHeader title="Shopper Intelligence" />
          <StatRow label="Footfall" value={shopperIntel?.footfall ?? (loading ? '…' : '0')} />
          <StatRow
            label="Engagement"
            value={shopperIntel?.engagement_rate ?? (loading ? '…' : '0%')}
          />
          <StatRow
            label="Purchase intent"
            value={shopperIntel?.purchase_intent ?? (loading ? '…' : '0%')}
          />
          <StatRow
            label="Conversion"
            value={shopperIntel?.conversion_rate ?? (loading ? '…' : '0%')}
          />
        </Card>

        <Card>
          <CardHeader title="Operations" />
          <StatRow label="Active BA's" value={loading ? '…' : String(ops.activeBas)} />
          <StatRow label="GPS online" value={loading ? '…' : String(ops.gpsOnline)} />
          <StatRow label="Attendance" value={loading ? '…' : ops.attendance} />
          <StatRow label="Store coverage" value={loading ? '…' : ops.storeCoverage} />
        </Card>

        <Card>
          <CardHeader
            title="BA Performance"
            action={
              <Link to="/ho/leaderboard" className="text-xs font-semibold text-brand-600">
                Leaderboard
              </Link>
            }
          />
          <div className="space-y-2">
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : baTop.length === 0 ? (
              <p className="text-sm text-slate-500">No certified / deployed BA's yet.</p>
            ) : (
              baTop.map((b, i) => (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="mr-2 font-bold text-brand-600">#{i + 1}</span>
                    {b.name}
                  </span>
                  <span className="text-xs text-slate-500">{b.conversion}%</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="AI Recommendations"
            subtitle="Demo patterns (not from API yet)"
            action={
              <Link to="/ho/optimization" className="text-xs font-semibold text-brand-600">
                View all
              </Link>
            }
          />
          <div className="space-y-3">
            {aiRecommendations.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-start gap-2">
                  <Zap size={15} className="mt-0.5 text-warning" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{r.pattern}</div>
                    <div className="text-xs text-slate-500">{r.store}</div>
                    <p className="mt-1 text-xs text-slate-600">{r.action}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Top Stores" />
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : topStores.length === 0 ? (
              <p className="text-sm text-slate-500">No stores yet.</p>
            ) : (
              topStores.map((s) => (
                <Link
                  key={s.id}
                  to={`/ho/stores/${s.id}`}
                  className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm hover:bg-brand-50"
                >
                  <span>
                    #{s.id} {s.name}
                  </span>
                  <StatusBadge status={s.conversion_rate >= 32 ? 'High' : s.conversion_rate >= 15 ? 'Medium' : 'Low'} />
                </Link>
              ))
            )}
          </Card>
          <Card>
            <CardHeader title="FAQ Log" subtitle="Demo only — no FAQ API yet" />
            {faqs.map((f) => (
              <div key={f.q} className="mb-2 flex justify-between gap-2 text-xs">
                <span className="text-slate-600">{f.q}</span>
                <span className="font-semibold text-slate-900">{f.count}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 flex items-center justify-between border-b border-slate-50 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  )
}

function MiniBars({ rows }: { rows: { label?: string; name?: string; value: number }[] }) {
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const label = r.label ?? r.name ?? ''
        return (
          <div key={label}>
            <div className="mb-0.5 flex justify-between text-xs">
              <span>{label}</span>
              <span className="font-semibold">{r.value}%</span>
            </div>
            <ProgressBar value={r.value} />
          </div>
        )
      })}
    </div>
  )
}

export function OptimizationPage() {
  return (
    <div className="space-y-5">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
          <Sparkles size={13} /> Demo recommendations
        </div>
        <h2 className="mt-3 text-xl font-bold text-slate-900">Today&apos;s Recommendations</h2>
        <p className="text-sm text-slate-500">
          Pattern detection across engagement, conversion, foot traffic, and sales.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {aiRecommendations.map((r) => (
          <Card key={r.id} className="animate-fade-up">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
              <Zap size={16} className="text-warning" />
              {r.pattern}
            </div>
            <div className="text-sm text-slate-600">{r.store}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Engagement</div>
                <div className="font-bold">{r.engagement}%</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Conversion</div>
                <div className="font-bold">{r.conversion}%</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-700">
              <span className="font-semibold">Recommendation: </span>
              {r.action}
            </p>
            <div className="mt-4 flex gap-2">
              <Link
                to="/ho/stores/12"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50"
              >
                View Store
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
