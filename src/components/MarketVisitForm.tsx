import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Card, cn } from './ui'
import {
  OPPORTUNITY_CHANNELS,
  PRIORITIES,
  RATING_SCALE,
  VISIT_CHANNELS,
  asCount,
  assessmentAverage,
  blankOpportunity,
  coverPercent,
  coverageTotals,
  filledOpportunities,
  ratingLabel,
  type AssessmentRow,
  type CoverageRow,
  type MarketVisitDraft,
  type OpportunityRow,
  type Priority,
  type Rating,
  type VisitChannel,
} from '../lib/marketVisitReports'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15'

const CHANNEL_HELP: Record<VisitChannel, string> = {
  GT: 'General trade',
  MT: 'Modern trade',
  HoReCa: 'Hotels, restaurants & cafés',
}

type Props = {
  mode: 'edit' | 'view'
  value: MarketVisitDraft
  onChange?: (next: MarketVisitDraft) => void
}

function patch(value: MarketVisitDraft, onChange: Props['onChange'], next: Partial<MarketVisitDraft>) {
  onChange?.({ ...value, ...next })
}

export function MarketVisitForm({ mode, value, onChange }: Props) {
  const readOnly = mode === 'view'
  const totals = coverageTotals(value.coverage)
  const average = assessmentAverage(value.assessment)
  const opportunities = readOnly ? filledOpportunities(value.opportunities) : value.opportunities

  function updateCoverage(index: number, next: Partial<CoverageRow>) {
    patch(value, onChange, {
      coverage: value.coverage.map((row, i) => (i === index ? { ...row, ...next } : row)),
    })
  }

  function updateAssessment(index: number, next: Partial<AssessmentRow>) {
    patch(value, onChange, {
      assessment: value.assessment.map((row, i) => (i === index ? { ...row, ...next } : row)),
    })
  }

  function updateOpportunity(index: number, next: Partial<OpportunityRow>) {
    patch(value, onChange, {
      opportunities: value.opportunities.map((row, i) => (i === index ? { ...row, ...next } : row)),
    })
  }

  function toggleChannel(channel: VisitChannel) {
    const channels = value.channels.includes(channel)
      ? value.channels.filter((item) => item !== channel)
      : VISIT_CHANNELS.filter((item) => item === channel || value.channels.includes(item))
    patch(value, onChange, { channels })
  }

  function setRating(index: number, rating: Rating) {
    const current = value.assessment[index]?.rating
    updateAssessment(index, { rating: current === rating ? '' : rating })
  }

  return (
    <div className="space-y-4">
      <Section
        title="Visit details"
        description="Who went, where, and why."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Employee name"
            readOnly={readOnly}
            value={value.employeeName}
            placeholder="Full name"
            onChange={(employeeName) => patch(value, onChange, { employeeName })}
          />
          <TextField
            label="Designation"
            readOnly={readOnly}
            value={value.designation}
            placeholder="Role"
            onChange={(designation) => patch(value, onChange, { designation })}
          />
          <TextField
            label="Region / area"
            readOnly={readOnly}
            value={value.regionArea}
            placeholder="City or territory"
            onChange={(regionArea) => patch(value, onChange, { regionArea })}
          />
          <TextField
            label="Market / town visited"
            readOnly={readOnly}
            value={value.marketTown}
            placeholder="Market or town"
            onChange={(marketTown) => patch(value, onChange, { marketTown })}
          />
          <TextField
            label="Purpose of visit"
            readOnly={readOnly}
            value={value.purposeOfVisit}
            placeholder="Why this market was visited"
            onChange={(purposeOfVisit) => patch(value, onChange, { purposeOfVisit })}
          />
          <TextField
            label="Accompanied by"
            readOnly={readOnly}
            value={value.accompaniedBy}
            placeholder="Leave blank if you went alone"
            onChange={(accompaniedBy) => patch(value, onChange, { accompaniedBy })}
          />
          <TextField
            label="Distributor / stockist"
            className="sm:col-span-2"
            readOnly={readOnly}
            value={value.distributorStockist}
            placeholder="Who supplies this market"
            onChange={(distributorStockist) => patch(value, onChange, { distributorStockist })}
          />
        </div>
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-semibold text-slate-600">Channels visited</div>
          {readOnly ? (
            value.channels.length === 0 ? (
              <Empty>No channel selected</Empty>
            ) : (
              <div className="flex flex-wrap gap-2">
                {value.channels.map((channel) => (
                  <span
                    key={channel}
                    className="rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700"
                  >
                    {channel}
                    <span className="ml-1.5 font-normal text-brand-700/70">{CHANNEL_HELP[channel]}</span>
                  </span>
                ))}
              </div>
            )
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              {VISIT_CHANNELS.map((channel) => {
                const selected = value.channels.includes(channel)
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => toggleChannel(channel)}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-left transition',
                      selected
                        ? 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                    )}
                  >
                    <span className="block text-sm font-semibold">{channel}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{CHANNEL_HELP[channel]}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Market coverage"
        description="How many outlets were planned and how many you actually visited. Cover % is calculated for you."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {value.coverage.map((row, index) => (
            <div key={row.segment} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{row.segment}</div>
                <div className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  {coverPercent(row.planned, row.visited)}% covered
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <CountField
                  label="Planned"
                  readOnly={readOnly}
                  value={row.planned}
                  onChange={(planned) => updateCoverage(index, { planned })}
                />
                <CountField
                  label="Visited"
                  readOnly={readOnly}
                  value={row.visited}
                  onChange={(visited) => updateCoverage(index, { visited })}
                />
              </div>
              <div className="mt-3">
                <AreaField
                  label="Observations"
                  rows={2}
                  readOnly={readOnly}
                  value={row.remarks}
                  placeholder="What stood out in this segment"
                  onChange={(remarks) => updateCoverage(index, { remarks })}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-center">
          <Stat label="Planned" value={String(totals.planned)} />
          <Stat label="Visited" value={String(totals.visited)} />
          <Stat label="Cover" value={`${totals.cover}%`} />
        </div>
      </Section>

      <Section
        title="Market assessment"
        description="Rate each area from 1 (very poor) to 5 (excellent). A note is optional."
      >
        <div className="space-y-3">
          {value.assessment.map((row, index) => (
            <div key={row.parameter} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{row.parameter}</div>
                <span className="text-xs font-medium text-slate-500">{ratingLabel(row.rating)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {RATING_SCALE.map((item) => {
                  const selected = row.rating === item.value
                  return (
                    <button
                      key={item.value}
                      type="button"
                      disabled={readOnly}
                      onClick={() => setRating(index, item.value)}
                      className={cn(
                        'h-9 min-w-9 rounded-lg px-2.5 text-sm font-semibold ring-1 transition',
                        selected
                          ? 'bg-brand-500 text-white ring-brand-500'
                          : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                        readOnly && 'cursor-default',
                        readOnly && !selected && 'opacity-40',
                      )}
                    >
                      {item.value}
                    </button>
                  )
                })}
              </div>
              <div className="mt-3">
                <TextField
                  label="Note"
                  readOnly={readOnly}
                  value={row.remarks}
                  placeholder="Optional"
                  onChange={(remarks) => updateAssessment(index, { remarks })}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Average rating <span className="font-semibold text-slate-800">{average === null ? '—' : average.toFixed(1)}</span>
          <span className="mx-2 text-slate-300">·</span>
          1 Very poor · 2 Poor · 3 Average · 4 Good · 5 Excellent
        </p>
      </Section>

      <Section title="Competitive intelligence" description="What other brands are doing in this market.">
        <div className="grid gap-4">
          <AreaField
            label="Major competitors observed"
            readOnly={readOnly}
            value={value.majorCompetitors}
            placeholder="Brands you saw on the shelf or in the market"
            onChange={(majorCompetitors) => patch(value, onChange, { majorCompetitors })}
          />
          <AreaField
            label="What are they doing better?"
            readOnly={readOnly}
            value={value.doingBetter}
            placeholder="Price, display, scheme, availability…"
            onChange={(doingBetter) => patch(value, onChange, { doingBetter })}
          />
          <AreaField
            label="Key competitive movements"
            readOnly={readOnly}
            value={value.competitiveMovements}
            placeholder="New launches, offers, or distribution changes"
            onChange={(competitiveMovements) => patch(value, onChange, { competitiveMovements })}
          />
          <AreaField
            label="Potential impact on our business"
            readOnly={readOnly}
            value={value.potentialImpact}
            placeholder="What this could mean for sales or share"
            onChange={(potentialImpact) => patch(value, onChange, { potentialImpact })}
          />
        </div>
      </Section>

      <Section
        title="Business opportunities"
        description="Add a row for each opportunity you found. Leave it out if there were none."
      >
        {opportunities.length === 0 ? (
          <Empty>{readOnly ? 'No opportunities recorded.' : 'No opportunities added yet.'}</Empty>
        ) : (
          <div className="space-y-3">
            {opportunities.map((row, index) => (
              <div key={index} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Opportunity {index + 1}
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() =>
                        patch(value, onChange, {
                          opportunities: value.opportunities.filter((_, i) => i !== index),
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Opportunity"
                    readOnly={readOnly}
                    value={row.opportunity}
                    placeholder="What could we do"
                    onChange={(opportunity) => updateOpportunity(index, { opportunity })}
                  />
                  {readOnly ? (
                    <TextField label="Channel" readOnly value={row.channel} onChange={() => undefined} />
                  ) : (
                    <Field label="Channel">
                      <select
                        value={row.channel}
                        onChange={(e) => updateOpportunity(index, { channel: e.target.value })}
                        className={inputClass}
                      >
                        <option value="">Select channel</option>
                        {OPPORTUNITY_CHANNELS.map((channel) => (
                          <option key={channel} value={channel}>
                            {channel}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <TextField
                    label="Potential volume"
                    readOnly={readOnly}
                    value={row.potentialVolume}
                    placeholder="e.g. 200 cartons / month"
                    onChange={(potentialVolume) => updateOpportunity(index, { potentialVolume })}
                  />
                  {readOnly ? (
                    <TextField label="Priority" readOnly value={row.priority} onChange={() => undefined} />
                  ) : (
                    <Field label="Priority">
                      <div className="flex flex-wrap gap-1.5">
                        {PRIORITIES.map((priority) => {
                          const selected = row.priority === priority
                          return (
                            <button
                              key={priority}
                              type="button"
                              onClick={() =>
                                updateOpportunity(index, { priority: selected ? '' : (priority as Priority) })
                              }
                              className={cn(
                                'rounded-lg px-3 py-2 text-xs font-semibold ring-1 transition',
                                selected
                                  ? priority === 'High'
                                    ? 'bg-rose-600 text-white ring-rose-600'
                                    : priority === 'Medium'
                                      ? 'bg-amber-500 text-white ring-amber-500'
                                      : 'bg-slate-700 text-white ring-slate-700'
                                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                              )}
                            >
                              {priority}
                            </button>
                          )
                        })}
                      </div>
                    </Field>
                  )}
                  <div className="sm:col-span-2">
                    <AreaField
                      label="Details"
                      rows={2}
                      readOnly={readOnly}
                      value={row.details}
                      placeholder="What would it take to act on this"
                      onChange={(details) => updateOpportunity(index, { details })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={() =>
              patch(value, onChange, { opportunities: [...value.opportunities, blankOpportunity()] })
            }
          >
            <Plus size={14} />
            Add opportunity
          </Button>
        )}
      </Section>

      <Section title="Learnings and challenges" description="The takeaway Head Office should act on.">
        <div className="grid gap-4">
          <AreaField
            label="Key learnings from the visit"
            readOnly={readOnly}
            value={value.keyLearnings}
            placeholder="What did you learn"
            onChange={(keyLearnings) => patch(value, onChange, { keyLearnings })}
          />
          <AreaField
            label="Key challenges observed"
            readOnly={readOnly}
            value={value.keyChallenges}
            placeholder="What is getting in the way"
            onChange={(keyChallenges) => patch(value, onChange, { keyChallenges })}
          />
          <AreaField
            label="Business insight"
            readOnly={readOnly}
            value={value.businessInsight}
            placeholder="What should change because of this visit"
            onChange={(businessInsight) => patch(value, onChange, { businessInsight })}
          />
          <AreaField
            label="Additional comments"
            readOnly={readOnly}
            value={value.additionalComments}
            placeholder="Anything else worth sharing"
            onChange={(additionalComments) => patch(value, onChange, { additionalComments })}
          />
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  )
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-400">{children}</p>
}

function Readout({ value }: { value: string }) {
  if (!value.trim()) return <p className="text-sm text-slate-400">Not provided</p>
  return <p className="text-sm whitespace-pre-wrap text-slate-800">{value}</p>
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  readOnly: boolean
  placeholder?: string
  className?: string
}) {
  return (
    <Field label={label} className={className}>
      {readOnly ? (
        <Readout value={value} />
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
    </Field>
  )
}

function AreaField({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  readOnly: boolean
  placeholder?: string
  rows?: number
}) {
  return (
    <Field label={label}>
      {readOnly ? (
        <Readout value={value} />
      ) : (
        <textarea
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} resize-y`}
        />
      )}
    </Field>
  )
}

function CountField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string
  value: number | ''
  onChange: (value: number | '') => void
  readOnly: boolean
}) {
  return (
    <Field label={label}>
      {readOnly ? (
        <Readout value={value === '' ? '' : String(value)} />
      ) : (
        <input
          type="number"
          min={0}
          step={1}
          value={value}
          placeholder="0"
          onChange={(e) => onChange(asCount(e.target.value))}
          className={inputClass}
        />
      )}
    </Field>
  )
}
