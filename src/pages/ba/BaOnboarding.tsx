import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTrainingContent, type TrainingModule } from '../../context/TrainingContentContext'
import { MIN_ANSWER_SECONDS, analyzeAnswer, summarizeAssessment } from '../../lib/baAssessment'
import { updateInvite, type Invite } from '../../lib/baInvites'
import { AssessmentReport } from './AssessmentReport'

const primaryButton =
  'rounded-2xl bg-navy-900 px-5 py-3.5 text-base font-semibold text-white shadow-md shadow-navy-900/20 transition enabled:hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-45'
const secondaryButton =
  'rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-base font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50'

function StepCard({ step, title, children }: { step: string; title: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{step}</div>
      <h1 className="mt-1 text-2xl leading-snug font-bold text-slate-900">{title}</h1>
      {children}
    </section>
  )
}

/** A newly invited BA: watch the training video, answer the verbal assessment, get the report. */
export function BaOnboarding({ invite }: { invite: Invite }) {
  const { modules } = useTrainingContent()
  const module = modules.find((m) => m.videoUrl) ?? modules[0]

  if (invite.result) return <ResultStep invite={invite} />
  if (!invite.videoWatched) return <VideoStep invite={invite} module={module} />
  return <AssessmentStep invite={invite} module={module} />
}

// ─── Step 1: training video ──────────────────────────────────────────────────

function VideoStep({ invite, module }: { invite: Invite; module: TrainingModule | undefined }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const furthest = useRef(0)
  const [percent, setPercent] = useState(0)
  const [finished, setFinished] = useState(false)

  function onTimeUpdate() {
    const v = videoRef.current
    if (!v || !v.duration) return
    // only natural playback counts as watched, not a jump forward
    if (!v.seeking && v.currentTime > furthest.current && v.currentTime - furthest.current < 2) {
      furthest.current = v.currentTime
    }
    const pct = Math.min(100, (furthest.current / v.duration) * 100)
    setPercent(Math.floor(pct))
    if (pct >= 98) setFinished(true)
  }

  function onSeeking() {
    const v = videoRef.current
    if (v && v.currentTime > furthest.current + 0.5) v.currentTime = furthest.current
  }

  return (
    <div className="space-y-4 py-4">
      <StepCard step="Step 1 · Training" title="Watch the BA training video">
        <p className="mt-2 text-base text-slate-500">
          Hi {invite.name}. Watch the full video, then continue to the verbal assessment.
        </p>
      </StepCard>

      {module?.videoUrl ? (
        <video
          key={module.id}
          ref={videoRef}
          src={module.videoUrl}
          controls
          controlsList="nodownload noplaybackrate"
          playsInline
          onTimeUpdate={onTimeUpdate}
          onSeeking={onSeeking}
          onEnded={() => {
            setFinished(true)
            setPercent(100)
          }}
          className="w-full rounded-2xl bg-black shadow-sm"
        />
      ) : (
        <div className="rounded-2xl bg-slate-200/80 px-4 py-10 text-center text-sm text-slate-600">
          No training video has been published yet. Ask Head Office to upload one under Ambassadors → Training
          videos, then reload this page.
        </div>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="text-sm text-slate-600">Watched {percent}%</div>
        <button
          type="button"
          disabled={!finished}
          onClick={() => updateInvite(invite.token, { videoWatched: true, status: 'Training' })}
          className={`mt-3 w-full ${primaryButton}`}
        >
          {finished ? 'Continue to assessment' : 'Finish the video first'}
        </button>
      </section>
    </div>
  )
}

// ─── Step 2: verbal assessment ───────────────────────────────────────────────

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

function AssessmentStep({ invite, module }: { invite: Invite; module: TrainingModule | undefined }) {
  const questions = module?.questions ?? []
  const qIndex = invite.answers.length
  const question = questions[qIndex]

  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
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

  // stop the camera and microphone if the BA leaves the page mid-recording
  useEffect(() => release, [])
  useEffect(() => () => {
    if (playbackUrl) URL.revokeObjectURL(playbackUrl)
  }, [playbackUrl])

  // the live preview element only exists while not reviewing a take, so attach the stream here
  useEffect(() => {
    const v = previewRef.current
    if (phase !== 'recording' || !v || !capture.current.stream) return
    v.srcObject = capture.current.stream
    v.play().catch(() => {})
  }, [phase])

  async function start() {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot use the camera. Open the link in Chrome or Edge.')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
    } catch {
      setError('Camera and microphone access is needed for the assessment. Allow access in your browser and try again.')
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

    // keep a copy of the video so the BA can play it back before submitting
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

    // measure how much of the time the BA is actually speaking
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

    // speech-to-text where the browser supports it (Chrome, Edge)
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
          // browser refused to restart — keep what we have
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
    if (!module || !question || c.durationSec < MIN_ANSWER_SECONDS) return
    const metrics = analyzeAnswer({
      questionId: question.id,
      prompt: question.prompt,
      reference: `${module.title} ${module.description} ${questions.map((q) => q.prompt).join(' ')}`,
      durationSec: c.durationSec,
      speechSec: c.speechSec,
      transcript: c.transcript,
    })
    const answers = [...invite.answers, metrics]
    if (answers.length >= questions.length) {
      const result = summarizeAssessment(answers)
      updateInvite(invite.token, { answers, result, status: result.certified ? 'Certified' : 'Training' })
    } else {
      updateInvite(invite.token, { answers })
    }
    setPlaybackUrl(null)
    setElapsed(0)
    setPhase('idle')
  }

  if (!module || questions.length === 0 || !question) {
    return (
      <div className="py-4">
        <StepCard step="Step 2 · Assessment" title="No assessment questions yet">
          <p className="mt-2 text-sm text-slate-500">
            Head Office has not added assessment questions. Ask them to add some under Ambassadors → Training
            videos, then reload this page.
          </p>
        </StepCard>
      </div>
    )
  }

  const lastQuestion = qIndex >= questions.length - 1
  const longEnough = capture.current.durationSec >= MIN_ANSWER_SECONDS
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <div className="space-y-4 py-4">
      <StepCard
        step={`Step 2 · Assessment · Question ${qIndex + 1} of ${questions.length}`}
        title={question.prompt}
      />

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
          disabled={phase !== 'recorded' || !longEnough}
          onClick={submit}
          className={primaryButton}
        >
          {lastQuestion ? 'Submit & finish' : 'Submit & next question'}
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

// ─── Step 3: results ─────────────────────────────────────────────────────────

function ResultStep({ invite }: { invite: Invite }) {
  const navigate = useNavigate()
  if (!invite.result) return null

  return (
    <div className="space-y-4 py-4">
      <AssessmentReport name={invite.name} result={invite.result} answers={invite.answers} />
      {invite.result.certified ? (
        <button type="button" onClick={() => navigate('/ba/home')} className={`w-full ${primaryButton}`}>
          Go to Home
        </button>
      ) : (
        <button
          type="button"
          onClick={() => updateInvite(invite.token, { answers: [], result: null, status: 'Training' })}
          className={`w-full ${primaryButton}`}
        >
          Retake assessment
        </button>
      )}
    </div>
  )
}
