// ERP backend client: token-aware fetch wrapper + typed endpoints.

export type Role = 'admin' | 'inspector' | 'viewer'

export type UserOut = {
  id: string
  email: string
  full_name: string
  role: Role
  is_active: boolean
}

export type LoginResponse = { token: string; user: UserOut }

export type ContractorOut = {
  id: string
  name: string
  abn: string | null
  contact_email: string | null
  phone: string | null
  work_record_count: number
}

export type WorkRecordOut = {
  id: string
  contractor_id: string
  title: string
  work_date: string
  cost: number
  hours_spent: number
  guarantee_months: number
  guarantee_expires: string
  path: [number, number][] | null
  has_invoice: boolean
  notes: string | null
}

export type ActionOut = {
  id: string
  status: 'open' | 'notified' | 'resolved' | 'disputed'
  distance_m: number
  auto_created: boolean
  created_at: string
  resolved_at: string | null
  resolution_notes: string | null
  contractor_id: string
  contractor_name: string
  work_record_id: string
  work_title: string
  work_date: string
  work_cost: number
  guarantee_expires: string
  damage_class: string | null
  damage_confidence: number | null
  image_id: string
  image_lat: number
  image_lng: number
  annotated_image_url: string
  vision_description: string | null
}

export type ReportOut = {
  report_id: string
  is_mock: boolean
  model: string
  content_md: string
  created_at: string
}

const TOKEN_KEY = 'pg_token'
const USER_KEY = 'pg_user'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function getStoredUser(): UserOut | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as UserOut } catch { return null }
}
export function storeAuth(token: string, user: UserOut): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

function base(): string {
  const b = import.meta.env.VITE_API_BASE
  if (!b) throw new Error('VITE_API_BASE is not set')
  return b.replace(/\/$/, '')
}

export async function api<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const headers = new Headers(opts.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (opts.body && typeof opts.body === 'string') headers.set('Content-Type', 'application/json')
  const res = await fetch(`${base()}${path}`, { ...opts, headers })
  if (res.status === 401) {
    clearAuth()
    window.location.hash = '#/login'
    throw new Error('Session expired — please log in again')
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const j = await res.json()
      if (j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch { /* keep status */ }
    throw new Error(detail)
  }
  return (await res.json()) as T
}

// --- auth ---
export const login = (email: string, password: string) =>
  api<LoginResponse>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })

// --- users ---
export const listUsers = () => api<UserOut[]>('/api/v1/users')
export const createUser = (u: { email: string; full_name: string; role: Role; password: string }) =>
  api<UserOut>('/api/v1/users', { method: 'POST', body: JSON.stringify(u) })
export const updateUser = (id: string, patch: Partial<{ full_name: string; role: Role; is_active: boolean; password: string }>) =>
  api<UserOut>(`/api/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

// --- contractors ---
export const listContractors = () => api<ContractorOut[]>('/api/v1/contractors')
export const createContractor = (c: { name: string; abn?: string; contact_email?: string; phone?: string }) =>
  api<ContractorOut>('/api/v1/contractors', { method: 'POST', body: JSON.stringify(c) })
export const listWorkRecords = (contractorId: string) =>
  api<WorkRecordOut[]>(`/api/v1/contractors/${contractorId}/work-records`)
export const createWorkRecord = (contractorId: string, wr: {
  title: string; work_date: string; cost: number; hours_spent: number;
  guarantee_months: number; path: [number, number][] | null; notes?: string
}) =>
  api<WorkRecordOut>(`/api/v1/contractors/${contractorId}/work-records`, {
    method: 'POST', body: JSON.stringify(wr),
  })

export async function uploadInvoice(recordId: string, file: File): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${base()}/api/v1/contractors/work-records/${recordId}/invoice`, {
    method: 'POST', body: form, headers,
  })
  if (!res.ok) throw new Error(`Invoice upload failed: HTTP ${res.status}`)
}

export function invoiceUrl(recordId: string): string {
  return `${base()}/api/v1/contractors/work-records/${recordId}/invoice`
}

export async function downloadInvoice(recordId: string): Promise<void> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(invoiceUrl(recordId), { headers })
  if (!res.ok) throw new Error('No invoice on file')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `invoice_${recordId}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// --- inspections ---
export const createInspection = (payload: {
  job_id: string; start: [number, number]; end: [number, number]; route?: [number, number][] | null
}) => api('/api/v1/inspections', { method: 'POST', body: JSON.stringify(payload) })

export const finishInspection = (id: string, payload: { status: string; captured: number; skipped: number }) =>
  api(`/api/v1/inspections/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })

export const generateReport = (inspectionId: string) =>
  api<ReportOut>(`/api/v1/inspections/${inspectionId}/report`, { method: 'POST' })

// --- actions ---
export const listActions = (status?: string) =>
  api<ActionOut[]>(`/api/v1/actions${status ? `?status=${status}` : ''}`)
export const updateAction = (id: string, patch: { status: string; resolution_notes?: string }) =>
  api(`/api/v1/actions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
