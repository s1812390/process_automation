import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, Tag, X, Search } from 'lucide-react'
import { runsApi, Run } from '../api/runs'
import { scriptsApi } from '../api/scripts'
import { StatusBadge } from '../components/StatusBadge'
import { formatDistanceToNow, subDays, startOfDay, endOfDay } from 'date-fns'
import { parseUTC } from '../utils/dateUtils'
import { useState, useEffect, useMemo } from 'react'
import { useTimezone } from '../context/TimezoneContext'
import { useToast } from '../components/Toast'
import { clsx } from 'clsx'

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'pending', label: 'Pending' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'timeout', label: 'Timeout' },
  { value: 'cancelled', label: 'Cancelled' },
]

const TRIGGER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'manual', label: 'Manual' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'webhook', label: 'Webhook' },
]

function formatDuration(ms?: number): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
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

export default function Runs() {
  const queryClient = useQueryClient()
  const { formatDateTime } = useTimezone()
  const toast = useToast()

  const now = new Date()
  const defaultFrom = startOfDay(subDays(now, 30)).toISOString().split('T')[0]
  const defaultTo = endOfDay(now).toISOString().split('T')[0]

  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)
  const [statusFilter, setStatusFilter] = useState('')
  const [triggeredByFilter, setTriggeredByFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [scriptSearch, setScriptSearch] = useState('')
  const [page, setPage] = useState(1)
  const [killTarget, setKillTarget] = useState<{ id: number; name: string } | null>(null)

  useEffect(() => { setPage(1) }, [dateFrom, dateTo, statusFilter, triggeredByFilter, tagFilter, scriptSearch])

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts'],
    queryFn: scriptsApi.list,
    refetchInterval: 30000,
  })

  const uniqueTags = useMemo(() => {
    const tags = new Set<string>()
    scripts.forEach((s) => { if (s.tag) tags.add(s.tag) })
    return Array.from(tags).sort()
  }, [scripts])

  const scriptTagMap = useMemo(() => {
    const map = new Map<number, string>()
    scripts.forEach((s) => { if (s.tag) map.set(s.id, s.tag) })
    return map
  }, [scripts])

  const scriptIdsForTag = useMemo(() => {
    if (!tagFilter) return undefined
    const ids: number[] = []
    scripts.forEach((s) => { if (s.tag === tagFilter) ids.push(s.id) })
    return ids.length > 0 ? ids : [-1]
  }, [tagFilter, scripts])

  const queryParams = {
    page: 1,
    page_size: 1000,
    date_from: dateFrom ? startOfDay(new Date(dateFrom)).toISOString() : undefined,
    date_to: dateTo ? endOfDay(new Date(dateTo)).toISOString() : undefined,
    status: statusFilter || undefined,
    script_ids: scriptIdsForTag,
  }

  const { data: runsData, isLoading } = useQuery({
    queryKey: ['runs', 'all', queryParams],
    queryFn: () => runsApi.list(queryParams),
    refetchInterval: 10000,
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

  const allItems = runsData?.items ?? []

  const filteredItems = useMemo(() => {
    let items = allItems
    if (triggeredByFilter) {
      items = items.filter((r) => r.triggered_by === triggeredByFilter)
    }
    if (scriptSearch.trim()) {
      const q = scriptSearch.trim().toLowerCase()
      items = items.filter((r) => (r.script_name || '').toLowerCase().includes(q))
    }
    return items
  }, [allItems, triggeredByFilter, scriptSearch])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filteredItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const hasFilters = statusFilter || triggeredByFilter || tagFilter || scriptSearch ||
    dateFrom !== defaultFrom || dateTo !== defaultTo

  function clearFilters() {
    setDateFrom(defaultFrom)
    setDateTo(defaultTo)
    setStatusFilter('')
    setTriggeredByFilter('')
    setTagFilter('')
    setScriptSearch('')
    setPage(1)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-[800] text-ink-1">All Runs</h1>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-[700] text-ink-3 border border-[rgba(99,112,156,0.2)] hover:text-ink-1 hover:border-violet/30 transition-all"
          >
            <X className="w-3.5 h-3.5" />
            Clear filters
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-[rgba(99,112,156,0.12)] p-4">
        <div className="flex flex-wrap gap-4 items-end">

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-[12px] px-2.5 py-[7px] rounded-lg border border-[rgba(99,112,156,0.18)] text-ink-1 bg-white focus:outline-none focus:border-violet/50 focus:ring-1 focus:ring-violet/10"
              />
            </div>
            <span className="text-[11px] text-ink-3 mt-5">–</span>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-[12px] px-2.5 py-[7px] rounded-lg border border-[rgba(99,112,156,0.18)] text-ink-1 bg-white focus:outline-none focus:border-violet/50 focus:ring-1 focus:ring-violet/10"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="h-8 w-px bg-[rgba(99,112,156,0.12)] self-end mb-0.5" />

          {/* Status — segmented buttons */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3">Status</label>
            <div className="flex rounded-lg border border-[rgba(99,112,156,0.18)] overflow-hidden">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={clsx(
                    'px-2.5 py-[7px] text-[11.5px] font-[700] transition-colors whitespace-nowrap',
                    statusFilter === opt.value
                      ? 'bg-violet text-white'
                      : 'bg-white text-ink-3 hover:text-ink-1 hover:bg-bg'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="h-8 w-px bg-[rgba(99,112,156,0.12)] self-end mb-0.5" />

          {/* Triggered by — segmented buttons */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3">Triggered By</label>
            <div className="flex rounded-lg border border-[rgba(99,112,156,0.18)] overflow-hidden">
              {TRIGGER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTriggeredByFilter(opt.value)}
                  className={clsx(
                    'px-3 py-[7px] text-[11.5px] font-[700] transition-colors',
                    triggeredByFilter === opt.value
                      ? 'bg-violet text-white'
                      : 'bg-white text-ink-3 hover:text-ink-1 hover:bg-bg'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Script name search */}
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3">Script</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
              <input
                type="text"
                value={scriptSearch}
                onChange={(e) => setScriptSearch(e.target.value)}
                placeholder="Filter by name..."
                className="w-full pl-8 pr-3 py-[7px] text-[12px] rounded-lg border border-[rgba(99,112,156,0.18)] text-ink-1 bg-white focus:outline-none focus:border-violet/50 focus:ring-1 focus:ring-violet/10 placeholder:text-ink-3"
              />
            </div>
          </div>

        </div>
      </div>

      {/* Tag pills */}
      {uniqueTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
          <button
            onClick={() => setTagFilter('')}
            className={clsx(
              'px-3 py-1 rounded-full text-[11px] font-[700] transition-all',
              tagFilter === ''
                ? 'bg-ink-1 text-white'
                : 'bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:border-violet hover:text-violet'
            )}
          >
            All
          </button>
          {uniqueTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
              className={clsx(
                'px-3 py-1 rounded-full text-[11px] font-[700] transition-all',
                tagFilter === tag
                  ? 'bg-violet text-white'
                  : 'bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:border-violet hover:text-violet'
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[rgba(99,112,156,0.12)] overflow-hidden">
        {isLoading ? (
          <div className="px-6 py-10 text-center text-[13px] text-ink-3">Loading...</div>
        ) : pageItems.length === 0 ? (
          <div className="px-6 py-10 text-center text-[13px] text-ink-3">No runs found.</div>
        ) : (
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[13%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead>
              <tr className="bg-[rgba(240,242,247,0.6)]">
                <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Script</th>
                <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Tag</th>
                <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Status</th>
                <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Trigger</th>
                <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Started</th>
                <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Duration</th>
                <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Peak RAM</th>
                <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Avg CPU</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((run) => (
                <tr
                  key={run.id}
                  className="border-t border-[rgba(99,112,156,0.06)] hover:bg-accent/[0.025]"
                >
                  <td className="px-4 py-3 min-w-0">
                    <Link
                      to={`/scripts/${run.script_id}`}
                      className="block text-[13.5px] font-[600] text-ink-1 hover:text-accent truncate"
                      title={run.script_name}
                    >
                      {run.script_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {scriptTagMap.get(run.script_id) ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-[700] bg-violet-dim text-violet truncate max-w-full">
                        <Tag className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="truncate">{scriptTagMap.get(run.script_id)}</span>
                      </span>
                    ) : (
                      <span className="text-[12px] text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-mono font-[700] text-ink-3 bg-bg px-1.5 py-0.5 rounded">
                      {run.triggered_by}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-ink-3" title={run.started_at ? formatDateTime(run.started_at) : undefined}>
                    {run.started_at
                      ? formatDistanceToNow(parseUTC(run.started_at), { addSuffix: true })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-mono text-ink-2">
                    {formatDuration(run.duration_ms)}
                  </td>
                  <td className="px-4 py-3 text-[12px] font-mono text-ink-2">
                    {run.peak_ram_mb != null ? `${run.peak_ram_mb} MB` : '—'}
                  </td>
                  <td className="px-4 py-3 text-[12px] font-mono text-ink-2">
                    {run.avg_cpu_percent != null ? `${run.avg_cpu_percent}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <Link
                        to={`/runs/${run.id}`}
                        className="text-[11px] font-[700] text-violet hover:text-violet/70"
                      >
                        Logs
                      </Link>
                      {(run.status === 'running' || run.status === 'pending') && (
                        <button
                          onClick={() => setKillTarget({ id: run.id, name: run.script_name || `Run #${run.id}` })}
                          className="text-[11px] font-[700] text-danger hover:text-danger/70"
                        >
                          Kill
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-ink-3">
            {filteredItems.length} runs · page {safePage} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
              className="p-1.5 rounded-lg border border-[rgba(99,112,156,0.18)] bg-white text-ink-2 hover:text-ink-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                if (idx > 0 && (arr[idx - 1] as number) < p - 1) acc.push('...')
                acc.push(p)
                return acc
              }, [])
              .map((p, idx) =>
                p === '...' ? (
                  <span key={`e-${idx}`} className="px-1.5 text-[12px] text-ink-3">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={clsx(
                      'min-w-[30px] h-[30px] rounded-lg border text-[12px] font-[700] transition-colors',
                      safePage === p
                        ? 'bg-violet text-white border-violet'
                        : 'bg-white text-ink-2 border-[rgba(99,112,156,0.18)] hover:text-ink-1'
                    )}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage === totalPages}
              className="p-1.5 rounded-lg border border-[rgba(99,112,156,0.18)] bg-white text-ink-2 hover:text-ink-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
