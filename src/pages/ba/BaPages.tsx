import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  CloudSun,
  MapPin,
  Medal,
  Star,
  Trophy,
} from 'lucide-react'
import { buildIncentiveRoster, formatPkr } from '../../lib/incentives'
import { useBrand } from '../../context/BrandContext'
import { formatDate, formatTime, useBaShift } from '../../context/BaShiftContext'

function greetingFor(hour: number) {
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

function weatherLabel(code: number) {
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Partly cloudy'
  if (code <= 48) return 'Foggy'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  return 'Stormy'
}

export function BaHomePage() {
  const { brand } = useBrand()
  const navigate = useNavigate()
  const {
    city,
    shiftLabel,
    checkedIn,
    checkInAt,
    canCheckOut,
    reportSubmitted,
    checkIn,
  } = useBaShift()

  const [now, setNow] = useState(() => new Date())
  const [tempC, setTempC] = useState<string | null>(null)
  const [weatherText, setWeatherText] = useState('Loading…')

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadWeather() {
      try {
        // Lahore coords — Open-Meteo (no API key)
        const url =
          'https://api.open-meteo.com/v1/forecast?latitude=31.5204&longitude=74.3587&current=temperature_2m,weather_code'
        const res = await fetch(url)
        if (!res.ok) throw new Error('weather failed')
        const data = await res.json()
        if (cancelled) return
        const t = data?.current?.temperature_2m
        const code = Number(data?.current?.weather_code ?? 0)
        setTempC(typeof t === 'number' ? String(Math.round(t)) : null)
        setWeatherText(weatherLabel(code))
      } catch {
        if (!cancelled) {
          setTempC('32')
          setWeatherText('Clear')
        }
      }
    }
    void loadWeather()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-4 bg-[#f7f4ec] p-4 pb-6">
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5">
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#faf6ee] p-3.5">
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              Date
            </div>
            <div className="mt-1 text-base font-bold leading-snug text-slate-900 sm:text-lg">
              {formatDate(now)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              Time
            </div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums leading-snug text-navy-900 sm:text-lg">
              {formatTime(now)}
            </div>
          </div>
          <div className="col-span-2 h-px bg-slate-200/70" />
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <MapPin size={20} />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                City
              </div>
              <div className="truncate text-lg font-bold text-slate-900">{city}</div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2.5">
            <div className="min-w-0 text-right">
              <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                Weather
              </div>
              <div className="text-lg font-bold text-slate-900">
                {tempC ? `${tempC}°C` : '—'}
              </div>
              <div className="text-sm font-medium text-slate-600">{weatherText}</div>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-500/15 text-gold-600">
              <CloudSun size={20} />
            </span>
          </div>
        </div>

        <p className="mt-4 text-base text-slate-500">{greetingFor(now.getHours())}</p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Ayesha Khan 👋</h2>
            <p className="mt-1 text-base font-semibold text-brand-600">A+ Certified</p>
          </div>
          <Link
            to="/ba/performance"
            className="flex shrink-0 items-center gap-0.5 pt-1.5 text-sm font-semibold text-brand-600"
          >
            View Profile
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h3 className="text-sm font-bold text-slate-900">Today&apos;s Shift</h3>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-sm font-bold text-brand-700 ring-2 ring-white">
            AK
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900">Store #12, {city}</div>
            <div className="text-sm text-slate-500">{shiftLabel}</div>
          </div>
          {!checkedIn ? (
            <button
              type="button"
              onClick={checkIn}
              className="shrink-0 rounded-full bg-navy-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
            >
              Check In
            </button>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700">
              <CheckCircle2 size={14} />
              Checked In
            </span>
          )}
        </div>

        {checkedIn && checkInAt && (
          <div className="mt-3 rounded-xl bg-[#faf6ee] px-3 py-2.5 text-sm text-slate-700">
            <span className="font-medium text-slate-500">Check-in time</span>
            <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
              {formatTime(checkInAt)}
            </div>
          </div>
        )}

        {checkedIn && !reportSubmitted && (
          <>
            <button
              type="button"
              disabled={!canCheckOut}
              onClick={() => navigate('/ba/daily-sales')}
              className="mt-3 w-full rounded-2xl bg-navy-900 py-3 text-sm font-semibold text-white shadow-md shadow-navy-900/20 transition enabled:hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
            >
              Check Out
            </button>
            
          </>
        )}

        {reportSubmitted && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-700">
            <CheckCircle2 size={16} />
            Today&apos;s report submitted
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h3 className="text-sm font-bold text-slate-900">Today&apos;s Goals</h3>
        <div className="mt-4 grid grid-cols-3 gap-1.5 text-center sm:gap-2">
          <BaGoalStat label="Engagement" value="25/30" />
          <BaGoalStat label="Conversions" value="80%" />
          <BaGoalStat label="Conversations" value="40/50" />
        </div>
        <div className="mt-5 flex items-end justify-around gap-3">
          {brand.baGoalProducts.map((product, index) => (
            <div
              key={`${product.alt}-${index}`}
              className="flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-full bg-[#f7f4ec] p-1.5 shadow-inner"
            >
              <img
                src={product.src}
                alt={product.alt}
                className="h-full w-full object-contain"
                style={{
                  objectPosition: product.position ?? 'center',
                  transform: product.scale ? `scale(${product.scale})` : undefined,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BaGoalStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="mt-0.5 text-xs font-medium text-slate-500">{label}</div>
    </div>
  )
}

const trainingScenarios = [
  {
    question: 'Is this oil good for daily cooking?',
    score: 91,
    feedback: [
      { type: 'success' as const, text: 'Clear daily-use positioning' },
      { type: 'success' as const, text: 'Mentioned family suitability' },
      { type: 'warning' as const, text: 'Add smoke point detail' },
    ],
  },
  {
    question: 'Why should I switch from your current oil?',
    score: 87,
    feedback: [
      { type: 'success' as const, text: 'Benefits explained well' },
      { type: 'success' as const, text: 'Good communication' },
      { type: 'warning' as const, text: 'Add more confidence' },
    ],
  },
  {
    question: 'Why should I switch from Dalda?',
    score: 84,
    feedback: [
      { type: 'success' as const, text: 'Respectful comparison' },
      { type: 'success' as const, text: 'Health angle covered' },
      { type: 'warning' as const, text: 'Mention cooking performance' },
    ],
  },
  {
    question: 'Which size should I buy for a family of four?',
    score: 89,
    feedback: [
      { type: 'success' as const, text: 'Practical recommendation' },
      { type: 'success' as const, text: 'Value for money noted' },
      { type: 'warning' as const, text: 'Offer a trial size option' },
    ],
  },
  {
    question: 'Is Kashmir Cooking Oil cholesterol free?',
    score: 93,
    feedback: [
      { type: 'success' as const, text: 'Accurate product claim' },
      { type: 'success' as const, text: 'Simple, reassuring tone' },
      { type: 'warning' as const, text: 'Link to overall wellness' },
    ],
  },
  {
    question: 'What makes Meta Boost different?',
    score: 82,
    feedback: [
      { type: 'success' as const, text: 'Highlighted fortified benefit' },
      { type: 'warning' as const, text: 'Explain vitamins more clearly' },
      { type: 'warning' as const, text: 'Use a real-life example' },
    ],
  },
  {
    question: 'Can I use this oil for frying?',
    score: 88,
    feedback: [
      { type: 'success' as const, text: 'Confirmed frying suitability' },
      { type: 'success' as const, text: 'Taste retention mentioned' },
      { type: 'warning' as const, text: 'Mention heat stability' },
    ],
  },
  {
    question: 'Why is it more expensive than local brands?',
    score: 86,
    feedback: [
      { type: 'success' as const, text: 'Quality justification given' },
      { type: 'success' as const, text: 'Calm objection handling' },
      { type: 'warning' as const, text: 'Add cost-per-meal framing' },
    ],
  },
]

const TRAINING_TOTAL = trainingScenarios.length

export function BaTrainingPage() {
  const [scenarioIndex, setScenarioIndex] = useState(1)
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const scenario = trainingScenarios[scenarioIndex]

  function submitAnswer() {
    if (answer.trim().length < 8) return
    setSubmitted(true)
  }

  function nextScenario() {
    if (scenarioIndex >= TRAINING_TOTAL - 1) return
    setScenarioIndex((i) => i + 1)
    setAnswer('')
    setSubmitted(false)
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col bg-[#f7f4ec] px-4 pb-6 pt-5">
      <h1 className="text-center text-sm font-bold text-slate-800">
        Scenario {scenarioIndex + 1} of {TRAINING_TOTAL}
      </h1>

      <div className="mt-5 flex-1 space-y-5">
        <section>
          <div className="text-xs font-bold text-slate-900">Shopper</div>
          <div className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm leading-relaxed text-slate-800">
            {scenario.question}
          </div>
        </section>

        <section>
          <div className="text-xs font-bold text-slate-900">Your Response</div>
          {!submitted ? (
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-[#faf6ee] px-4 py-3.5 text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/15"
              placeholder="Type your answer..."
            />
          ) : (
            <div className="mt-2 rounded-xl border border-slate-200/80 bg-[#faf6ee] px-4 py-3.5 text-sm leading-relaxed text-slate-800">
              {answer}
            </div>
          )}
        </section>

        {submitted && (
          <section className="animate-fade-up rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="text-sm font-bold text-brand-600">AI Coach Feedback</div>
            <div className="mt-3 flex items-end justify-between border-b border-slate-100 pb-3">
              <span className="text-sm font-medium text-slate-600">Score</span>
              <div className="leading-none">
                <span className="text-3xl font-black text-navy-900">{scenario.score}</span>
                <span className="text-sm font-medium text-slate-400">/100</span>
              </div>
            </div>
            <ul className="mt-3 space-y-2.5">
              {scenario.feedback.map((item) => (
                <li key={item.text} className="flex items-start gap-2 text-sm font-medium text-brand-700">
                  {item.type === 'success' ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-600" />
                  ) : (
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-gold-500" />
                  )}
                  {item.text}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="mt-6 shrink-0 pt-2">
        {!submitted ? (
          <button
            type="button"
            disabled={answer.trim().length < 8}
            onClick={submitAnswer}
            className="w-full rounded-2xl bg-navy-900 py-3.5 text-base font-semibold text-white shadow-md shadow-navy-900/20 transition enabled:hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Submit Answer
          </button>
        ) : (
          <button
            type="button"
            onClick={nextScenario}
            disabled={scenarioIndex >= TRAINING_TOTAL - 1}
            className="w-full rounded-2xl bg-gradient-to-b from-brand-600 to-navy-900 py-3.5 text-base font-semibold text-white shadow-md shadow-navy-900/25 transition enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {scenarioIndex >= TRAINING_TOTAL - 1 ? 'Training Complete' : 'Next Scenario'}
          </button>
        )}
      </div>
    </div>
  )
}

export function BaAssistancePage() {
  const { shiftEnded, endShift } = useBaShift()
  const [tab, setTab] = useState<'assistant' | 'help'>('assistant')
  const [elapsed, setElapsed] = useState(2 * 3600 + 49 * 60 + 2)

  useEffect(() => {
    if (shiftEnded) return
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [shiftEnded])

  const timer = [
    String(Math.floor(elapsed / 3600)).padStart(2, '0'),
    String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0'),
    String(elapsed % 60).padStart(2, '0'),
  ].join(':')

  const quickActions = ['Product Info', 'Key Benefits', 'Objections'] as const
  const quickHelp = [
    { title: 'Price objection', tip: 'Compare cost per meal and highlight 1L trial pack value.' },
    { title: 'Brand loyalty', tip: 'Acknowledge their current brand, then compare health profile calmly.' },
    { title: 'Cooking doubt', tip: 'Mention high smoke point and crisp results for frying.' },
  ]

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col bg-[#f7f4ec]">
      <div className="flex items-center justify-between bg-navy-900 px-4 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-500 text-navy-950">
            <Clock size={16} strokeWidth={2.25} />
          </div>
          <span className="text-sm font-semibold">Live Shift · Store #12</span>
        </div>
        <span className="font-mono text-sm font-semibold tabular-nums">{timer}</span>
      </div>

      <div className="grid grid-cols-2 border-b border-slate-200/80 bg-[#efe9dc]">
        <button
          type="button"
          onClick={() => setTab('assistant')}
          className={`relative py-3 text-sm font-semibold transition ${
            tab === 'assistant' ? 'bg-[#f7f4ec] text-slate-900' : 'text-slate-500'
          }`}
        >
          AI Assistant
          {tab === 'assistant' && (
            <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-navy-900" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('help')}
          className={`relative py-3 text-sm font-semibold transition ${
            tab === 'help' ? 'bg-[#f7f4ec] text-slate-900' : 'text-slate-500'
          }`}
        >
          Quick Help
          {tab === 'help' && (
            <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-navy-900" />
          )}
        </button>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
        {tab === 'assistant' ? (
          <>
            <div className="rounded-2xl bg-[#faf6ee] px-4 py-3.5 shadow-sm ring-1 ring-black/5">
              <div className="text-xs font-medium text-slate-500">Shopper Question</div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-900">Is this oil good for frying?</p>
            </div>

            <div className="mt-3 rounded-2xl bg-[#faf6ee] px-4 py-3.5 shadow-sm ring-1 ring-black/5">
              <div className="text-sm font-bold text-slate-900">AI Suggested Answer</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-800">
                Yes! Kashmir Cooking Oil has a high smoke point which makes it perfect for frying and keeps your
                food crispy and tasty.
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {quickHelp.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl bg-[#faf6ee] px-4 py-3.5 shadow-sm ring-1 ring-black/5"
              >
                <div className="text-sm font-bold text-slate-900">{item.title}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{item.tip}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6">
          <div className="text-sm font-bold text-slate-900">Quick Actions</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {quickActions.map((action) => (
              <button
                key={action}
                type="button"
                className="rounded-xl bg-[#faf6ee] px-2 py-2.5 text-center text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-black/5 transition hover:bg-white active:scale-[0.98]"
              >
                {action}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={endShift}
          disabled={shiftEnded}
          className="mt-auto w-full rounded-2xl bg-navy-900 py-3.5 text-base font-semibold text-white shadow-md shadow-navy-900/20 transition enabled:hover:bg-brand-600 disabled:bg-brand-700/80"
        >
          {shiftEnded ? 'Shift Ended' : 'End Shift'}
        </button>
      </div>
    </div>
  )
}

export function BaPerformancePage() {
  const me = buildIncentiveRoster().find((r) => r.baId === 'ayesha')
  const rank = me?.rank ?? 2
  const points = me?.points ?? 1240
  const totalPkr = me?.totalPkr ?? 0
  const nextRankPoints = 1400
  const progress = Math.min(100, Math.round((points / nextRankPoints) * 100))

  const badges = [
    { icon: Trophy, label: 'Top Performer', sub: 'Lahore cluster #2', earned: true },
    { icon: Medal, label: 'Gold Badge', sub: 'A+ certification', earned: true },
    { icon: Star, label: 'Conversion Star', sub: `${me?.conversion ?? 34}% conv rate`, earned: true },
  ]

  return (
    <div className="space-y-4 bg-[#f7f4ec] p-4 pb-6">
      <div className="text-center">
        <h2 className="text-lg font-bold text-slate-900">Rewards & Performance</h2>
        <p className="mt-0.5 text-sm text-slate-500">This week · Kashmir Cooking Oil</p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 via-navy-800 to-brand-700 p-5 text-white shadow-lg shadow-navy-900/25">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold tracking-wide text-gold-400 uppercase">Your rank</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-5xl font-black text-gold-400">#{rank}</span>
              <span className="text-sm text-white/80">Lahore</span>
            </div>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/20 ring-2 ring-gold-400/40">
            <Trophy className="text-gold-400" size={24} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
            <div className="text-[10px] font-medium text-white/70 uppercase">Points</div>
            <div className="mt-0.5 text-lg font-bold">{points.toLocaleString()}</div>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
            <div className="text-[10px] font-medium text-white/70 uppercase">Earned</div>
            <div className="mt-0.5 text-lg font-bold text-gold-400">{formatPkr(totalPkr)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <BaStatPill label="Conv Rate" value={`${me?.conversion ?? 34}%`} />
        <BaStatPill label="Rating" value="4.8" />
        <BaStatPill label="Sessions" value={String(me?.interactions ?? 47)} />
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="text-sm font-bold text-slate-900">Progress to #1</div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f7f4ec]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-gold-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {points.toLocaleString()} / {nextRankPoints.toLocaleString()} pts to reach top rank
        </p>
      </div>

      {me && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="text-sm font-bold text-slate-900">PKR breakdown</div>
          <div className="mt-3 space-y-2.5">
            <BaPayRow label="Base pay" value={me.base} />
            <BaPayRow label="Conversion bonus" value={me.conversionPay} />
            <BaPayRow label="Points bonus" value={me.pointsPay} />
            <BaPayRow label="Session bonus" value={me.sessionPay} />
            <BaPayRow label="Rank bonus" value={me.rankBonus} />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm font-bold text-slate-900">Total earned</span>
            <span className="text-lg font-black text-brand-600">{formatPkr(me.totalPkr)}</span>
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 text-sm font-bold text-slate-900">Badges earned</div>
        <div className="space-y-2">
          {badges.map(({ icon: Icon, label, sub, earned }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5"
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  earned ? 'bg-gold-500/15 text-gold-600' : 'bg-slate-100 text-slate-400'
                }`}
              >
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">{label}</div>
                <div className="text-xs text-slate-500">{sub}</div>
              </div>
              {earned && (
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[10px] font-bold text-brand-700 uppercase">
                  Earned
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BaStatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-2 py-3 text-center shadow-sm ring-1 ring-black/5">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="mt-0.5 text-[10px] font-medium text-slate-500">{label}</div>
    </div>
  )
}

function BaPayRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{formatPkr(value)}</span>
    </div>
  )
}
