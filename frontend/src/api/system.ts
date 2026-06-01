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

export interface FastStats {
  host: HostMetrics
  disk: { tmp: DiskPartition | null; data: DiskPartition | null }
  log_files: LogFileInfo[] | null
  runs: RunsStats
}

export interface ContainerStatsResponse {
  containers: ContainerMetrics[] | null
}

export interface ContainerLogsResponse {
  container: string
  lines: string[]
}

export interface BeatTask {
  script_id: number
  name: string
  cron: string
  last_run_at: string | null
  next_run_estimate: string | null
  total_run_count: number
}

export interface BeatDbScript {
  script_id: number
  name: string
  cron: string
}

export interface BeatStatus {
  beat_alive: boolean
  last_heartbeat: string | null
  heartbeat_age_sec: number | null
  in_sync: boolean
  snapshot_updated_at: string | null
  timezone: string | null
  beat_count: number
  db_count: number
  scheduled: BeatTask[]
  db_expected: BeatDbScript[]
  missing_in_beat: BeatDbScript[]
  stale_in_beat: BeatTask[]
}

export const systemApi = {
  getStats: () => client.get<SystemStats>('/system/stats').then(r => r.data),
  getFastStats: () => client.get<FastStats>('/system/fast-stats').then(r => r.data),
  getContainerStats: () => client.get<ContainerStatsResponse>('/system/container-stats').then(r => r.data),
  getContainerLogs: (name: string, tail = 200) =>
    client.get<ContainerLogsResponse>(`/system/container-logs/${encodeURIComponent(name)}`, { params: { tail } }).then(r => r.data),
  getBeatStatus: () => client.get<BeatStatus>('/system/beat-status').then(r => r.data),
}
