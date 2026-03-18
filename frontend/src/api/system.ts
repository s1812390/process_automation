import client from './client'

export interface HostMetrics {
  cpu_percent: number
  ram_total_mb: number
  ram_used_mb: number
  ram_free_mb: number
  ram_percent: number
  load_avg_1m: number
  load_avg_5m: number
  load_avg_15m: number
}

export interface ContainerMetrics {
  name: string
  status: string
  cpu_percent: number
  mem_used_mb: number
  mem_limit_mb: number
}

export interface DiskPartition {
  used_mb: number
  total_mb: number
}

export interface LogFileInfo {
  name: string
  size_mb: number | null
}

export interface OrphanRun {
  run_id: number
  script_name: string
  started_at: string
  duration_sec: number
}

export interface RunsStats {
  active: number
  potential_orphans: OrphanRun[]
}

export interface SystemStats {
  host: HostMetrics
  containers: ContainerMetrics[] | null
  disk: { tmp: DiskPartition | null; data: DiskPartition | null }
  log_files: LogFileInfo[] | null
  runs: RunsStats
}

export const systemApi = {
  getStats: () => client.get<SystemStats>('/system/stats').then(r => r.data),
}
