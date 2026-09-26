import { useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { MarketVisitForm } from '../../components/MarketVisitForm'
import { Button, Card, EmptyState, StatusBadge, TableScroll, Tabs } from '../../components/ui'
import {
  coverageTotals,
  emptyVisitDraft,
  formatVisitDate,
  submitMarketVisitReport,
  useMarketVisitReports,
  visitReportErrors,
  type MarketVisitDraft,
} from '../../lib/marketVisitReports'
import { usePortal } from './SupervisorPortal'

export function SupervisorMarketVisitPage() {
  const { supervisor, header } = usePortal('Market Visit Report', 'file a visit and send it to Head Office')
  const reports = useMarketVisitReports()
  const mine = supervisor ? reports.filter((report) => report.supervisorId === supervisor.id) : []
  const [tab, setTab] = useState('New report')
  const [draft, setDraft] = useState<MarketVisitDraft | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const form = draft ?? (supervisor ? emptyVisitDraft() : null)
  const open = mine.find((report) => report.id === openId) ?? null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!supervisor || !form) return
    const nextErrors = visitReportErrors(form)
    setErrors(nextErrors)
    if (nextErrors.length) return
    const created = submitMarketVisitReport(
      { supervisorId: supervisor.id, supervisorName: supervisor.name, filedBy: 'supervisor' },
      form,
    )
    setDraft(emptyVisitDraft())
    setNotice(created.id)
    setTab('My reports')
    setOpenId(created.id)
  }

  return (
    <div className="space-y-5">
      {header}
      {notice && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>
            Report <span className="font-semibold">{notice}</span> was sent to Head Office and is waiting in Market
            Visits.
          </span>
        </div>
      )}

      {open ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpenId(null)
                setNotice(null)
              }}
            >
              <ArrowLeft size={14} />
              Back to my reports
            </Button>
            <StatusBadge status={open.status === 'Reviewed' ? 'Reviewed' : 'Submitted'} />
          </div>
          <MarketVisitForm mode="view" value={open} />
        </div>
      ) : (
        <>
          <Tabs tabs={['New report', 'My reports']} value={tab} onChange={setTab} />
          {tab === 'New report' && form && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errors.length > 0 && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  <ul className="list-disc space-y-1 pl-4">
                    {errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
              <MarketVisitForm mode="edit" value={form} onChange={setDraft} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Head Office receives this report as soon as you submit it.</p>
                <Button type="submit">Submit to Head Office</Button>
              </div>
            </form>
          )}
          {tab === 'My reports' &&
            (mine.length === 0 ? (
              <EmptyState
                title="No reports yet"
                description="Submit a market visit report and it will be listed here and sent to Head Office."
              />
            ) : (
              <Card padding={false}>
                <TableScroll minWidth={720}>
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Submitted</th>
                        <th className="px-4 py-3 font-semibold">Market / Town</th>
                        <th className="px-4 py-3 font-semibold">Channel</th>
                        <th className="px-4 py-3 font-semibold">Cover %</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {mine.map((report) => (
                        <tr key={report.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 text-xs text-slate-500">{formatVisitDate(report.submittedAt)}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{report.marketTown}</div>
                            <div className="text-xs text-slate-500">{report.regionArea || '—'}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{report.channels.join(', ') || '—'}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {coverageTotals(report.coverage).cover}%
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={report.status === 'Reviewed' ? 'Reviewed' : 'Submitted'} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button size="sm" variant="secondary" onClick={() => setOpenId(report.id)}>
                              Open
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              </Card>
            ))}
        </>
      )}
    </div>
  )
}
