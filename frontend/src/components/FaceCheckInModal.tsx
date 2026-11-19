import { useEffect, useRef, useState } from 'react'
import { getSharedFaceDetector, isFaceDetectorReady } from '../lib/faceCheckAssets'
import { Button, Modal } from './ui'
import type { FaceDetector } from '@mediapipe/tasks-vision'

type Props = {
  open: boolean
  title: string
  subtitle?: string
  busy?: boolean
  confirmLabel?: string
  /** Cap longest photo edge (px). Omit = full camera frame. */
  maxPhotoEdge?: number
  /** Server/API error (e.g. geofence) shown above Confirm — does not block retry. */
  submitError?: string | null
  onClose: () => void
  onConfirmed: (photo: Blob) => void
}

/** MediaPipe face gate + selfie capture before check-in (BA or supervisor). */
export function FaceCheckInModal({
  open,
  title,
  subtitle = 'Look at the camera so your face is detected, then confirm. GPS and this photo are saved with check-in.',
  busy = false,
  confirmLabel = 'Confirm check-in',
  maxPhotoEdge,
  submitError = null,
  onClose,
  onConfirmed,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const detectorRef = useRef<FaceDetector | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const lastDetectMs = useRef(0)

  const [ready, setReady] = useState(false)
  const [faceOk, setFaceOk] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setReady(false)
    setFaceOk(false)
    setError(null)

    const stopCamera = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      // Keep shared MediaPipe detector in memory for offline re-open.
      detectorRef.current = null
    }

    const loop = () => {
      if (cancelled) return
      const video = videoRef.current
      const detector = detectorRef.current
      if (video && detector && video.readyState >= 2) {
        const now = performance.now()
        if (now - lastDetectMs.current > 120) {
          lastDetectMs.current = now
          try {
            const result = detector.detectForVideo(video, now)
            const hasFace = (result.detections?.length ?? 0) > 0
            setFaceOk(hasFace)
            if (hasFace) setError(null)
          } catch {
            // keep last faceOk
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('This browser cannot use the camera. Open in Chrome or Edge.')
          return
        }

        // Reuse in-memory detector when possible (works offline after first online load).
        const detector = await getSharedFaceDetector()
        if (cancelled) return
        detectorRef.current = detector

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
        }
        setReady(true)
        rafRef.current = requestAnimationFrame(loop)
      } catch (e) {
        if (cancelled) return
        const raw = e instanceof Error ? e.message : ''
        const msg = /permission|notallowed|denied/i.test(raw)
          ? 'Camera permission denied. Allow camera access and try again.'
          : isFaceDetectorReady()
            ? 'Could not start the camera. Allow camera access and try again.'
            : !navigator.onLine || /failed to fetch|networkerror|load/i.test(raw)
              ? 'Face check files are not ready on this device. Stay online after login until face check loads, then try again.'
              : 'Could not start face check. Allow camera access and try again.'
        setError(msg)
      }
    })()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [open])

  const capturePhoto = (): Blob | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth < 8) return null
    const vw = video.videoWidth
    const vh = video.videoHeight
    const scale =
      maxPhotoEdge && maxPhotoEdge > 0
        ? Math.min(1, maxPhotoEdge / Math.max(vw, vh))
        : 1
    canvas.width = Math.max(1, Math.round(vw * scale))
    canvas.height = Math.max(1, Math.round(vh * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    const comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    const bin = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: 'image/jpeg' })
  }

  const handleConfirm = () => {
    if (!faceOk || busy) {
      if (!faceOk && !busy) {
        setError('No face detected. Look at the camera and try again.')
      }
      return
    }
    const photo = capturePhoto()
    if (!photo) {
      setError('Could not capture photo. Try again.')
      return
    }
    onConfirmed(photo)
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!faceOk || busy || (!!error && !faceOk)}>
            {busy ? 'Checking in…' : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{subtitle}</p>
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-900">
          <video
            ref={videoRef}
            className="h-full w-full scale-x-[-1] object-cover"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="hidden" />
          <div
            className={`absolute bottom-2 left-2 rounded px-2 py-1 text-xs font-medium ${
              faceOk ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
            }`}
          >
            {!ready && !error ? 'Starting camera…' : faceOk ? 'Face detected' : 'No face detected'}
          </div>
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {!error && ready && !faceOk ? (
          <p className="text-sm text-amber-700">No face detected. Face the camera to continue.</p>
        ) : null}
        {submitError ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700"
          >
            {submitError}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
