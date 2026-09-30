import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button, Card, CardHeader, Modal } from '../../components/ui'
import { formatPkr } from '../../lib/incentives'
import {
  baPackageTotalAt100,
  DEFAULT_KPI_CONFIG,
  setKpiConfigAsync,
  supPackageTotal,
  useKpiConfigSync,
  type KpiConfig,
} from '../../lib/kpiConfig'

type Draft = Record<keyof KpiConfig, string>

const toDraft = (c: KpiConfig): Draft =>
  Object.fromEntries(Object.entries(c).map(([k, v]) => [k, String(v)])) as Draft

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500'

const num = (text: string) => (text.trim() === '' ? Number.NaN : Number(text))

const FIELDS: { key: keyof KpiConfig; label: string }[] = [
  { key: 'baSalary', label: 'BA salary' },
  { key: 'baDiscipline', label: 'BA discipline / attendance' },
  { key: 'baTravelPerDay', label: 'BA travelling per day' },
  { key: 'baTravelCap', label: 'BA travelling monthly cap' },
  { key: 'baGrooming', label: 'BA grooming' },
  { key: 'baMobile', label: 'BA mobile / data' },
  { key: 'baTargetSlab90', label: 'Target Achievement at 90%' },
  { key: 'baTargetSlab100', label: 'Target Achievement at 100%' },
  { key: 'baTargetSlab110', label: 'Target Achievement at 110%' },
  { key: 'baDisciplineMinDays', label: 'Min days for discipline' },
  { key: 'supSalary', label: 'Supervisor salary' },
  { key: 'supFuelDa', label: 'Supervisor fuel / DA' },
  { key: 'supDiscipline', label: 'Supervisor discipline / attendance' },
  { key: 'supMobile', label: 'Supervisor mobile / data' },
]

function NumberInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  suffix?: string
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      <div className="relative">
        <input
          type="number"
          min={0}
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} ${suffix ? 'pr-16' : ''}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </label>
  )
}

/** Dialog where Head Office sets BA + Supervisor package KPIs. */
export function KpiSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const config = useKpiConfigSync()
  const [draft, setDraft] = useState<Draft>(() => toDraft(config))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [wasOpen, setWasOpen] = useState(false)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(toDraft(config))
      setError(null)
    }
  }

  const set = (key: keyof Draft) => (v: string) => setDraft({ ...draft, [key]: v })

  const preview = (() => {
    try {
      const next = { ...DEFAULT_KPI_CONFIG }
      for (const f of FIELDS) {
        const value = num(draft[f.key])
        if (!Number.isFinite(value) || value < 0) return null
        next[f.key] = value
      }
      return next
    } catch {
      return null
    }
  })()

  async function save() {
    const next = { ...DEFAULT_KPI_CONFIG }
    for (const f of FIELDS) {
      const value = num(draft[f.key])
      if (!Number.isFinite(value) || value < 0) {
        setError(`${f.label} must be a number of 0 or more.`)
        return
      }
      next[f.key] = value
    }
    setSaving(true)
    setError(null)
    try {
      await setKpiConfigAsync(next)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save KPIs')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Set package KPIs">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto text-sm">
        <p className="text-xs text-slate-500">
          Kashmir BA and Supervisor monthly packages. Saved in the database and used for incentive /
          pay calculations.
        </p>

        <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          BA package / month
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="BA salary" value={draft.baSalary} onChange={set('baSalary')} suffix="Rs" />
          <NumberInput
            label="Discipline / attendance"
            value={draft.baDiscipline}
            onChange={set('baDiscipline')}
            suffix="Rs"
          />
          <NumberInput
            label="Travelling / day"
            value={draft.baTravelPerDay}
            onChange={set('baTravelPerDay')}
            suffix="Rs"
          />
          <NumberInput
            label="Travelling monthly cap"
            value={draft.baTravelCap}
            onChange={set('baTravelCap')}
            suffix="Rs"
          />
          <NumberInput label="Grooming" value={draft.baGrooming} onChange={set('baGrooming')} suffix="Rs" />
          <NumberInput label="Mobile / data" value={draft.baMobile} onChange={set('baMobile')} suffix="Rs" />
          <NumberInput
            label="Min days for discipline"
            value={draft.baDisciplineMinDays}
            onChange={set('baDisciplineMinDays')}
            suffix="days"
          />
        </div>

        <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Target Achievement slabs
        </div>
        <div className="grid grid-cols-3 gap-3">
          <NumberInput label="≥ 90%" value={draft.baTargetSlab90} onChange={set('baTargetSlab90')} suffix="Rs" />
          <NumberInput label="≥ 100%" value={draft.baTargetSlab100} onChange={set('baTargetSlab100')} suffix="Rs" />
          <NumberInput label="≥ 110%" value={draft.baTargetSlab110} onChange={set('baTargetSlab110')} suffix="Rs" />
        </div>
        {preview && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            BA package at 100% target + full allowances:{' '}
            <strong>{formatPkr(baPackageTotalAt100(preview))}</strong>
          </p>
        )}

        <div className="border-t border-slate-100 pt-4 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Supervisor package / month
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Sup salary" value={draft.supSalary} onChange={set('supSalary')} suffix="Rs" />
          <NumberInput label="Fuel / DA" value={draft.supFuelDa} onChange={set('supFuelDa')} suffix="Rs" />
          <NumberInput
            label="Discipline / attendance"
            value={draft.supDiscipline}
            onChange={set('supDiscipline')}
            suffix="Rs"
          />
          <NumberInput label="Mobile / data" value={draft.supMobile} onChange={set('supMobile')} suffix="Rs" />
        </div>
        {preview && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Supervisor package total: <strong>{formatPkr(supPackageTotal(preview))}</strong>
          </p>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
        )}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save KPIs'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Dashboard entry point: current package KPIs at a glance. */
export function IncentiveKpiCard() {
  const config = useKpiConfigSync()
  const [open, setOpen] = useState(false)
  const chip = 'rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600'

  return (
    <Card>
      <CardHeader
        title="Package KPIs"
        subtitle="BA & Supervisor monthly packages (saved in database)"
        action={
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            <SlidersHorizontal size={13} /> Set KPIs
          </Button>
        }
      />
      <div className="space-y-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-24 font-semibold text-slate-500 uppercase">BA</span>
          <span className={chip}>Salary {formatPkr(config.baSalary)}</span>
          <span className={chip}>Target 100% {formatPkr(config.baTargetSlab100)}</span>
          <span className={chip}>Discipline {formatPkr(config.baDiscipline)}</span>
          <span className={chip}>
            Travel {formatPkr(config.baTravelPerDay)}/day · cap {formatPkr(config.baTravelCap)}
          </span>
          <span className={chip}>Total @100% {formatPkr(baPackageTotalAt100(config))}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-24 font-semibold text-slate-500 uppercase">Supervisor</span>
          <span className={chip}>Salary {formatPkr(config.supSalary)}</span>
          <span className={chip}>Fuel/DA {formatPkr(config.supFuelDa)}</span>
          <span className={chip}>Discipline {formatPkr(config.supDiscipline)}</span>
          <span className={chip}>Total {formatPkr(supPackageTotal(config))}</span>
        </div>
      </div>
      <KpiSettingsModal open={open} onClose={() => setOpen(false)} />
    </Card>
  )
}
