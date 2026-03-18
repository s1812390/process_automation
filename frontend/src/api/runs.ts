import client from './client'

export interface Run {
  id: number
  script_id: number
  script_name?: string
  status: string
  triggered_by: string
  started_at?: string
  finished_at?: string
  duration_ms?: number
  attempt_number: number
  celery_task_id?: string
  worker_pid?: number
  peak_ram_mb?: number
  avg_cpu_percent?: number
  created_at: string
}

export interface RunListResponse {
  items: Run[]
  total: number
  page: number
  page_size: number
}

export interface LogLine {
  id: number
  run_id: number
  stream: string
  line_text: string
  logged_at: string
}

export const runsApi = {
  list: (params?: { page?: number; page_size?: number; script_id?: number; script_ids?: number[]; status?: string; date_from?: string; date_to?: string }) =>
    client.get<RunListResponse>('/runs', { params }).then(r => r.data),
  getActive: () => client.get<Run[]>('/runs/active').then(r => r.data),
  get: (id: number) => client.get<Run>(`/runs/${id}`).then(r => r.data),
  cancel: (id: number) => client.delete(`/runs/${id}`),
  getLogs: (id: number) => client.get<LogLine[]>(`/runs/${id}/logs`).then(r => r.data),
}
