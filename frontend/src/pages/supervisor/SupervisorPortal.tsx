import { useCallback } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { DesktopShell } from '../../components/AppShell'
import { Card, PageHeader } from '../../components/ui'
import { fetchSupervisorStockMatrix } from '../../lib/stocksApi'
import { signOut, useSupervisorSession } from '../../lib/supervisors'
import { StockMatrixPanel } from '../headOffice/StocksPage'
import {
  SupervisorBaTable,
  SupervisorDownloadReport,
  SupervisorIncentiveCard,
  SupervisorStoreCards,
  SupervisorSummary,
} from './SupervisorViews'

/** Only a signed-in supervisor (or a Head Office preview of one) gets into the portal. */
export function SupervisorGate() {
  const { supervisor } = useSupervisorSession()
  if (!supervisor) return <Navigate to="/login" replace />
  return <DesktopShell kind="supervisor" />
}

export function usePortal(title: string, description: string) {
  const { supervisor, preview } = useSupervisorSession()

  const header = (
    <>
      {preview && supervisor && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span>
            Head Office preview — you are viewing the portal as <strong>{supervisor.name}</strong>.
          </span>
          <Link
            to="/ho/supervisors"
            onClick={signOut}
            className="text-xs font-semibold text-amber-900 underline"
          >
            Exit preview
          </Link>
        </div>
      )}
      <PageHeader title={title} description={supervisor ? `${supervisor.name} · ${description}` : description} />
    </>
  )

  /** HO preview uses HO JWT + supervisor id; real supervisor uses /me/overview/ */
  const overviewMode: 'ho' | 'me' = preview ? 'ho' : 'me'

  return { supervisor, header, preview, overviewMode }
}

export function SupervisorHomePage() {
  const { supervisor, header, overviewMode } = usePortal('Supervisor Overview', 'your stores at a glance')
  return (
    <div className="space-y-5">
      {header}
      {supervisor && (
        <>
          <SupervisorSummary supervisor={supervisor} mode={overviewMode} />
          <SupervisorDownloadReport supervisor={supervisor} mode={overviewMode} />
          <SupervisorIncentiveCard supervisor={supervisor} />
        </>
      )}
    </div>
  )
}

export function SupervisorStoresPage() {
  const { supervisor, header, overviewMode } = usePortal(
    'Store Characteristics',
    'coverage, footfall and peak hours',
  )
  return (
    <div className="space-y-5">
      {header}
      {supervisor ? (
        <SupervisorStoreCards supervisor={supervisor} mode={overviewMode} />
      ) : (
        <Card>
          <p className="text-sm text-slate-500">Sign in to see your stores.</p>
        </Card>
      )}
    </div>
  )
}

export function SupervisorBasPage() {
  const { supervisor, header, overviewMode } = usePortal('BA Performance', 'ambassadors in your stores')
  return (
    <div className="space-y-5">
      {header}
      {supervisor ? <SupervisorBaTable supervisor={supervisor} mode={overviewMode} /> : null}
    </div>
  )
}

export function SupervisorStocksPage() {
  const { supervisor, header, overviewMode } = usePortal(
    'Stocks',
    'SKU status across your assigned stores',
  )
  const fetchFn = useCallback(
    () =>
      fetchSupervisorStockMatrix({
        mode: overviewMode,
        supervisorId: supervisor?.id,
      }),
    [overviewMode, supervisor?.id],
  )

  if (!supervisor) {
    return (
      <div className="space-y-5">
        {header}
        <Card>
          <p className="text-sm text-slate-500">Sign in to see stock for your stores.</p>
        </Card>
      </div>
    )
  }

  return (
    <StockMatrixPanel
      fetchFn={fetchFn}
      header={header}
      title="Stocks"
      description="Latest stock status for stores under your supervision"
      emptyStoresMessage="No stores assigned to this supervisor yet."
    />
  )
}
