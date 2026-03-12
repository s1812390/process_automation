import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Code2, Play, CheckCircle, XCircle, Loader2, Square, Clock } from 'lucide-react'
import { runsApi, Run } from '../api/runs'
import { scriptsApi } from '../api/scripts'
import { StatusBadge } from '../components/StatusBadge'
import { StatCard } from '../components/StatCard'
import { formatDistanceToNow, format } from 'date-fns'

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
    const start = new Date(startedAt).getTime()
    const interval = setInterval(() => {
      setElapsed(Date.now() - start)
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  return <span>{formatDuration(elapsed)}</span>
}

import { useState, useEffect } from 'react'

export default function Dashboard() {
  const queryClient = useQueryClient()

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

  const { data: recentRuns } = useQuery({
    queryKey: ['runs', { page: 1, page_size: 20 }],
    queryFn: () => runsApi.list({ page: 1, page_size: 20 }),
    refetchInterval: 5000,
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => runsApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    },
  })

  const runMutation = useMutation({
    mutationFn: (scriptId: number) => scriptsApi.run(scriptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    },
  })

  const todayRuns = recentRuns?.items.filter((r) => {
    const d = new Date(r.created_at)
    const now = new Date()
    return d.toDateString() === now.toDateString()
  }) ?? []

  const successCount = todayRuns.filter((r) => r.status === 'success').length
  const failedCount = todayRuns.filter((r) => r.status === 'failed' || r.status === 'timeout').length
  const successRate = todayRuns.length > 0 ? Math.round((successCount / todayRuns.length) * 100) : 0

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
          value={todayRuns.length}
          icon={Play}
          accentColor="accent"
        />
        <StatCard
          title="Success Rate"
          value={`${successRate}%`}
          icon={CheckCircle}
          accentColor="success"
          subtitle={`${successCount} of ${todayRuns.length} today`}
        />
        <StatCard
          title="Failed"
          value={failedCount}
          icon={XCircle}
          accentColor="warning"
          subtitle="today"
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
                    onClick={() => cancelMutation.mutate(run.id)}
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
                    <td className="px-4 py-3 text-[12px] text-ink-3">
                      {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => cancelMutation.mutate(run.id)}
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

      {/* Recent runs */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14.5px] font-[800] text-ink-1">Recent Runs</h2>
          <Link to="/scripts" className="text-[12px] text-violet font-[600] hover:text-violet/70">
            View all scripts →
          </Link>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] overflow-hidden">
          {recentRuns?.items.length === 0 ? (
            <div className="px-6 py-10 text-center text-[13px] text-ink-3">
              No runs yet. Go to Scripts to run your first script.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-[rgba(240,242,247,0.6)]">
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Script</th>
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Status</th>
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Trigger</th>
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Duration</th>
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Time</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {recentRuns?.items.map((run) => (
                  <tr key={run.id} className="border-t border-[rgba(99,112,156,0.06)] hover:bg-accent/[0.025]">
                    <td className="px-4 py-3">
                      <Link to={`/scripts/${run.script_id}`} className="text-[13.5px] font-[600] text-ink-1 hover:text-accent">
                        {run.script_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-mono font-[700] text-ink-3 bg-bg px-1.5 py-0.5 rounded">
                        {run.triggered_by}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-mono text-ink-2">
                      {formatDuration(run.duration_ms)}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-ink-3">
                      {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/runs/${run.id}`}
                        className="text-[11px] font-[700] text-violet hover:text-violet/70"
                      >
                        Logs
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
