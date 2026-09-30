/** Training video API helpers (HO upload + BA stream). */

import { apiBase, apiRequest, isApiAuthenticated } from './api'

export type TrainingQuestion = {
  id: string
  prompt: string
}

export type TrainingModuleDto = {
  id: string
  title: string
  description: string
  videoName: string
  videoUrl: string
  questions: TrainingQuestion[]
  createdAt: string
}

export type ApiTrainingQuestion = {
  id?: string
  type?: string
  question?: string
  title?: string
  description?: string
}

export type ApiTrainingVideo = {
  id: number
  file_url?: string | null
  original_name?: string
  transcript?: string
  transcript_preview?: string
  questions?: ApiTrainingQuestion[]
  question_count?: number
  is_active?: boolean
  ready?: boolean
  created_at?: string
  uploaded_by_email?: string
}

export function mapApiQuestions(questions?: ApiTrainingQuestion[]): TrainingQuestion[] {
  if (!Array.isArray(questions)) return []
  return questions
    .map((q, i) => {
      const prompt = String(q.question || q.title || '').trim()
      if (!prompt) return null
      return {
        id: String(q.id || `q${i + 1}`),
        prompt,
      }
    })
    .filter((q): q is TrainingQuestion => !!q)
}

export function mapApiTrainingVideo(v: ApiTrainingVideo): TrainingModuleDto {
  const publicStream = `${apiBase()}/api/ba/training/video/`
  return {
    id: `api-${v.id}`,
    title: v.original_name || `Training video #${v.id}`,
    description: (v.transcript_preview || '').trim(),
    videoName: v.original_name || '',
    videoUrl: v.file_url || publicStream,
    questions: mapApiQuestions(v.questions),
    createdAt: v.created_at || new Date().toISOString(),
  }
}

/** List training videos for HO (JWT). Active ones first. */
export async function fetchTrainingVideosFromApi(): Promise<TrainingModuleDto[]> {
  if (!isApiAuthenticated()) return []
  const list = await apiRequest<ApiTrainingVideo[]>('/api/training-videos/')
  return [...list]
    .sort((a, b) => Number(!!b.is_active) - Number(!!a.is_active) || b.id - a.id)
    .map(mapApiTrainingVideo)
}

/** Upload a training video + questions. Latest becomes active. */
export async function uploadTrainingVideoToApi(input: {
  file: File
  questions: string[]
}): Promise<{ module: TrainingModuleDto; warning?: string }> {
  const formData = new FormData()
  formData.append('file', input.file)
  formData.append(
    'questions',
    JSON.stringify(
      input.questions.map((prompt, i) => ({
        id: `q${i + 1}`,
        type: 'verbal',
        question: prompt.trim(),
        description: '',
      })),
    ),
  )

  const res = await apiRequest<{
    ok?: boolean
    video: ApiTrainingVideo
    warning?: string
    transcript_error?: string
  }>('/api/training-videos/', {
    method: 'POST',
    formData,
  })

  return {
    module: mapApiTrainingVideo(res.video),
    warning: res.warning || res.transcript_error,
  }
}

export function baPublicTrainingVideoUrl() {
  return `${apiBase()}/api/ba/training/video/`
}

/** Delete a backend training video by numeric id. */
export async function deleteTrainingVideoFromApi(apiId: number): Promise<void> {
  await apiRequest(`/api/training-videos/${apiId}/`, { method: 'DELETE' })
}
