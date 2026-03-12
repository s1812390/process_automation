import client from './client'

export interface Script {
  id: number
  name: string
  description?: string
  script_content: string
  requirements_content?: string
  cron_expression?: string
  timeout_seconds?: number
  priority: number
  max_retries: number
  cpu_cores?: number
  ram_limit_mb?: number
  is_active: boolean
  created_at: string
  updated_at?: string
  last_run_status?: string
  last_run_at?: string
}

export interface ScriptCreate {
  name: string
  description?: string
  script_content: string
  requirements_content?: string
  cron_expression?: string
  timeout_seconds?: number
  priority?: number
  max_retries?: number
  cpu_cores?: number
  ram_limit_mb?: number
  is_active?: boolean
}

export type ScriptUpdate = Partial<ScriptCreate>

export const scriptsApi = {
  list: () => client.get<Script[]>('/scripts').then(r => r.data),
  get: (id: number) => client.get<Script>(`/scripts/${id}`).then(r => r.data),
  create: (data: ScriptCreate) => client.post<Script>('/scripts', data).then(r => r.data),
  update: (id: number, data: ScriptUpdate) => client.put<Script>(`/scripts/${id}`, data).then(r => r.data),
  delete: (id: number) => client.delete(`/scripts/${id}`),
  toggle: (id: number) => client.patch<Script>(`/scripts/${id}/toggle`).then(r => r.data),
  run: (id: number) => client.post<{ run_id: number; task_id: string }>(`/scripts/${id}/run`).then(r => r.data),
  getAlerts: (id: number) => client.get<AlertConfig[]>(`/scripts/${id}/alerts`).then(r => r.data),
  createAlert: (id: number, data: AlertConfigCreate) => client.post<AlertConfig>(`/scripts/${id}/alerts`, data).then(r => r.data),
}

export interface AlertConfig {
  id: number
  script_id: number
  on_failure: boolean
  on_success: boolean
  on_timeout: boolean
  channel: string
  destination: string
}

export interface AlertConfigCreate {
  on_failure: boolean
  on_success: boolean
  on_timeout: boolean
  channel: 'email' | 'telegram'
  destination: string
}

export const alertsApi = {
  delete: (id: number) => client.delete(`/alerts/${id}`),
}
