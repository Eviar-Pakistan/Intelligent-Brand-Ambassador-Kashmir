import { useEffect, useRef, useState } from 'react'
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'
import { Button, Modal } from '../../components/ui'

const WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

type Props = {
  open: boolean
  storeName: string
  busy?: boolean
  onClose: () => void
  onConfirmed: (photo: Blob) => void
}

/** MediaPipe face gate + selfie capture before supervisor store check-in. */
export function SupervisorFaceCheckInModal({
  open,
  storeName,
  busy = false,
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

    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      detectorRef.current?.close()
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
        const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
        if (cancelled) return
        let detector: FaceDetector
        try {
          detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
            runningMode: 'VIDEO',
            minDetectionConfidence: 0.55,
          })
        } catch {
          detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
            runningMode: 'VIDEO',
            minDetectionConfidence: 0.55,
          })
        }
        if (cancelled) {
          detector.close()
          return
        }
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
        const msg =
          e instanceof Error && e.message.toLowerCase().includes('permission')
            ? 'Camera permission denied. Allow camera access and try again.'
            : 'Could not start face check. Allow camera access and try again.'
        setError(msg)
      }
    })()

    return () => {
      cancelled = true
      stop()
    }
  }, [open])

  const capturePhoto = (): Blob | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth < 8) return null
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    // sync toDataURL → blob via atob for browsers without toBlob callback reliability
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    const comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    const bin = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: 'image/jpeg' })
  }

  const handleConfirm = () => {
    if (!faceOk || busy) return
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
      title={`Check in · ${storeName}`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!faceOk || busy || !!error}>
            {busy ? 'Checking in…' : 'Confirm check-in'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Look at the camera so your face is detected, then confirm. GPS and this photo are saved with
          the visit.
        </p>
        <div className="relative overflow-hidden rounded-lg bg-slate-900 aspect-[4/3]">
          <video
            ref={videoRef}
            className="h-full w-full object-cover scale-x-[-1]"
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
      </div>
    </Modal>
  )
}
