import { useCallback, useEffect, useState } from 'react'
import { CloudUpload, Trash2 } from 'lucide-react'
import { Button, Card, StatusBadge } from '../../components/ui'
import { ApiError } from '../../lib/api'
import {
  deleteOfflineVisit,
  listOfflineVisits,
  subscribeOfflineVisits,
  type OfflinePendingVisit,
} from '../../lib/supervisorOfflineVisits'
import { submitOfflineVisit, visitApiErrorMessage } from '../../lib/supervisorVisitApi'
import { usePortal } from './SupervisorPortal'

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function PhotoThumb({ blob }: { blob: Blob | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  if (!url) {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-[10px] text-slate-400">
        No photo
      </div>
    )
  }
  return <img src={url} alt="" className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200" />
}

export function SupervisorOfflinePage() {
  const { header, preview } = usePortal(
    'Offline',
    'pending check-ins and check-outs saved on this device',
  )
  const [rows, setRows] = useState<OfflinePendingVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    void listOfflineVisits()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    reload()
    return subscribeOfflineVisits(reload)
  }, [reload])

  async function onSubmit(localId: string) {
    if (preview) {
      setError('Preview mode cannot submit offline visits.')
      return
    }
    setBusyId(localId)
    setError(null)
    setInfo(null)
    try {
      await submitOfflineVisit(localId)
      setInfo('Visit submitted to the server.')
      reload()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : visitApiErrorMessage(err, 'Submit failed. Check your internet and try again.'),
      )
    } finally {
      setBusyId(null)
    }
  }

  async function onDiscard(localId: string) {
    if (!window.confirm('Remove this offline visit from this device? It will not be sent to the server.')) {
      return
    }
    setBusyId(localId)
    setError(null)
    try {
      await deleteOfflineVisit(localId)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove visit.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      {header}
      <p className="text-sm text-slate-600">
        When check-in or check-out cannot reach the server, it is saved here (selfie, GPS, times). Tap{' '}
        <span className="font-semibold">Submit</span> when internet is available.
      </p>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {info}
        </div>
      ) : null}

      {loading ? (
        <Card>
          <p className="text-sm text-slate-500">Loading offline visits…</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">No offline visits on this device.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const readyLabel = row.checkOutAt ? 'Ready (in + out)' : 'Checked in (no checkout yet)'
            return (
              <Card key={row.localId}>
                <div className="flex flex-wrap items-start gap-3">
                  <PhotoThumb blob={row.checkInPhoto} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-slate-900">
                        #{row.storeId} {row.storeName}
                      </div>
                      <StatusBadge status={row.checkOutAt ? 'Completed' : 'Open'} />
                      {row.serverVisitId ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          Checkout sync
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500">{row.storeCity || '—'}</div>
                    <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                      <div>
                        <span className="text-slate-400">Check-in: </span>
                        {formatWhen(row.checkInAt)}
                        <span className="ml-1 tabular-nums text-slate-400">
                          ({row.checkInLat.toFixed(5)}, {row.checkInLng.toFixed(5)})
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Check-out: </span>
                        {row.checkOutAt ? (
                          <>
                            {formatWhen(row.checkOutAt)}
                            {row.checkOutLat != null && row.checkOutLng != null ? (
                              <span className="ml-1 tabular-nums text-slate-400">
                                ({row.checkOutLat.toFixed(5)}, {row.checkOutLng.toFixed(5)})
                              </span>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">{readyLabel}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <Button
                    size="sm"
                    disabled={busyId === row.localId || !!preview}
                    onClick={() => void onSubmit(row.localId)}
                  >
                    <CloudUpload size={14} />
                    {busyId === row.localId ? 'Submitting…' : 'Submit'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === row.localId}
                    onClick={() => void onDiscard(row.localId)}
                  >
                    <Trash2 size={14} /> Discard
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
