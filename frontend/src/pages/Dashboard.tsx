import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Code2, Play, CheckCircle, XCircle, ChevronLeft, ChevronRight, Calendar, Tag, Search, AlertTriangle } from 'lucide-react'
import { runsApi, Run } from '../api/runs'
import { scriptsApi } from '../api/scripts'
import { StatusBadge } from '../components/StatusBadge'
import { StatCard } from '../components/StatCard'
import { formatDistanceToNow, subDays, startOfDay, endOfDay } from 'date-fns'
import { useState, useEffect, useMemo } from 'react'
import { useTimezone } from '../context/TimezoneContext'
import { useToast } from '../components/Toast'

const PAGE_SIZE = 15

type PeriodOption = '2d' | '5d' | '10d' | 'custom'

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

function getPeriodDates(period: PeriodOption, customFrom: string, customTo: string) {
  const now = new Date()
  if (period === '2d') return { from: startOfDay(subDays(now, 2)), to: endOfDay(now) }
  if (period === '5d') return { from: startOfDay(subDays(now, 5)), to: endOfDay(now) }
  if (period === '10d') return { from: startOfDay(subDays(now, 10)), to: endOfDay(now) }
  // custom
  return {
    from: customFrom ? startOfDay(new Date(customFrom)) : startOfDay(subDays(now, 2)),
    to: customTo ? endOfDay(new Date(customTo)) : endOfDay(now),
  }
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

export default function Dashboard() {
  const queryClient = useQueryClient()
  const { formatDateTime } = useTimezone()
  const toast = useToast()

  const [period, setPeriod] = useState<PeriodOption>('2d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [page, setPage] = useState(1)
  const [selectedRunTag, setSelectedRunTag] = useState<string | null>(null)
  const [runsSearch, setRunsSearch] = useState('')
  const [killTarget, setKillTarget] = useState<{ id: number; name: string } | null>(null)

  const { from, to } = getPeriodDates(period, customFrom, customTo)

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

  const scriptIdsForTag = useMemo(() => {
    if (!selectedRunTag) return undefined
    const ids: number[] = []
    scripts.forEach((s) => { if (s.tag === selectedRunTag) ids.push(s.id) })
    return ids.length > 0 ? ids : [-1] // -1 ensures empty result when no scripts have this tag
  }, [selectedRunTag, scripts])

  const isSearching = runsSearch.trim().length > 0

  // Normal paginated query (used when not searching)
  const { data: recentRuns } = useQuery({
    queryKey: ['runs', 'dashboard', period, customFrom, customTo, page, selectedRunTag],
    queryFn: () =>
      runsApi.list({
        page,
        page_size: PAGE_SIZE,
        date_from: from.toISOString(),
        date_to: to.toISOString(),
        script_ids: scriptIdsForTag,
      }),
    enabled: !isSearching,
    refetchInterval: !isSearching ? 5000 : false,
  })

  // Large fetch for client-side search + pagination
  const { data: searchRuns } = useQuery({
    queryKey: ['runs', 'dashboard-search', period, customFrom, customTo, selectedRunTag],
    queryFn: () =>
      runsApi.list({
        page: 1,
        page_size: 1000,
        date_from: from.toISOString(),
        date_to: to.toISOString(),
        script_ids: scriptIdsForTag,
      }),
    enabled: isSearching,
    refetchInterval: isSearching ? 5000 : false,
  })

  const [searchPage, setSearchPage] = useState(1)
  // Reset search page when query changes
  useMemo(() => { setSearchPage(1) }, [runsSearch, period, customFrom, customTo, selectedRunTag]) // eslint-disable-line

  // Stats: fetch all runs in period for stats calculation (first page large enough)
  const { data: statsRuns } = useQuery({
    queryKey: ['runs', 'dashboard-stats', period, customFrom, customTo],
    queryFn: () =>
      runsApi.list({
        page: 1,
        page_size: 100,
        date_from: from.toISOString(),
        date_to: to.toISOString(),
      }),
    refetchInterval: 5000,
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

  const runMutation = useMutation({
    mutationFn: (scriptId: number) => scriptsApi.run(scriptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    },
  })

  // Tag lookup: script_id → tag
  const scriptTagMap = useMemo(() => {
    const map = new Map<number, string>()
    scripts.forEach((s) => { if (s.tag) map.set(s.id, s.tag) })
    return map
  }, [scripts])

  const uniqueRunTags = useMemo(() => {
    const tags = new Set<string>()
    scripts.forEach((s) => { if (s.tag) tags.add(s.tag) })
    return Array.from(tags).sort()
  }, [scripts])

  const periodRuns = statsRuns?.items ?? []
  const successCount = periodRuns.filter((r) => r.status === 'success').length
  const failedCount = periodRuns.filter((r) => r.status === 'failed' || r.status === 'timeout').length
  const successRate = periodRuns.length > 0 ? Math.round((successCount / periodRuns.length) * 100) : 0

  const runningRuns = activeRuns.filter((r) => r.status === 'running')
  const pendingRuns = activeRuns.filter((r) => r.status === 'pending')

  const allSearchFiltered = useMemo(() => {
    if (!isSearching) return []
    const q = runsSearch.trim().toLowerCase()
    return (searchRuns?.items ?? []).filter((r) =>
      (r.script_name || '').toLowerCase().includes(q)
    )
  }, [isSearching, runsSearch, searchRuns])

  const searchTotalPages = Math.max(1, Math.ceil(allSearchFiltered.length / PAGE_SIZE))

  const recentItems = isSearching
    ? allSearchFiltered.slice((searchPage - 1) * PAGE_SIZE, searchPage * PAGE_SIZE)
    : (recentRuns?.items ?? [])

  const totalPages = isSearching
    ? searchTotalPages
    : (recentRuns ? Math.ceil(recentRuns.total / PAGE_SIZE) : 1)

  const activePage = isSearching ? searchPage : page
  const setActivePage = isSearching
    ? (p: number) => setSearchPage(Math.min(Math.max(1, p), searchTotalPages))
    : (p: number) => setPage(Math.min(Math.max(1, p), totalPages))

  const periodLabel =
    period === '2d' ? 'last 2 days' :
    period === '5d' ? 'last 5 days' :
    period === '10d' ? 'last 10 days' : 'custom period'

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
          title={`Runs (${periodLabel})`}
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
          title="Failed"
          value={failedCount}
          icon={XCircle}
          accentColor="warning"
          subtitle={periodLabel}
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
                      {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
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

      {/* Recent runs */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-[14.5px] font-[800] text-ink-1">Recent Runs</h2>

          {/* Period filter */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-[rgba(99,112,156,0.18)]">
              {(['2d', '5d', '10d'] as PeriodOption[]).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPeriod(p); setPage(1) }}
                  className={`px-3 py-1.5 text-[11.5px] font-[700] transition-colors ${
                    period === p
                      ? 'bg-violet text-white'
                      : 'bg-white text-ink-3 hover:text-ink-1 hover:bg-bg'
                  }`}
                >
                  {p === '2d' ? '2 days' : p === '5d' ? '5 days' : '10 days'}
                </button>
              ))}
              <button
                onClick={() => { setPeriod('custom'); setPage(1) }}
                className={`px-3 py-1.5 text-[11.5px] font-[700] flex items-center gap-1 transition-colors ${
                  period === 'custom'
                    ? 'bg-violet text-white'
                    : 'bg-white text-ink-3 hover:text-ink-1 hover:bg-bg'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Custom
              </button>
            </div>

            {period === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => { setCustomFrom(e.target.value); setPage(1) }}
                  className="text-[12px] px-2 py-1.5 rounded-lg border border-[rgba(99,112,156,0.18)] text-ink-1 bg-white focus:outline-none focus:border-violet/50"
                />
                <span className="text-[11px] text-ink-3">–</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => { setCustomTo(e.target.value); setPage(1) }}
                  className="text-[12px] px-2 py-1.5 rounded-lg border border-[rgba(99,112,156,0.18)] text-ink-1 bg-white focus:outline-none focus:border-violet/50"
                />
              </div>
            )}
          </div>
        </div>

        {/* Tag filter */}
        {uniqueRunTags.length > 0 && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Tag className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
            <button
              onClick={() => { setSelectedRunTag(null); setPage(1) }}
              className={`px-3 py-1 rounded-full text-[11px] font-[700] transition-all ${
                selectedRunTag === null
                  ? 'bg-ink-1 text-white'
                  : 'bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:border-violet hover:text-violet'
              }`}
            >
              All
            </button>
            {uniqueRunTags.map((tag) => (
              <button
                key={tag}
                onClick={() => { setSelectedRunTag(selectedRunTag === tag ? null : tag); setPage(1) }}
                className={`px-3 py-1 rounded-full text-[11px] font-[700] transition-all ${
                  selectedRunTag === tag
                    ? 'bg-violet text-white'
                    : 'bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:border-violet hover:text-violet'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Search within current result set */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
          <input
            type="text"
            value={runsSearch}
            onChange={(e) => setRunsSearch(e.target.value)}
            placeholder="Filter by script name..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[rgba(99,112,156,0.18)] bg-white text-[13px] text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
          />
        </div>

        <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] overflow-hidden">
          {recentItems.length === 0 ? (
            <div className="px-6 py-10 text-center text-[13px] text-ink-3">
              {isSearching ? 'No matching runs.' : 'No runs in this period.'}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-[rgba(240,242,247,0.6)]">
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Script</th>
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Status</th>
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Trigger</th>
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Tag</th>
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Duration</th>
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Time</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {recentItems.map((run) => (
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
                    <td className="px-4 py-3">
                      {scriptTagMap.get(run.script_id) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-[700] bg-violet-dim text-violet">
                          <Tag className="w-2.5 h-2.5" />
                          {scriptTagMap.get(run.script_id)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] font-mono text-ink-2">
                      {formatDuration(run.duration_ms)}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-ink-3" title={formatDateTime(run.created_at)}>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3">
            <span className="text-[12px] text-ink-3">
              {isSearching ? allSearchFiltered.length : (recentRuns?.total ?? 0)} runs · page {activePage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActivePage(activePage - 1)}
                disabled={activePage === 1}
                className="p-1.5 rounded-lg border border-[rgba(99,112,156,0.18)] bg-white text-ink-2 hover:text-ink-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - activePage) <= 1)
                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (arr[idx - 1] as number) < p - 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-1.5 text-[12px] text-ink-3">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setActivePage(p as number)}
                      className={`min-w-[30px] h-[30px] rounded-lg border text-[12px] font-[700] transition-colors ${
                        activePage === p
                          ? 'bg-violet text-white border-violet'
                          : 'bg-white text-ink-2 border-[rgba(99,112,156,0.18)] hover:text-ink-1'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setActivePage(activePage + 1)}
                disabled={activePage === totalPages}
                className="p-1.5 rounded-lg border border-[rgba(99,112,156,0.18)] bg-white text-ink-2 hover:text-ink-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
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
