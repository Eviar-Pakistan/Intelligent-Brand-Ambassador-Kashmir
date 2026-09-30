import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { baRanking, settingsSections, stores } from '../../data/mock'
import { useDemo } from '../../context/AppContext'
import {
  Button,
  Card,
  PageHeader,
  ProgressBar,
  Select,
  StatusBadge,
  TableScroll,
} from '../../components/ui'
import { buildIncentiveRoster, formatPkr } from '../../lib/incentives'
import { syncStoresFromApi, useCreatedStores } from '../../lib/storeRegistry'
import {
  createSurveyQuestion,
  deleteSurveyQuestion,
  listSurveyQuestions,
  type SurveyQuestion,
} from '../../lib/surveyQuestionsApi'
import {
  fetchQuestionInsights,
  type QuestionInsight,
} from '../../lib/intelligenceApi'
import { ApiError } from '../../lib/api'
import { Plus, Trash2, X } from 'lucide-react'

const emptyOptions = () => ['', '']
const CONSUMER_FILTERS = [
  'City',
  'Age Group',
  'Family Size',
  'Current Brand',
  'Purchase Frequency',
  'Price Sensitivity',
  'SKU',
] as const

export function ConsumersPage() {
  const demo = useDemo()
  useCreatedStores()
  const [filterStoreId, setFilterStoreId] = useState<string>('all')
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [insights, setInsights] = useState<QuestionInsight[]>([])
  const [comparisons, setComparisons] = useState<QuestionInsight[]>([])
  const [shoppersAnswered, setShoppersAnswered] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [createStoreId, setCreateStoreId] = useState<string>('')
  const [prompt, setPrompt] = useState('')
  const [optionFields, setOptionFields] = useState<string[]>(emptyOptions)

  const storeMap = useMemo(() => Object.fromEntries(stores.map((s) => [s.id, s])), [stores.length])

  const responseByQuestionId = useMemo(() => {
    const map = new Map<number, number>()
    for (const row of insights) map.set(row.question_id, row.responses)
    return map
  }, [insights])

  const refresh = useCallback(async (storeFilter: string = filterStoreId) => {
    setLoading(true)
    setError(null)
    try {
      await syncStoresFromApi().catch(() => {})
      const storeParam = storeFilter === 'all' ? 'all' : Number(storeFilter)
      const [rows, insightRes] = await Promise.all([
        listSurveyQuestions(),
        fetchQuestionInsights(storeParam),
      ])
      setQuestions(rows)
      setInsights(insightRes?.results ?? [])
      setComparisons(insightRes?.comparisons ?? insightRes?.results ?? [])
      setShoppersAnswered(insightRes?.shoppers ?? 0)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load survey questions.')
    } finally {
      setLoading(false)
    }
  }, [filterStoreId])

  useEffect(() => {
    void refresh(filterStoreId)
  }, [refresh, filterStoreId])

  useEffect(() => {
    if (!createStoreId && stores[0]) setCreateStoreId(String(stores[0].id))
  }, [stores.length, createStoreId])

  /** Table rows: store-scoped HO questions + default survey rows when still relevant. */
  const filteredQuestions = useMemo(() => {
    type Row = {
      key: string
      id: number
      text: string
      store: number | null
      store_name: string | null
      store_city: string | null
      options: string[]
      responses: number
      isDefault: boolean
    }

    const storeScoped = questions.filter((q) => q.store != null)
    const globalIds = new Set(questions.filter((q) => q.store == null).map((q) => q.id))

    const fromStoreQuestion = (q: SurveyQuestion): Row => ({
      key: `s-${q.id}`,
      id: q.id,
      text: q.text,
      store: q.store,
      store_name: q.store_name ?? (q.store != null ? storeMap[q.store]?.name ?? null : null),
      store_city: q.store_city ?? (q.store != null ? storeMap[q.store]?.city ?? null : null),
      options: q.options || [],
      responses: responseByQuestionId.get(q.id) ?? q.responses ?? 0,
      isDefault: false,
    })

    const fromInsight = (row: QuestionInsight): Row => ({
      key: `g-${row.question_id}-${row.store_id ?? 'x'}`,
      id: row.question_id,
      text: row.title,
      store: row.store_id,
      store_name: row.store_name,
      store_city: row.store_city,
      options: row.options || [],
      responses: row.responses,
      isDefault: globalIds.has(row.question_id),
    })

    const textKey = (t: string) => t.trim().toLowerCase()

    if (filterStoreId === 'all') {
      // Every store-scoped question across all stores
      const rows: Row[] = storeScoped.map(fromStoreQuestion)
      const covered = new Set(storeScoped.map((q) => `${q.store}|${textKey(q.text)}`))
      for (const row of insights) {
        if (!globalIds.has(row.question_id)) continue
        const k = `${row.store_id}|${textKey(row.title)}`
        if (covered.has(k)) continue
        rows.push(fromInsight(row))
      }
      return rows
    }

    // Specific store: all HO questions for that store, plus any default
    // survey rows not already replaced by the same wording.
    const forStore = storeScoped.filter((q) => String(q.store) === filterStoreId)
    const rows: Row[] = forStore.map(fromStoreQuestion)
    const coveredIds = new Set(forStore.map((q) => q.id))
    const coveredTexts = new Set(forStore.map((q) => textKey(q.text)))

    for (const row of insights) {
      if (row.store_id != null && String(row.store_id) !== filterStoreId) continue
      if (coveredIds.has(row.question_id)) continue
      if (coveredTexts.has(textKey(row.title))) continue
      rows.push(fromInsight(row))
    }
    return rows
  }, [questions, filterStoreId, insights, storeMap, responseByQuestionId])

  const filterLabel =
    filterStoreId === 'all'
      ? 'All stores'
      : `#${filterStoreId} ${storeMap[Number(filterStoreId)]?.name ?? ''}`

  function setOptionAt(index: number, value: string) {
    setOptionFields((prev) => prev.map((opt, i) => (i === index ? value : opt)))
  }

  function addOptionField() {
    setOptionFields((prev) => [...prev, ''])
  }

  function removeOptionField(index: number) {
    setOptionFields((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)))
  }

  async function addQuestion() {
    const storeId = Number(createStoreId)
    const text = prompt.trim()
    const options = optionFields.map((o) => o.trim()).filter(Boolean)
    if (!storeId || !text) {
      setError('Pick a store and enter a question.')
      return
    }
    if (options.length < 2) {
      setError('Fill in at least two answer options.')
      return
    }
    if (new Set(options).size !== options.length) {
      setError('Answer options must be unique.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await createSurveyQuestion({ storeId, text, options })
      setPrompt('')
      setOptionFields(emptyOptions())
      // Keep new question visible immediately, then refresh full list + comparisons
      setQuestions((prev) => {
        if (prev.some((q) => q.id === created.id)) return prev
        return [...prev, created]
      })
      await refresh(filterStoreId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create question.')
    } finally {
      setBusy(false)
    }
  }

  async function removeQuestion(id: number) {
    setBusy(true)
    setError(null)
    try {
      await deleteSurveyQuestion(id)
      await refresh(filterStoreId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete question.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Consumer Intelligence"
        description={`${demo.shoppers.toLocaleString()} consumer profiles · ${filterLabel}`}
      />

      <div className="flex flex-wrap gap-2">
        {CONSUMER_FILTERS.map((f) => (
          <Select key={f} defaultValue="" className="w-full min-w-[8rem] flex-1 sm:w-auto sm:flex-none">
            <option value="">{f}</option>
            <option>All</option>
          </Select>
        ))}
        <Select
          value={filterStoreId}
          onChange={(e) => setFilterStoreId(e.target.value)}
          className="w-full min-w-[10rem] flex-1 sm:w-auto sm:flex-none"
        >
          <option value="all">All stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              #{s.id} {s.name}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">Create question</h3>
            <p className="text-xs text-slate-500">
              Add a shopper survey question for a store. It appears in the table and comparison cards below.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1.5 block font-semibold text-slate-800">Store *</span>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
              value={createStoreId}
              onChange={(e) => setCreateStoreId(e.target.value)}
            >
              {stores.length === 0 && <option value="">No stores yet — create one first</option>}
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} {s.name} · {s.city}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1.5 block font-semibold text-slate-800">Question *</span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Which oil do you currently use at home?"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void addQuestion()
                }
              }}
            />
          </label>
          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-800">Answer options *</span>
              <Button type="button" size="sm" variant="secondary" onClick={addOptionField}>
                <Plus size={14} /> Add more option
              </Button>
            </div>
            <div className="space-y-2">
              {optionFields.map((opt, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center text-xs font-semibold text-slate-400">{index + 1}</span>
                  <input
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
                    value={opt}
                    onChange={(e) => setOptionAt(index, e.target.value)}
                    placeholder={index === 0 ? 'e.g. Yes, definitely' : index === 1 ? 'e.g. No' : `Option ${index + 1}`}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={optionFields.length <= 2}
                    onClick={() => removeOptionField(index)}
                    aria-label={`Remove option ${index + 1}`}
                  >
                    <X size={14} />
                  </Button>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">At least two options required. Use “Add more option” for extra choices.</p>
          </div>
        </div>
        {error && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}
        <div className="mt-3 flex justify-end">
          <Button
            disabled={busy || !prompt.trim() || !createStoreId || stores.length === 0}
            onClick={() => void addQuestion()}
          >
            <Plus size={14} /> {busy ? 'Saving…' : 'Create question'}
          </Button>
        </div>
      </Card>

      <Card padding={false}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-50 px-4 py-3 sm:px-5">
          <div>
            <h3 className="font-semibold text-slate-900">Consumer questions by store</h3>
            <p className="text-xs text-slate-500">
              {filterLabel}
              {' · '}
              {loading ? '…' : `${filteredQuestions.length} question${filteredQuestions.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500 sm:px-5">Loading questions…</p>
        ) : filteredQuestions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500 sm:px-5">
            {filterStoreId === 'all'
              ? 'No store questions yet. Create one above — or wait for shoppers on the default QR survey.'
              : 'No questions for this store. Create one above, or shoppers will use the default survey.'}
          </p>
        ) : (
          <TableScroll minWidth={640}>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Question</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Options</th>
                  <th className="px-4 py-3">Responses</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuestions.map((q, i) => {
                  const storeFromMap = q.store != null ? storeMap[q.store] : undefined
                  const storeName = q.store_name ?? storeFromMap?.name ?? null
                  const storeCity = q.store_city ?? storeFromMap?.city ?? null
                  return (
                    <tr key={q.key} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{q.text}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {storeName ? (
                          <>
                            <div>
                              {q.store != null ? `#${q.store} ` : ''}
                              {storeName}
                            </div>
                            {storeCity && <div className="text-xs text-slate-400">{storeCity}</div>}
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {(q.options || []).slice(0, 4).join(' · ')}
                        {(q.options || []).length > 4 ? '…' : ''}
                      </td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">
                        {q.responses.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {!q.isDefault && q.store != null ? (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeQuestion(q.id)}>
                            <Trash2 size={14} />
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">Default</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      <div>
        <div className="mb-3">
          <h3 className="font-semibold text-slate-900">Question comparisons</h3>
          <p className="text-xs text-slate-500">
            {filterStoreId === 'all'
              ? 'Option % across all stores for each question (same wording is merged).'
              : `Option % for questions at ${filterLabel}.`}
            {' · '}
            {shoppersAnswered.toLocaleString()} shopper profile{shoppersAnswered === 1 ? '' : 's'}
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {loading && comparisons.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">Loading question metrics…</p>
            </Card>
          ) : comparisons.length === 0 ? (
            <Card className="lg:col-span-2">
              <p className="text-sm text-slate-500">
                After shoppers complete the QR survey, option percentages appear here. Create store
                questions above to replace the default survey for a store.
              </p>
            </Card>
          ) : (
            comparisons.map((insight) => (
              <ChartCard
                key={`${insight.aggregated ? 'agg' : 'q'}-${insight.question_id}-${insight.title}`}
                title={insight.title}
                subtitle={
                  insight.aggregated
                    ? `${insight.store_name ?? 'All stores'} · ${insight.responses} response${insight.responses === 1 ? '' : 's'}`
                    : insight.store_name
                      ? `#${insight.store_id} ${insight.store_name}${insight.store_city ? ` · ${insight.store_city}` : ''} · ${insight.responses} response${insight.responses === 1 ? '' : 's'}`
                      : `${insight.responses} response${insight.responses === 1 ? '' : 's'}`
                }
                rows={insight.rows}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  rows,
}: {
  title: string
  subtitle?: string
  rows: { name: string; value: number }[]
}) {
  return (
    <Card>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="mb-4 mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No options configured.</p>
        ) : (
          rows.map((r) => (
            <div key={r.name}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{r.name}</span>
                <span className="font-semibold">{r.value}%</span>
              </div>
              <ProgressBar value={r.value} />
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

export function LeaderboardPage() {
  const incentives = buildIncentiveRoster()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ambassador Leaderboard"
        description="This week · gamified incentive program"
        actions={
          <Link to="/ho/incentives">
            <Button>Manage PKR incentives</Button>
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {baRanking.slice(0, 3).map((b, i) => {
          const pay = incentives.find((x) => x.baId === b.id)
          return (
            <Card key={b.id} className={i === 0 ? 'ring-2 ring-amber-300' : ''}>
              <div className="text-3xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
              <h3 className="mt-2 text-lg font-bold">{b.name}</h3>
              <p className="text-sm text-slate-500">{b.city}</p>
              <div className="mt-3 text-2xl font-black text-brand-600">
                {b.points.toLocaleString()} pts
              </div>
              <div className="mt-1 text-xs text-slate-500">{b.conversion}% conversion</div>
              {pay && (
                <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
                  {formatPkr(pay.totalPkr)} incentive
                </div>
              )}
            </Card>
          )
        })}
      </div>
      <Card>
        <h3 className="mb-3 font-semibold">Your Rank (demo BA view)</h3>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <div className="text-4xl font-black">#7</div>
            <div className="text-sm text-slate-500">820 points · +120 this week</div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Mini label="Conversation Rate" value="88%" />
            <Mini label="Conversion Rate" value="31%" />
            <Mini label="Customer Rating" value="4.8" />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <StatusBadge status="Active" />
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
            {formatPkr(incentives[0]?.totalPkr ?? 2000)} top-tier example
          </span>
          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
            Gold Badge
          </span>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-500/20">
            Top Performer
          </span>
        </div>
      </Card>
      <Card padding={false}>
        <TableScroll minWidth={720}>
          <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Ambassador</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Points</th>
              <th className="px-4 py-3">Conversion</th>
              <th className="px-4 py-3">Incentive (PKR)</th>
            </tr>
          </thead>
          <tbody>
            {baRanking.map((b, i) => {
              const pay = incentives.find((x) => x.baId === b.id)
              return (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-bold text-brand-600">#{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link to={`/ho/ambassadors/${b.id}`} className="font-medium hover:text-brand-600">
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{b.city}</td>
                  <td className="px-4 py-3">{b.points}</td>
                  <td className="px-4 py-3">{b.conversion}%</td>
                  <td className="px-4 py-3 font-semibold text-emerald-700">
                    {pay ? formatPkr(pay.totalPkr) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </TableScroll>
      </Card>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="font-bold">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}

export function ReportPage() {
  const demo = useDemo()
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Executive Intelligence Report"
        description="Client-ready preview · Kashmir Cooking Oil campaign"
        actions={<Button>Export Report</Button>}
      />
      <Card>
        <div className="text-xs tracking-[0.2em] text-brand-600 uppercase">Executive Intelligence Report</div>
        <h2 className="mt-2 text-2xl font-bold text-black sm:text-3xl">Kashmir Cooking Oil</h2>
        <p className="mt-1 text-slate-500">Campaign Performance · Aug–Sep 2026</p>
      </Card>

      <Section n="01" title="Executive Summary">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Shoppers" value={demo.shoppers.toLocaleString()} />
          <Mini label="Conversion" value={`${demo.conversion}%`} />
          <Mini label="Stores" value={String(demo.stores)} />
          <Mini label="Engagement" value={`${demo.engagement}%`} />
        </div>
      </Section>

      <Section n="02" title="Consumer Profile">
        <p className="text-sm text-slate-600">
          Primary buyers are family households (3–4 members) shopping bi-weekly, with medium price
          sensitivity and strong interest in heart-health messaging.
        </p>
      </Section>

      <Section n="03" title="Brand Switching">
        <p className="text-sm text-slate-600">
          Top switch drivers: health comparison vs traditional oils, cooking aroma, and 1L trial pack
          offers. Main rejection reason remains habit loyalty to Dalda.
        </p>
      </Section>

      <Section n="04" title="Product Performance">
        <ChartCard
          title="SKU Interest"
          rows={[
            { name: '1L', value: 48 },
            { name: '5L', value: 32 },
            { name: '500ml', value: 20 },
          ]}
        />
      </Section>

      <Section n="05" title="Regional Performance">
        <ChartCard
          title="City contribution"
          rows={[
            { name: 'Lahore', value: 41 },
            { name: 'Karachi', value: 32 },
            { name: 'Islamabad', value: 18 },
            { name: 'Others', value: 9 },
          ]}
        />
      </Section>

      <Section n="06" title="AI Recommendations">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>Increase Lahore weekend coverage</li>
          <li>Promote 1L SKU in family-size segments</li>
          <li>Improve objection handling scripts for habit brands</li>
        </ol>
      </Section>
    </div>
  )
}

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-3 text-xs font-bold tracking-wide text-brand-600 uppercase">
        {n} — {title}
      </div>
      {children}
    </Card>
  )
}

export function SettingsPage() {
  const [section, setSection] = useState('Certification Rules')
  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <Card padding={false}>
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Campaign Configuration</div>
        <nav className="p-2">
          {settingsSections.map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`mb-0.5 w-full rounded-xl px-3 py-2 text-left text-sm ${
                section === s ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s}
            </button>
          ))}
        </nav>
      </Card>
      <Card>
        <h2 className="text-xl font-bold">{section}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Administrator configuration surface — mock controls for showcase. Content is
          campaign-configurable per the feature spec.
        </p>
        {section === 'Certification Rules' && (
          <div className="mt-5 space-y-4">
            <Field label="Pass threshold" value="75" />
            <Field label="A+ threshold" value="90" />
            <Field label="Required criteria" value="5 / 5 scored" />
            <Button>Save rules</Button>
          </div>
        )}
        {section === 'Training Scenarios' && (
          <div className="mt-5 space-y-3">
            {['Why switch from Dalda?', 'Is it good for frying?', 'Which size for family of 5?'].map((s) => (
              <div key={s} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                {s}
              </div>
            ))}
            <Button variant="secondary">Add scenario</Button>
          </div>
        )}
        {section !== 'Certification Rules' && section !== 'Training Scenarios' && (
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Configuration panel for <strong>{section}</strong> — ready for detailed admin forms in
            later iterations.
          </div>
        )}
      </Card>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        defaultValue={value}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
      />
    </label>
  )
}
