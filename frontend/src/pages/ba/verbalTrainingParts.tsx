import { useEffect, useRef, useState } from 'react'
import type { TrainingModule } from '../../context/TrainingContentContext'
import { MIN_ANSWER_SECONDS, analyzeAnswer, summarizeAssessment, type AnswerMetrics, type AssessmentResult } from '../../lib/baAssessment'

export const primaryButton =
  'rounded-2xl bg-navy-900 px-5 py-3.5 text-base font-semibold text-white shadow-md shadow-navy-900/20 transition enabled:hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-45'
export const secondaryButton =
  'rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-base font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50'

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}
type BrowserWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
  webkitAudioContext?: typeof AudioContext
}

type Phase = 'idle' | 'recording' | 'recorded'

type Capture = {
  stream: MediaStream | null
  recorder: MediaRecorder | null
  recognition: SpeechRecognitionLike | null
  audioCtx: AudioContext | null
  timer: number | null
  active: boolean
  startedAt: number
  speechFrames: number
  transcript: string
  durationSec: number
  speechSec: number
}

const SAMPLE_MS = 200

/** Training video that cannot be scrubbed past the furthest watched point. */
export function LockedTrainingVideo({
  videoUrl,
  videoKey,
  onFinishedChange,
}: {
  videoUrl: string
  videoKey: string
  onFinishedChange?: (finished: boolean, percent: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const furthest = useRef(0)
  const [percent, setPercent] = useState(0)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    furthest.current = 0
    setPercent(0)
    setFinished(false)
    onFinishedChange?.(false, 0)
    // reset only when the video source changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoKey, videoUrl])

  function bumpFinished(pct: number, done: boolean) {
    setPercent(pct)
    setFinished(done)
    onFinishedChange?.(done, pct)
  }

  function onTimeUpdate() {
    const v = videoRef.current
    if (!v || !v.duration) return
    if (!v.seeking && v.currentTime > furthest.current && v.currentTime - furthest.current < 2) {
      furthest.current = v.currentTime
    }
    const pct = Math.min(100, (furthest.current / v.duration) * 100)
    bumpFinished(Math.floor(pct), pct >= 98)
  }

  function onSeeking() {
    const v = videoRef.current
    if (v && v.currentTime > furthest.current + 0.5) v.currentTime = furthest.current
  }

  return (
    <div className="space-y-3">
      <video
        key={videoKey}
        ref={videoRef}
        src={videoUrl}
        controls
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        playsInline
        onTimeUpdate={onTimeUpdate}
        onSeeking={onSeeking}
        onEnded={() => bumpFinished(100, true)}
        className="w-full rounded-2xl bg-black shadow-sm"
      />
      <div className="text-sm text-slate-600">Watched {percent}%</div>
      {!finished && (
        <p className="text-xs text-slate-500">Finish the video to unlock the verbal questions. Seeking ahead is disabled.</p>
      )}
    </div>
  )
}

/** Mic + camera verbal answers for a module's questions. Calls onComplete with scores when done. */
export function VerbalAssessmentCapture({
  module,
  initialAnswers = [],
  onProgress,
  onComplete,
}: {
  module: TrainingModule
  initialAnswers?: AnswerMetrics[]
  onProgress?: (answers: AnswerMetrics[]) => void
  onComplete: (answers: AnswerMetrics[], result: AssessmentResult) => void
}) {
  const questions = module.questions
  const [answers, setAnswers] = useState<AnswerMetrics[]>(initialAnswers)
  const qIndex = answers.length
  const question = questions[qIndex]

  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const capture = useRef<Capture>({
    stream: null,
    recorder: null,
    recognition: null,
    audioCtx: null,
    timer: null,
    active: false,
    startedAt: 0,
    speechFrames: 0,
    transcript: '',
    durationSec: 0,
    speechSec: 0,
  })

  function release() {
    const c = capture.current
    c.active = false
    if (c.timer !== null) window.clearInterval(c.timer)
    c.timer = null
    try {
      c.recognition?.stop()
    } catch {
      // already stopped
    }
    if (c.recorder && c.recorder.state !== 'inactive') c.recorder.stop()
    c.stream?.getTracks().forEach((t) => t.stop())
    c.audioCtx?.close().catch(() => {})
    c.stream = null
    c.audioCtx = null
  }

  useEffect(() => release, [])
  useEffect(() => () => {
    if (playbackUrl) URL.revokeObjectURL(playbackUrl)
  }, [playbackUrl])

  useEffect(() => {
    const v = previewRef.current
    if (phase !== 'recording' || !v || !capture.current.stream) return
    v.srcObject = capture.current.stream
    v.play().catch(() => {})
  }, [phase])

  async function start() {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot use the camera. Open this page in Chrome or Edge.')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
    } catch {
      setError('Camera and microphone access is needed. Allow access in your browser and try again.')
      return
    }

    setPlaybackUrl(null)
    const c = capture.current
    Object.assign(c, {
      stream,
      active: true,
      startedAt: Date.now(),
      speechFrames: 0,
      transcript: '',
      durationSec: 0,
      speechSec: 0,
    })

    if (typeof MediaRecorder !== 'undefined') {
      const chunks: Blob[] = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      recorder.onstop = () => {
        if (chunks.length) setPlaybackUrl(URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType })))
      }
      recorder.start()
      c.recorder = recorder
    }

    const w = window as BrowserWindow
    let analyser: AnalyserNode | null = null
    try {
      const Ctx = window.AudioContext ?? w.webkitAudioContext
      if (Ctx && stream.getAudioTracks().length) {
        c.audioCtx = new Ctx()
        analyser = c.audioCtx.createAnalyser()
        analyser.fftSize = 1024
        c.audioCtx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser)
      }
    } catch {
      analyser = null
    }
    const samples = new Uint8Array(analyser?.fftSize ?? 0)

    const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (Recognition) {
      const recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = false
      recognition.lang = 'en-IN'
      recognition.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          if (e.results[i].isFinal) c.transcript += ` ${e.results[i][0].transcript}`
        }
      }
      recognition.onend = () => {
        if (!c.active) return
        try {
          recognition.start()
        } catch {
          // browser refused to restart
        }
      }
      recognition.onerror = () => {}
      try {
        recognition.start()
        c.recognition = recognition
      } catch {
        c.recognition = null
      }
    }

    c.timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - c.startedAt) / 1000))
      if (!analyser) return
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const s of samples) sum += ((s - 128) / 128) ** 2
      if (Math.sqrt(sum / samples.length) > 0.02) c.speechFrames += 1
    }, SAMPLE_MS)

    setElapsed(0)
    setPhase('recording')
  }

  function stop() {
    const c = capture.current
    c.durationSec = (Date.now() - c.startedAt) / 1000
    c.speechSec = (c.speechFrames * SAMPLE_MS) / 1000
    release()
    if (previewRef.current) previewRef.current.srcObject = null
    setPhase('recorded')
  }

  function submit() {
    const c = capture.current
    if (!question || c.durationSec < MIN_ANSWER_SECONDS || submitting) return
    setSubmitting(true)
    setError(null)

    window.setTimeout(() => {
      try {
        const metrics = analyzeAnswer({
          questionId: question.id,
          prompt: question.prompt,
          reference: `${module.title} ${module.description} ${questions.map((q) => q.prompt).join(' ')}`,
          durationSec: c.durationSec,
          speechSec: c.speechSec,
          transcript: c.transcript,
        })
        const nextAnswers = [...answers, metrics]
        setAnswers(nextAnswers)
        onProgress?.(nextAnswers)

        if (nextAnswers.length >= questions.length) {
          const result = summarizeAssessment(nextAnswers)
          onComplete(nextAnswers, result)
        } else {
          setPlaybackUrl(null)
          setElapsed(0)
          setPhase('idle')
          setSubmitting(false)
        }
      } catch {
        setError('Could not score this answer. Please try again.')
        setSubmitting(false)
      }
    }, 50)
  }

  if (submitting) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        <div>
          <p className="text-base font-semibold text-slate-900">Scoring your answer…</p>
          <p className="mt-1 text-sm text-slate-500">Please wait while we prepare your assessment report.</p>
        </div>
      </div>
    )
  }

  if (questions.length === 0 || !question) {
    return (
      <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm ring-1 ring-black/5">
        No assessment questions yet. Ask Head Office to add some under Ambassadors → Training videos.
      </div>
    )
  }

  const lastQuestion = qIndex >= questions.length - 1
  const longEnough = capture.current.durationSec >= MIN_ANSWER_SECONDS
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Question {qIndex + 1}/{questions.length}
        </div>
        <p className="mt-2 text-sm font-semibold text-slate-900">{question.prompt}</p>
      </section>

      <div className="relative overflow-hidden rounded-2xl bg-navy-950">
        {phase === 'recorded' && playbackUrl ? (
          <video src={playbackUrl} controls playsInline className="aspect-[4/3] w-full bg-black object-cover" />
        ) : (
          <video
            ref={previewRef}
            muted
            playsInline
            autoPlay
            className="aspect-[4/3] w-full -scale-x-100 bg-slate-900 object-cover"
          />
        )}
        {phase === 'recording' && (
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            REC {clock}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {phase === 'recording' ? (
          <button type="button" onClick={stop} className={secondaryButton}>
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            className={
              phase === 'recorded'
                ? secondaryButton
                : 'rounded-2xl bg-brand-500 px-5 py-3.5 text-base font-semibold text-white shadow-md shadow-brand-500/25 transition hover:bg-brand-600'
            }
          >
            {phase === 'recorded' ? 'Record again' : 'Start recording'}
          </button>
        )}
        <button
          type="button"
          disabled={phase !== 'recorded' || !longEnough || submitting}
          onClick={submit}
          className={primaryButton}
        >
          {submitting ? 'Scoring…' : lastQuestion ? 'Submit & finish' : 'Submit & next question'}
        </button>
      </div>

      {phase === 'recorded' && !longEnough && (
        <p className="text-sm text-amber-700">
          Your answer was too short. Record again — speak for at least {MIN_ANSWER_SECONDS} seconds.
        </p>
      )}
      {phase === 'idle' && (
        <p className="text-sm text-slate-500">
          Press Start recording and answer out loud. Your camera and microphone are used only for this assessment.
        </p>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}
    </div>
  )
}
