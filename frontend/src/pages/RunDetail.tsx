import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Square, AlertTriangle } from 'lucide-react'
import { runsApi } from '../api/runs'
import { StatusBadge } from '../components/StatusBadge'
import { LogViewer } from '../components/LogViewer'
import { useTimezone } from '../context/TimezoneContext'
import { useToast } from '../components/Toast'

function formatDuration(ms?: number): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function ConfirmKillModal({
  onConfirm,
  onCancel,
  isPending,
}: {
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
            Are you sure you want to kill this run? The action will be logged.
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

export default function RunDetail() {
  const { id } = useParams<{ id: string }>()
  const runId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { formatDateTime } = useTimezone()
  const toast = useToast()
  const [showKillConfirm, setShowKillConfirm] = useState(false)

  const { data: run, isLoading } = useQuery({
    queryKey: ['runs', runId],
    queryFn: () => runsApi.get(runId),
    refetchInterval: (data) =>
      data?.state.data?.status === 'running' || data?.state.data?.status === 'pending' ? 3000 : false,
  })

  const { data: staticLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['runs', runId, 'logs'],
    queryFn: () => runsApi.getLogs(runId),
    enabled: !!run && run.status !== 'running' && run.status !== 'pending',
  })

  const cancelMutation = useMutation({
    mutationFn: () => runsApi.cancel(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs', runId] })
      setShowKillConfirm(false)
      toast('Process killed', 'success')
    },
    onError: () => toast('Failed to kill process', 'error'),
  })

  if (isLoading || !run) {
    return <div className="p-6 text-ink-3">Loading...</div>
  }

  const isLive = run.status === 'running' || run.status === 'pending'

  const statItems = [
    {
      label: 'Started',
      value: run.started_at ? formatDateTime(run.started_at) : '—',
    },
    {
      label: 'Duration',
      value: formatDuration(run.duration_ms),
    },
    {
      label: 'Worker PID',
      value: run.worker_pid?.toString() || '—',
    },
    {
      label: 'Attempt',
      value: `#${run.attempt_number}`,
    },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              to="/"
              className="text-[12px] text-ink-3 hover:text-ink-2 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Dashboard
            </Link>
            <span className="text-ink-4 text-[10px]">/</span>
            <Link
              to={`/scripts/${run.script_id}?tab=history`}
              className="text-[12px] text-ink-3 hover:text-ink-2 flex items-center gap-1"
            >
              {run.script_name || 'Script'}
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-[18px] font-[800] text-ink-1">Run #{run.id}</h1>
            <StatusBadge status={run.status} />
            <span className="text-[11px] font-mono font-[700] text-ink-3 bg-bg px-1.5 py-0.5 rounded border border-[rgba(99,112,156,0.15)]">
              {run.triggered_by}
            </span>
          </div>
        </div>
        {isLive && (
          <button
            onClick={() => setShowKillConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-[700] bg-danger-dim text-danger border border-danger/15 hover:bg-danger/10 active:scale-[0.97] transition-all"
          >
            <Square className="w-4 h-4" />
            Kill
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {statItems.map((item) => (
          <div
            key={item.label}
            className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] px-4 py-3"
          >
            <div className="text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3 mb-1">
              {item.label}
            </div>
            <div className="text-[15px] font-mono font-[500] text-ink-1">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Log viewer */}
      <LogViewer
        runId={runId}
        isLive={isLive}
        initialLogs={staticLogs || []}
        logsLoading={logsLoading}
      />

      {showKillConfirm && (
        <ConfirmKillModal
          onConfirm={() => cancelMutation.mutate()}
          onCancel={() => setShowKillConfirm(false)}
          isPending={cancelMutation.isPending}
        />
      )}
    </div>
  )
}
