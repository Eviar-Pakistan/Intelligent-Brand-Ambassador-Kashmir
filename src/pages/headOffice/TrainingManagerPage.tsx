import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { Plus, Trash2, Upload, Video } from 'lucide-react'
import { Button, Card, PageHeader, StatusBadge } from '../../components/ui'
import { useTrainingContent } from '../../context/TrainingContentContext'

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500'

export function TrainingManagerPage() {
  const { modules, addModule, removeModule } = useTrainingContent()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [questions, setQuestions] = useState([''])
  const [toast, setToast] = useState<string | null>(null)

  const canSave = useMemo(() => {
    if (!title.trim() || !videoFile) return false
    return questions.every((q) => q.trim().length > 0)
  }, [title, videoFile, questions])

  function handleSave() {
    if (!canSave || !videoFile) return
    const videoUrl = URL.createObjectURL(videoFile)
    addModule({
      title: title.trim(),
      description: description.trim(),
      videoName: videoFile.name,
      videoUrl,
      questions: questions.map((prompt, i) => ({
        id: `q-${Date.now()}-${i}`,
        prompt: prompt.trim(),
      })),
    })
    setTitle('')
    setDescription('')
    setVideoFile(null)
    setQuestions([''])
    setToast('Training video and questions saved')
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/ho/ambassadors" className="text-sm text-slate-500 hover:text-brand-600">
          ← Ambassadors
        </Link>
      </div>

      <PageHeader
        title="Training content"
        description="Upload training videos and assessment questions for Brand Ambassadors"
      />

      {toast && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <Card>
        <h3 className="font-semibold text-slate-900">Upload training video</h3>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Title</span>
            <input
              className={fieldClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Objection handling — Week 1"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Description</span>
            <textarea
              className={fieldClass}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What should BAs learn from this video?"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Video file</span>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
              <Upload size={18} className="text-slate-400" />
              <div className="min-w-0 flex-1">
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-700"
                />
                {videoFile && (
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {videoFile.name} · {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                )}
              </div>
            </div>
          </label>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">Assessment questions</h3>
            <p className="text-xs text-slate-500">Questions only — no answers required</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setQuestions((prev) => [...prev, ''])}
          >
            <Plus size={14} /> Add question
          </Button>
        </div>

        <div className="space-y-3">
          {questions.map((q, qi) => (
            <div key={qi} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Question {qi + 1}
                </span>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== qi))}
                    className="text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                className={fieldClass}
                value={q}
                onChange={(e) =>
                  setQuestions((prev) => prev.map((item, i) => (i === qi ? e.target.value : item)))
                }
                placeholder="Enter assessment question"
              />
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <Button disabled={!canSave} onClick={handleSave}>
            Save training module
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900">Published modules</h3>
        {modules.length === 0 ? (
          <p className="text-sm text-slate-500">No training modules yet.</p>
        ) : (
          <div className="space-y-3">
            {modules.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Video size={15} className="text-brand-600" />
                    <span className="font-semibold text-slate-900">{m.title}</span>
                    <StatusBadge status="Training" />
                  </div>
                  {m.description && (
                    <p className="mt-1 text-sm text-slate-500">{m.description}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    {m.videoName || 'No file name'} · {m.questions.length} question
                    {m.questions.length === 1 ? '' : 's'}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {m.questions.map((q, i) => (
                      <li key={q.id}>
                        {i + 1}. {q.prompt}
                      </li>
                    ))}
                  </ul>
                  {m.videoUrl && (
                    <video
                      src={m.videoUrl}
                      controls
                      className="mt-3 max-h-48 w-full max-w-md rounded-xl bg-black"
                    />
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeModule(m.id)}>
                  <Trash2 size={14} /> Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
