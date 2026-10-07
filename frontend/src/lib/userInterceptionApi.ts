import { apiRequest } from './api'

export type InterceptionStatus = 'Productive' | 'Trialist' | 'Non-productive'

export type SubmitUserInterceptionPayload = {
  token: string
  status: InterceptionStatus
  name: string
  contact?: string
  cityArea?: string
  previousBrand?: string
  previousSku?: string
  currentSku?: string
  feedback?: string
  storeId?: number | null
}

export type UserInterceptionResponse = {
  id: number
  status: InterceptionStatus
  name: string
  baName: string
  storeName: string
  storeId: number | null
  ambassadorId: number
  createdAt: string
}

export async function submitUserInterceptionApi(
  payload: SubmitUserInterceptionPayload,
): Promise<UserInterceptionResponse> {
  return apiRequest<UserInterceptionResponse>('/api/ba/user-interceptions/', {
    method: 'POST',
    auth: false,
    body: {
      token: payload.token,
      status: payload.status,
      name: payload.name,
      contact: payload.contact ?? '',
      city_area: payload.cityArea ?? '',
      previous_brand: payload.previousBrand ?? '',
      previous_sku: payload.previousSku ?? '',
      current_sku: payload.currentSku ?? '',
      feedback: payload.feedback ?? '',
      ...(payload.storeId != null ? { store_id: payload.storeId } : {}),
    },
  })
}
