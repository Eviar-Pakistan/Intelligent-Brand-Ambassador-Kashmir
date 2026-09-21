import { ProgressRing, StatusBadge } from '../../components/ui'
import { PASS_MARK, type AnswerMetrics, type AssessmentResult } from '../../lib/baAssessment'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-slate-900">{value}</div>
    </div>
  )
}

/** Results of a BA's verbal assessment. Shown to the BA after they finish and to Head Office. */
export function AssessmentReport({
  name,
  result,
  answers,
}: {
  name: string
  result: AssessmentResult
  answers: AnswerMetrics[]
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Kashmir · {name}</div>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Assessment report</h1>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge status={result.certified ? 'Certified' : 'Rejected'} />
          {!result.certified && (
            <span className="text-xs text-slate-500">Needs {PASS_MARK}% quality to be certified</span>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <div className="flex justify-center">
          <ProgressRing
            value={result.quality}
            size={132}
            stroke={12}
            color={result.certified ? '#047857' : '#dc2626'}
            label="Quality"
          />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Metric label="Communication" value={`${result.communication}/100`} />
          <Metric label="Question relevance" value={`${result.relevance}%`} />
          <Metric label="Training alignment" value={`${result.alignment}%`} />
          <Metric label="WPM" value={String(result.wpm)} />
          <Metric label="Nervousness" value={`${result.nervousness}%`} />
          <Metric label="Mood" value={result.mood} />
        </div>
        {!result.usedTranscript && (
          <p className="mt-3 text-[11px] text-slate-400">
            Speech-to-text was not available in this browser, so scores are estimated from audio activity only.
            Use Chrome or Edge for full analysis.
          </p>
        )}
      </section>

      {answers.length > 0 && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="text-sm font-bold text-slate-900">Answers</h2>
          <ol className="mt-3 space-y-3">
            {answers.map((a, i) => (
              <li key={a.questionId} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div className="text-xs font-semibold text-slate-500 uppercase">Question {i + 1}</div>
                <div className="mt-0.5 text-sm font-medium text-slate-900">{a.prompt}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {a.durationSec}s · {a.words} words · {a.wpm} wpm · communication {a.communication}/100
                </div>
                {a.transcript && <p className="mt-1.5 text-xs text-slate-600 italic">“{a.transcript}”</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
