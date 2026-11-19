/**
 * Same-origin MediaPipe assets + a shared FaceDetector kept in memory.
 * Prefetch after supervisor login; Check-in modal reuses the detector offline
 * (camera only — no WASM/model reload).
 */

import type { FaceDetector } from '@mediapipe/tasks-vision'

const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')

export const FACE_WASM_ROOT = `${base}mediapipe/wasm`
export const FACE_MODEL_URL = `${base}mediapipe/models/blaze_face_short_range.tflite`

let sharedDetector: FaceDetector | null = null
let loadPromise: Promise<FaceDetector> | null = null

export function isFaceDetectorReady(): boolean {
  return sharedDetector != null
}

/**
 * Return the process-wide VIDEO face detector, creating it once while online.
 * Do not call `.close()` on this instance from UI — it is shared.
 */
export function getSharedFaceDetector(): Promise<FaceDetector> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Face check is only available in the browser.'))
  }
  if (sharedDetector) return Promise.resolve(sharedDetector)
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(FACE_WASM_ROOT)

    // Prefer model bytes in memory so we are not dependent on a second model fetch.
    let modelBuffer: Uint8Array | undefined
    try {
      const res = await fetch(FACE_MODEL_URL)
      if (res.ok) modelBuffer = new Uint8Array(await res.arrayBuffer())
    } catch {
      /* fall back to path */
    }

    const pathOpts = { modelAssetPath: FACE_MODEL_URL } as const
    const bufferOpts = modelBuffer ? ({ modelAssetBuffer: modelBuffer } as const) : null

    async function create(delegate: 'GPU' | 'CPU') {
      const baseOptions = bufferOpts
        ? { ...bufferOpts, delegate }
        : { ...pathOpts, delegate }
      return FaceDetector.createFromOptions(vision, {
        baseOptions,
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.55,
      })
    }

    let detector: FaceDetector
    try {
      detector = await create('GPU')
    } catch {
      detector = await create('CPU')
    }

    sharedDetector = detector
    return detector
  })().catch((err) => {
    loadPromise = null
    throw err
  })

  return loadPromise
}

/** Warm the shared detector after supervisor login (no-op if already loaded). */
export function prefetchFaceCheckAssets(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  return getSharedFaceDetector()
    .then(() => undefined)
    .catch(() => undefined)
}
