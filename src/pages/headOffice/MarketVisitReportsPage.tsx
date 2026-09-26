import { useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, ClipboardList, Clock3, Plus } from 'lucide-react'
import { MarketVisitForm } from '../../components/MarketVisitForm'
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  StatusBadge,
  TableScroll,
  Tabs,
} from '../../components/ui'
import {
  assessmentAverage,
  coverageTotals,
  emptyVisitDraft,
  formatVisitDate,
  reviewMarketVisitReport,
  submitMarketVisitReport,
  useMarketVisitReports,
  visitReportErrors,
  type MarketVisitDraft,
  type MarketVisitReport,
} from '../../lib/marketVisitReports'

export function MarketVisitReportsPage() {
  const reports = useMarketVisitReports()
  const [tab, setTab] = useState('All')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState<MarketVisitDraft>(() => emptyVisitDraft())
  const [errors, setErrors] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [reviewer, setReviewer] = useState('Head Office')

  const selected = reports.find((report) => report.id === selectedId) ?? null

  const counts = useMemo(
    () => ({
      total: reports.length,
      waiting: reports.filter((report) => report.status === 'Submitted').length,
      reviewed: reports.filter((report) => report.status === 'Reviewed').length,
    }),
    [reports],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return reports.filter((report) => {
      if (tab === 'Awaiting review' && report.status !== 'Submitted') return false
      if (tab === 'Reviewed' && report.status !== 'Reviewed') return false
      if (!q) return true
      const haystack = [
        report.employeeName,
        report.supervisorName,
        report.marketTown,
        report.regionArea,
        report.purposeOfVisit,
        report.id,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [reports, query, tab])

  function flash(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2800)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = visitReportErrors(draft)
    setErrors(nextErrors)
    if (nextErrors.length) return
    const created = submitMarketVisitReport(
      {
        supervisorId: 'head-office',
        supervisorName: draft.employeeName.trim() || 'Head Office',
        filedBy: 'headOffice',
      },
      draft,
    )
    setDraft(emptyVisitDraft())
    setComposing(false)
    setSelectedId(created.id)
    flash(`Report ${created.id} filed.`)
  }

  function markReviewed() {
    if (!selected) return
    reviewMarketVisitReport(selected.id, reviewer)
    flash(`Report ${selected.id} marked reviewed.`)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Market Visit Reports"
        description="Reports filed by supervisors arrive here for Head Office review"
        actions={
          !composing && !selected ? (
            <Button
              onClick={() => {
                setErrors([])
                setComposing(true)
              }}
            >
              <Plus size={14} />
              File a report
            </Button>
          ) : undefined
        }
      />

      {toast && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      {composing ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Button type="button" variant="secondary" onClick={() => setComposing(false)}>
            <ArrowLeft size={14} />
            Back to received reports
          </Button>
          {errors.length > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <ul className="list-disc space-y-1 pl-4">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <MarketVisitForm mode="edit" value={draft} onChange={setDraft} />
          <div className="flex justify-end">
            <Button type="submit">Submit report</Button>
          </div>
        </form>
      ) : selected ? (
        <ReportDetail
          report={selected}
          reviewer={reviewer}
          onReviewer={setReviewer}
          onReview={markReviewed}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ClipboardList size={14} /> Received
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{counts.total}</div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock3 size={14} /> Awaiting review
              </div>
              <div className="mt-1 text-2xl font-bold text-amber-600">{counts.waiting}</div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <CheckCircle2 size={14} /> Reviewed
              </div>
              <div className="mt-1 text-2xl font-bold text-sky-700">{counts.reviewed}</div>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs tabs={['All', 'Awaiting review', 'Reviewed']} value={tab} onChange={setTab} />
            <div className="w-full sm:w-72">
              <SearchInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search market, employee, supervisor"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title={reports.length === 0 ? 'No market visits yet' : 'No reports in this view'}
              description={
                reports.length === 0
                  ? 'When a supervisor submits a Market Visit Report, the full form arrives here.'
                  : 'Try another status or clear the search.'
              }
            />
          ) : (
            <Card padding={false}>
              <TableScroll minWidth={980}>
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Submitted</th>
                      <th className="px-4 py-3 font-semibold">Filed by</th>
                      <th className="px-4 py-3 font-semibold">Employee</th>
                      <th className="px-4 py-3 font-semibold">Market / Town</th>
                      <th className="px-4 py-3 font-semibold">Channel</th>
                      <th className="px-4 py-3 font-semibold">Cover %</th>
                      <th className="px-4 py-3 font-semibold">Avg rating</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((report) => {
                      const average = assessmentAverage(report.assessment)
                      return (
                        <tr key={report.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 text-xs text-slate-500">{formatVisitDate(report.submittedAt)}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">
                              {report.filedBy === 'headOffice' ? 'Head Office' : report.supervisorName}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400">{report.id}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{report.employeeName}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{report.marketTown}</div>
                            <div className="text-xs text-slate-500">{report.regionArea || '—'}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{report.channels.join(', ')}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {coverageTotals(report.coverage).cover}%
                          </td>
                          <td className="px-4 py-3 text-slate-700">{average === null ? '—' : average.toFixed(1)}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={report.status} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button size="sm" variant="secondary" onClick={() => setSelectedId(report.id)}>
                              Open
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableScroll>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function ReportDetail({
  report,
  reviewer,
  onReviewer,
  onReview,
  onBack,
}: {
  report: MarketVisitReport
  reviewer: string
  onReviewer: (value: string) => void
  onReview: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={onBack}>
          <ArrowLeft size={14} />
          Back to received reports
        </Button>
        <div className="text-right text-xs text-slate-500">
          <div className="font-mono">{report.id}</div>
          <div>
            {report.filedBy === 'headOffice' ? 'Filed by Head Office' : `Filed by ${report.supervisorName}`}
            {' · '}
            {formatVisitDate(report.submittedAt)}
          </div>
        </div>
      </div>

      <MarketVisitForm mode="view" value={report} />

      {report.status === 'Submitted' ? (
        <Card>
          <h3 className="font-semibold text-slate-900">Review this report</h3>
          <p className="mt-1 text-sm text-slate-500">
            Your name is written on the Reviewed By line and the supervisor can see that Head Office has received it.
          </p>
          <label className="mt-4 block max-w-sm text-sm">
            <span className="mb-1 block font-medium text-slate-700">Reviewer name</span>
            <input
              value={reviewer}
              onChange={(e) => onReviewer(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
            />
          </label>
          <Button className="mt-4" onClick={onReview}>
            <CheckCircle2 size={15} />
            Mark as reviewed
          </Button>
        </Card>
      ) : (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Reviewed by <span className="font-semibold">{report.reviewedBy}</span> on {formatVisitDate(report.reviewedAt)}.
        </div>
      )}
    </div>
  )
}
