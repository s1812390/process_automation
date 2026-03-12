import client from './client'

export interface Settings {
  max_concurrent_workers: number
  default_timeout_seconds: number
  default_max_retries: number
  default_cpu_cores?: number
  default_ram_limit_mb?: number
}

export const settingsApi = {
  get: () => client.get<Settings>('/settings').then(r => r.data),
  update: (data: Partial<Settings>) => client.put<Settings>('/settings', data).then(r => r.data),
}
