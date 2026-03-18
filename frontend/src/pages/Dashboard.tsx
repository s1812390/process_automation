import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Code2, Play, CheckCircle, XCircle, AlertTriangle, Cpu, HardDrive, Container, Activity } from 'lucide-react'
import { runsApi } from '../api/runs'
import { scriptsApi } from '../api/scripts'
import { systemApi, SystemStats } from '../api/system'
import { StatusBadge } from '../components/StatusBadge'
import { StatCard } from '../components/StatCard'
import { formatDistanceToNow, subDays, startOfDay, endOfDay } from 'date-fns'
import { parseUTC } from '../utils/dateUtils'
import { useState, useEffect } from 'react'
import { useTimezone } from '../context/TimezoneContext'
import { useToast } from '../components/Toast'

function formatDuration(ms?: number): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function ElapsedTimer({ startedAt }: { startedAt?: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!startedAt) return
    const start = parseUTC(startedAt).getTime()
    const interval = setInterval(() => {
      setElapsed(Date.now() - start)
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  return <span>{formatDuration(elapsed)}</span>
}

function ConfirmKillModal({
  runName,
  onConfirm,
  onCancel,
  isPending,
}: {
  runName: string
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <div className="fixed inset-0 bg-ink-1/30 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-5 border-b border-[rgba(99,112,156,0.1)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-danger-dim flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4.5 h-4.5 text-danger" />
            </div>
            <div>
              <h2 className="text-[15px] font-[800] text-ink-1">Kill Process</h2>
              <p className="text-[12px] text-ink-3 mt-0.5">This will immediately terminate the script</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-[13px] text-ink-2">
            Are you sure you want to kill{' '}
            <span className="font-[700] text-ink-1">"{runName}"</span>?
            This action will be logged.
          </p>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg text-[13px] font-[700] bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:bg-bg active:scale-[0.97] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 px-4 py-2 rounded-lg text-[13px] font-[700] bg-danger text-white hover:bg-[#a01227] active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {isPending ? 'Killing...' : 'Yes, Kill'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProgressBar({ value, max = 100, danger = false, warning = false }: { value: number; max?: number; danger?: boolean; warning?: boolean }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const color = danger ? 'bg-danger' : warning ? 'bg-warning' : 'bg-accent'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-bg overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-mono font-[700] text-ink-2 w-10 text-right">{pct}%</span>
    </div>
  )
}

function SystemHealthSection({ stats }: { stats: SystemStats }) {
  const { host, containers, disk, log_files, runs } = stats

  return (
    <div className="space-y-4">
      {/* Host Resources */}
      <div className="bg-white rounded-xl border border-[rgba(99,112,156,0.12)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-4 h-4 text-accent" />
          <h3 className="text-[13.5px] font-[800] text-ink-1">Host Resources</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11.5px] font-[700] text-ink-2">CPU Usage</span>
                <span className="text-[11px] text-ink-3">{host.cpu_percent}%</span>
              </div>
              <ProgressBar value={host.cpu_percent} danger={host.cpu_percent > 80} warning={host.cpu_percent > 60} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11.5px] font-[700] text-ink-2">RAM Usage</span>
                <span className="text-[11px] text-ink-3">
                  {(host.ram_used_mb / 1024).toFixed(1)} / {(host.ram_total_mb / 1024).toFixed(1)} GB
                </span>
              </div>
              <ProgressBar value={host.ram_percent} danger={host.ram_percent > 80} warning={host.ram_percent > 60} />
            </div>
          </div>
          <div>
            <div className="text-[11.5px] font-[700] text-ink-2 mb-2">Load Average</div>
            <div className="flex gap-4">
              {[
                { label: '1m', value: host.load_avg_1m },
                { label: '5m', value: host.load_avg_5m },
                { label: '15m', value: host.load_avg_15m },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <div className="text-[18px] font-[800] text-ink-1">{value}</div>
                  <div className="text-[10px] text-ink-3 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Containers */}
      {containers !== null && containers !== undefined && (
        <div className="bg-white rounded-xl border border-[rgba(99,112,156,0.12)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Container className="w-4 h-4 text-accent" />
            <h3 className="text-[13.5px] font-[800] text-ink-1">Containers</h3>
          </div>
          {containers.length === 0 ? (
            <p className="text-[12px] text-ink-3">No containers found.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-[rgba(240,242,247,0.6)]">
                  <th className="text-left px-3 py-2 text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3 rounded-l-lg">Name</th>
                  <th className="text-left px-3 py-2 text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3">Status</th>
                  <th className="text-left px-3 py-2 text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3">CPU%</th>
                  <th className="text-left px-3 py-2 text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3 rounded-r-lg">Memory</th>
                </tr>
              </thead>
              <tbody>
                {containers.map((c) => {
                  const memPct = c.mem_limit_mb > 0 ? (c.mem_used_mb / c.mem_limit_mb) * 100 : 0
                  const cpuHigh = c.cpu_percent > 80
                  const memHigh = memPct > 80
                  return (
                    <tr key={c.name} className="border-t border-[rgba(99,112,156,0.06)]">
                      <td className="px-3 py-2.5 text-[12.5px] font-[600] text-ink-1">{c.name}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-[700] px-2 py-0.5 rounded-full ${
                          c.status === 'running' ? 'bg-success-dim text-success' : 'bg-bg text-ink-3'
                        }`}>
                          {c.status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-success pulse-dot" />}
                          {c.status}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-[12px] font-mono font-[700] ${cpuHigh ? 'text-danger' : 'text-ink-2'}`}>
                        {c.cpu_percent.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2.5">
                        <div className={`text-[12px] font-mono font-[700] ${memHigh ? 'text-danger' : 'text-ink-2'}`}>
                          {c.mem_used_mb.toFixed(0)} / {c.mem_limit_mb.toFixed(0)} MB
                        </div>
                        {c.mem_limit_mb > 0 && (
                          <div className="mt-1 w-24">
                            <ProgressBar value={memPct} danger={memHigh} warning={memPct > 60} />
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Disk Usage */}
      <div className="bg-white rounded-xl border border-[rgba(99,112,156,0.12)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="w-4 h-4 text-accent" />
          <h3 className="text-[13.5px] font-[800] text-ink-1">Disk Usage</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-3">
            {disk.tmp && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11.5px] font-[700] text-ink-2">/tmp</span>
                  <span className="text-[11px] text-ink-3">
                    {disk.tmp.used_mb.toFixed(0)} / {disk.tmp.total_mb.toFixed(0)} MB
                  </span>
                </div>
                <ProgressBar value={disk.tmp.used_mb} max={disk.tmp.total_mb} />
              </div>
            )}
            {disk.data && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11.5px] font-[700] text-ink-2">/data</span>
                  <span className="text-[11px] text-ink-3">
                    {disk.data.used_mb.toFixed(0)} / {disk.data.total_mb.toFixed(0)} MB
                  </span>
                </div>
                <ProgressBar value={disk.data.used_mb} max={disk.data.total_mb} />
              </div>
            )}
          </div>
          {log_files && log_files.length > 0 && (
            <div>
              <div className="text-[11.5px] font-[700] text-ink-2 mb-2">Container Log Files</div>
              <div className="space-y-1">
                {log_files.map((f) => (
                  <div key={f.name} className="flex items-center justify-between text-[11px]">
                    <span className="text-ink-2 font-mono">{f.name}</span>
                    <span className="text-ink-3">{f.size_mb != null ? `${f.size_mb.toFixed(1)} MB` : 'N/A'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active Runs & Orphans */}
      <div className="bg-white rounded-xl border border-[rgba(99,112,156,0.12)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-accent" />
          <h3 className="text-[13.5px] font-[800] text-ink-1">Active Runs & Orphans</h3>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="text-[28px] font-[800] text-ink-1">{runs.active}</div>
          <div className="text-[12px] text-ink-3">active run{runs.active !== 1 ? 's' : ''}</div>
        </div>
        {runs.potential_orphans.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 p-3 bg-warning-dim rounded-lg border border-warning/20">
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
              <span className="text-[12px] font-[700] text-warning">
                {runs.potential_orphans.length} potential orphan{runs.potential_orphans.length !== 1 ? 's' : ''} detected
              </span>
            </div>
            <table className="w-full mt-2">
              <thead>
                <tr className="bg-[rgba(240,242,247,0.6)]">
                  <th className="text-left px-3 py-2 text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3">Run ID</th>
                  <th className="text-left px-3 py-2 text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3">Script</th>
                  <th className="text-left px-3 py-2 text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3">Started</th>
                  <th className="text-left px-3 py-2 text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3">Duration</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {runs.potential_orphans.map((orphan) => (
                  <tr key={orphan.run_id} className="border-t border-[rgba(99,112,156,0.06)]">
                    <td className="px-3 py-2.5 text-[12px] font-mono text-ink-3">#{orphan.run_id}</td>
                    <td className="px-3 py-2.5 text-[12.5px] font-[600] text-ink-1">{orphan.script_name}</td>
                    <td className="px-3 py-2.5 text-[11px] text-ink-3">
                      {formatDistanceToNow(parseUTC(orphan.started_at), { addSuffix: true })}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-ink-2">
                      {Math.floor(orphan.duration_sec / 60)}m {orphan.duration_sec % 60}s
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        to={`/runs/${orphan.run_id}`}
                        className="text-[11px] font-[700] text-violet hover:text-violet/70"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const { formatDateTime } = useTimezone()
  const toast = useToast()

  const [killTarget, setKillTarget] = useState<{ id: number; name: string } | null>(null)

  const now = new Date()
  const from = startOfDay(subDays(now, 1))
  const to = endOfDay(now)

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts'],
    queryFn: scriptsApi.list,
    refetchInterval: 5000,
  })

  const { data: activeRuns = [] } = useQuery({
    queryKey: ['runs', 'active'],
    queryFn: runsApi.getActive,
    refetchInterval: 5000,
  })

  const { data: statsRuns } = useQuery({
    queryKey: ['runs', 'dashboard-stats'],
    queryFn: () =>
      runsApi.list({
        page: 1,
        page_size: 500,
        date_from: from.toISOString(),
        date_to: to.toISOString(),
      }),
    refetchInterval: 10000,
  })

  const { data: systemStats, isError: systemError } = useQuery({
    queryKey: ['system', 'stats'],
    queryFn: systemApi.getStats,
    refetchInterval: 10000,
    retry: 1,
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => runsApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      setKillTarget(null)
      toast('Process killed', 'success')
    },
    onError: () => toast('Failed to kill process', 'error'),
  })

  const periodRuns = statsRuns?.items ?? []
  const successCount = periodRuns.filter((r) => r.status === 'success').length
  const failedCount = periodRuns.filter((r) => r.status === 'failed' || r.status === 'timeout').length
  const successRate = periodRuns.length > 0 ? Math.round((successCount / periodRuns.length) * 100) : 0

  const runningRuns = activeRuns.filter((r) => r.status === 'running')
  const pendingRuns = activeRuns.filter((r) => r.status === 'pending')

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Scripts"
          value={scripts.length}
          icon={Code2}
          accentColor="violet"
        />
        <StatCard
          title="Runs Today"
          value={statsRuns?.total ?? 0}
          icon={Play}
          accentColor="accent"
        />
        <StatCard
          title="Success Rate"
          value={`${successRate}%`}
          icon={CheckCircle}
          accentColor="success"
          subtitle={`${successCount} of ${periodRuns.length}`}
        />
        <StatCard
          title="Failed Today"
          value={failedCount}
          icon={XCircle}
          accentColor="warning"
        />
      </div>

      {/* Active runs */}
      {runningRuns.length > 0 && (
        <section>
          <h2 className="text-[14.5px] font-[800] text-ink-1 mb-3">Currently Running</h2>
          <div className="grid gap-3">
            {runningRuns.map((run) => (
              <div
                key={run.id}
                className="bg-white rounded-lg border border-success-mid/30 p-4 flex items-center gap-4"
              >
                <div className="w-2 h-2 rounded-full bg-success pulse-dot" />
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/scripts/${run.script_id}`}
                    className="text-[13.5px] font-[600] text-ink-1 hover:text-accent truncate"
                  >
                    {run.script_name}
                  </Link>
                  <div className="text-[11px] text-ink-3 mt-0.5">
                    PID: {run.worker_pid || '—'} · Attempt #{run.attempt_number}
                  </div>
                </div>
                <div className="text-[13px] font-mono text-ink-2">
                  <ElapsedTimer startedAt={run.started_at} />
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/runs/${run.id}`}
                    className="px-2.5 py-1 rounded text-[11px] font-[700] bg-bg text-ink-2 hover:text-ink-1 border border-[rgba(99,112,156,0.15)]"
                  >
                    View logs
                  </Link>
                  <button
                    onClick={() => setKillTarget({ id: run.id, name: run.script_name || `Run #${run.id}` })}
                    className="px-2.5 py-1 rounded text-[11px] font-[700] bg-danger-dim text-danger border border-danger/15 hover:bg-danger/10 active:scale-[0.97] transition-all"
                  >
                    Kill
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Queue */}
      {pendingRuns.length > 0 && (
        <section>
          <h2 className="text-[14.5px] font-[800] text-ink-1 mb-3">
            Queue
            <span className="ml-2 text-[11px] font-[700] font-mono text-ink-3">
              {pendingRuns.length} waiting
            </span>
          </h2>
          <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[rgba(240,242,247,0.6)]">
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Script</th>
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Priority</th>
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Queued</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {pendingRuns.map((run, i) => (
                  <tr key={run.id} className="border-t border-[rgba(99,112,156,0.06)] hover:bg-accent/[0.025]">
                    <td className="px-4 py-3 text-[13.5px] text-ink-1">{run.script_name}</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-[700] font-mono text-ink-3">P{i + 1}</span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-ink-3" title={formatDateTime(run.created_at)}>
                      {formatDistanceToNow(parseUTC(run.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setKillTarget({ id: run.id, name: run.script_name || `Run #${run.id}` })}
                        className="text-[11px] font-[700] text-danger hover:text-danger/70"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* System Health */}
      <section>
        <h2 className="text-[14.5px] font-[800] text-ink-1 mb-3">System Health</h2>
        {systemError || !systemStats ? (
          <div className="bg-white rounded-xl border border-[rgba(99,112,156,0.12)] px-6 py-8 text-center text-[13px] text-ink-3">
            System stats unavailable
          </div>
        ) : (
          <SystemHealthSection stats={systemStats} />
        )}
      </section>

      {killTarget && (
        <ConfirmKillModal
          runName={killTarget.name}
          onConfirm={() => cancelMutation.mutate(killTarget.id)}
          onCancel={() => setKillTarget(null)}
          isPending={cancelMutation.isPending}
        />
      )}
    </div>
  )
}
