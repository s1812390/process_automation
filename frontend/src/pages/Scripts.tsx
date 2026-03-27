import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Play, Edit2, Trash2, ToggleLeft, ToggleRight, AlertCircle, Tag, AlertTriangle, Search, Calculator } from 'lucide-react'
import { scriptsApi, Script, ScriptCreate } from '../api/scripts'
import { environmentsApi } from '../api/environments'
import { StatusBadge } from '../components/StatusBadge'
import { ScriptEditor } from '../components/ScriptEditor'
import { CronInput } from '../components/CronInput'
import { useToast } from '../components/Toast'
import { formatDistanceToNow } from 'date-fns'
import { parseUTC } from '../utils/dateUtils'
import { clsx } from 'clsx'
import { getNextCronRun, describeCron } from '../utils/cronUtils'
import { useTimezone } from '../context/TimezoneContext'

function ConfirmDeleteModal({
  script,
  onConfirm,
  onCancel,
  isPending,
}: {
  script: Script
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
              <h2 className="text-[15px] font-[800] text-ink-1">Delete Script</h2>
              <p className="text-[12px] text-ink-3 mt-0.5">This action cannot be undone</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-[13px] text-ink-2">
            Are you sure you want to delete{' '}
            <span className="font-[700] text-ink-1">"{script.name}"</span>?
            All run history will also be deleted.
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
            {isPending ? 'Deleting...' : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateScriptModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ScriptCreate>({
    name: '',
    description: '',
    script_content: '# Your Python script here\nprint("Hello, World!")\n',
    requirements_content: '',
    cron_expression: '',
    priority: 3,
    max_retries: 0,
    is_active: true,
    tag: '',
    python_env_id: null,
  })

  const { data: environments = [] } = useQuery({
    queryKey: ['environments'],
    queryFn: environmentsApi.list,
  })

  const createMutation = useMutation({
    mutationFn: scriptsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] })
      onCreated()
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      ...form,
      cron_expression: form.cron_expression || undefined,
      requirements_content: form.python_env_id ? undefined : (form.requirements_content || undefined),
      description: form.description || undefined,
      tag: form.tag?.trim() || undefined,
    }
    createMutation.mutate(data)
  }

  return (
    <div className="fixed inset-0 bg-ink-1/30 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[rgba(99,112,156,0.1)] bg-gradient-to-br from-violet-dim to-accent-dim/50 rounded-t-xl">
          <h2 className="text-[16px] font-[800] text-ink-1">New Script</h2>
          <p className="text-[12px] text-ink-3 mt-1">Create a new Python script to schedule or run manually</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My Script"
                required
                className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
              />
            </div>
            <div>
              <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description"
                className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
              />
            </div>
            <div>
              <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Tag</label>
              <input
                value={form.tag}
                onChange={(e) => setForm({ ...form, tag: e.target.value })}
                placeholder="e.g. ETL, Reports, Alerts"
                className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Python Environment</label>
              <select
                value={form.python_env_id ?? ''}
                onChange={(e) => setForm({ ...form, python_env_id: e.target.value ? Number(e.target.value) : null })}
                className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
              >
                <option value="">System Python (use requirements.txt)</option>
                {environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name} {env.python_version ? `(Python ${env.python_version})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-ink-3 mt-1">Select a pre-configured venv or leave empty to use requirements.txt</p>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Script *</label>
            <ScriptEditor
              value={form.script_content}
              onChange={(v) => setForm({ ...form, script_content: v })}
              height="200px"
            />
          </div>

          <div>
            <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Schedule (cron)</label>
            <CronInput
              value={form.cron_expression || ''}
              onChange={(v) => setForm({ ...form, cron_expression: v })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Priority (1–5)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: +e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
              />
            </div>
            <div>
              <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Max Retries</label>
              <input
                type="number"
                min={0}
                value={form.max_retries}
                onChange={(e) => setForm({ ...form, max_retries: +e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
              />
            </div>
          </div>

          {createMutation.isError && (
            <div className="flex items-center gap-2 p-3 bg-danger-dim rounded-lg text-[12px] text-danger">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Failed to create script. Please check all fields.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-[13px] font-[700] bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:bg-bg active:scale-[0.97] transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 px-4 py-2 rounded-lg text-[13px] font-[700] bg-ink-1 text-white hover:bg-[#1e2535] hover:-translate-y-px active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Script'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ScriptTableRows({
  scripts,
  toggleMutation,
  runMutation,
  onDelete,
  formatDateTime,
  nextRunsMap,
  onCronClick,
}: {
  scripts: Script[]
  toggleMutation: { mutate: (id: number) => void; isPending: boolean }
  runMutation: { mutate: (id: number) => void; isPending: boolean }
  onDelete: (script: Script) => void
  formatDateTime: (d: Date | string) => string
  nextRunsMap: Record<number, Date | null>
  onCronClick: (script: Script) => void
}) {
  return (
    <>
      {scripts.map((script) => {
        const nextRun = nextRunsMap[script.id]
        const hasNextRun = script.id in nextRunsMap
        return (
        <tr key={script.id} className="border-t border-[rgba(99,112,156,0.06)] hover:bg-accent/[0.025]">
          <td className="px-4 py-3">
            <Link
              to={`/scripts/${script.id}`}
              className="text-[13.5px] font-[600] text-ink-1 hover:text-accent"
            >
              {script.name}
            </Link>
            {script.description && (
              <div className="text-[11px] text-ink-3 mt-0.5 truncate max-w-xs">{script.description}</div>
            )}
          </td>
          <td className="px-4 py-3">
            {script.cron_expression ? (
              <div>
                <button
                  onClick={() => onCronClick(script)}
                  title="Click to calculate next run"
                  className="text-[11px] font-mono font-[700] text-ink-2 bg-violet-dim px-2 py-0.5 rounded hover:bg-violet/20 transition-colors cursor-pointer"
                >
                  {describeCron(script.cron_expression)}
                </button>
                {hasNextRun && (
                  <div className="text-[10.5px] text-ink-3 mt-1">
                    {nextRun ? `Next: ${formatDateTime(nextRun)}` : 'No upcoming run'}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-[11px] text-ink-3">Manual</span>
            )}
          </td>
          <td className="px-4 py-3">
            <span className="text-[11px] font-[700] font-mono text-ink-3">P{script.priority}</span>
          </td>
          <td className="px-4 py-3">
            {script.last_run_status ? (
              <div className="flex items-center gap-2">
                <StatusBadge status={script.last_run_status} />
                <span className="text-[11px] text-ink-3">
                  {script.last_run_at
                    ? formatDistanceToNow(parseUTC(script.last_run_at), { addSuffix: true })
                    : ''}
                </span>
              </div>
            ) : (
              <span className="text-[12px] text-ink-3">Never</span>
            )}
          </td>
          <td className="px-4 py-3">
            <button
              onClick={() => toggleMutation.mutate(script.id)}
              className={clsx(
                'flex items-center gap-1.5 text-[11px] font-[700] transition-colors',
                script.is_active ? 'text-success' : 'text-ink-3'
              )}
            >
              {script.is_active ? (
                <ToggleRight className="w-5 h-5" />
              ) : (
                <ToggleLeft className="w-5 h-5" />
              )}
              {script.is_active ? 'Active' : 'Inactive'}
            </button>
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-1 justify-end">
              <button
                onClick={() => runMutation.mutate(script.id)}
                disabled={runMutation.isPending}
                title="Run now"
                className="p-1.5 rounded-lg text-success hover:bg-success-dim active:scale-[0.97] transition-all"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
              <Link
                to={`/scripts/${script.id}`}
                className="p-1.5 rounded-lg text-ink-3 hover:bg-bg hover:text-ink-2 transition-all"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => onDelete(script)}
                title="Delete"
                className="p-1.5 rounded-lg text-ink-3 hover:bg-danger-dim hover:text-danger transition-all active:scale-[0.97]"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
        </tr>
        )
      })}
    </>
  )
}

function ScriptTable({
  scripts,
  toggleMutation,
  runMutation,
  onDelete,
  formatDateTime,
  nextRunsMap,
  onCronClick,
}: {
  scripts: Script[]
  toggleMutation: { mutate: (id: number) => void; isPending: boolean }
  runMutation: { mutate: (id: number) => void; isPending: boolean }
  onDelete: (script: Script) => void
  formatDateTime: (d: Date | string) => string
  nextRunsMap: Record<number, Date | null>
  onCronClick: (script: Script) => void
}) {
  return (
    <table className="w-full" style={{ tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: '27%' }} />
        <col style={{ width: '20%' }} />
        <col style={{ width: '8%' }} />
        <col style={{ width: '21%' }} />
        <col style={{ width: '16%' }} />
        <col style={{ width: '8%' }} />
      </colgroup>
      <thead>
        <tr className="bg-[rgba(240,242,247,0.6)]">
          <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Name</th>
          <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Schedule</th>
          <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Priority</th>
          <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Last Run</th>
          <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Active</th>
          <th className="px-4 py-2.5" />
        </tr>
      </thead>
      <tbody>
        <ScriptTableRows
          scripts={scripts}
          toggleMutation={toggleMutation}
          runMutation={runMutation}
          onDelete={onDelete}
          formatDateTime={formatDateTime}
          nextRunsMap={nextRunsMap}
          onCronClick={onCronClick}
        />
      </tbody>
    </table>
  )
}

export default function Scripts() {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [scriptToDelete, setScriptToDelete] = useState<Script | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [nextRunsMap, setNextRunsMap] = useState<Record<number, Date | null>>({})
  const [isCalculating, setIsCalculating] = useState(false)
  const queryClient = useQueryClient()
  const toast = useToast()
  const { timezone, formatDateTime } = useTimezone()

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts'],
    queryFn: scriptsApi.list,
  })

  // Toggle next run for a single script on cron badge click
  const handleCronClick = (script: Script) => {
    if (!script.cron_expression || !script.is_active) return
    setNextRunsMap((prev) => {
      if (script.id in prev) {
        const next = { ...prev }
        delete next[script.id]
        return next
      }
      return { ...prev, [script.id]: getNextCronRun(script.cron_expression!, timezone) }
    })
  }

  // Calculate next run for all scheduled+active scripts at once
  const handleCalculateAll = () => {
    setIsCalculating(true)
    setTimeout(() => {
      const map: Record<number, Date | null> = {}
      for (const s of scripts) {
        if (s.cron_expression && s.is_active) {
          map[s.id] = getNextCronRun(s.cron_expression, timezone)
        }
      }
      setNextRunsMap(map)
      setIsCalculating(false)
    }, 0)
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => scriptsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] })
      setScriptToDelete(null)
      toast('Script deleted successfully')
    },
    onError: () => toast('Failed to delete script', 'error'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: number) => scriptsApi.toggle(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scripts'] }),
  })

  const runMutation = useMutation({
    mutationFn: (id: number) => scriptsApi.run(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      toast('Script started successfully', 'success')
    },
    onError: () => toast('Failed to start script', 'error'),
  })

  const handleDelete = (script: Script) => {
    setScriptToDelete(script)
  }

  // Collect unique tags sorted alphabetically
  const uniqueTags = useMemo(() => {
    const tags = new Set<string>()
    scripts.forEach((s) => { if (s.tag) tags.add(s.tag) })
    return Array.from(tags).sort()
  }, [scripts])

  // Filter by search query
  const filteredScripts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return scripts
    return scripts.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
    )
  }, [scripts, searchQuery])

  // Group scripts: tagged groups first (alpha), untagged last
  const groups = useMemo(() => {
    const source = selectedTag
      ? filteredScripts.filter((s) => s.tag === selectedTag)
      : filteredScripts

    if (selectedTag) {
      return [{ tag: selectedTag, items: source }]
    }
    const tagged: Record<string, Script[]> = {}
    const untagged: Script[] = []
    for (const s of source) {
      if (s.tag) {
        if (!tagged[s.tag]) tagged[s.tag] = []
        tagged[s.tag].push(s)
      } else {
        untagged.push(s)
      }
    }
    const result: { tag: string | null; items: Script[] }[] = Object.keys(tagged)
      .sort()
      .map((tag) => ({ tag, items: tagged[tag] }))
    if (untagged.length > 0) result.push({ tag: null, items: untagged })
    return result
  }, [filteredScripts, selectedTag])

  const hasMultipleGroups = !selectedTag && groups.length > 1
  const hasTags = uniqueTags.length > 0

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[14.5px] font-[800] text-ink-1">All Scripts</h2>
          <p className="text-[12px] text-ink-3 mt-0.5">{scripts.length} scripts total</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCalculateAll}
            disabled={isCalculating || scripts.length === 0}
            title="Calculate next run time for all scheduled scripts"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-[700] bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:border-violet hover:text-violet active:scale-[0.97] transition-all disabled:opacity-40"
          >
            <Calculator className="w-4 h-4" />
            {isCalculating ? 'Calculating...' : 'Calculate Next Runs'}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-[700] bg-gradient-to-br from-accent to-[#b00e49] text-white shadow-[0_3px_12px_rgba(224,24,92,0.3)] hover:-translate-y-px active:scale-[0.97] transition-all"
          >
            <Plus className="w-4 h-4" />
            New Script
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or description..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
        />
      </div>

      {/* Tag filter bar */}
      {hasTags && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Tag className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
          <button
            onClick={() => setSelectedTag(null)}
            className={clsx(
              'px-3 py-1 rounded-full text-[11px] font-[700] transition-all',
              selectedTag === null
                ? 'bg-ink-1 text-white'
                : 'bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:border-violet hover:text-violet'
            )}
          >
            All
          </button>
          {uniqueTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={clsx(
                'px-3 py-1 rounded-full text-[11px] font-[700] transition-all',
                selectedTag === tag
                  ? 'bg-violet text-white'
                  : 'bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:border-violet hover:text-violet'
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] px-6 py-10 text-center text-[13px] text-ink-3">
          Loading...
        </div>
      ) : scripts.length === 0 ? (
        <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-bg flex items-center justify-center mx-auto mb-4">
            <Plus className="w-6 h-6 text-ink-3" />
          </div>
          <p className="text-[14px] font-[700] text-ink-2 mb-1">No scripts yet</p>
          <p className="text-[12px] text-ink-3">Create your first script to get started</p>
        </div>
      ) : groups.every((g) => g.items.length === 0) ? (
        <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] px-6 py-10 text-center text-[13px] text-ink-3">
          No scripts in this tag.
        </div>
      ) : hasMultipleGroups ? (
        /* Grouped view */
        <div className="space-y-5">
          {groups.map(({ tag, items }) => (
            <div key={tag ?? '__untagged__'}>
              {/* Section header */}
              <div className="flex items-center gap-2 mb-2">
                <span className={clsx(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-[700]',
                  tag
                    ? 'bg-violet-dim text-violet'
                    : 'bg-[rgba(240,242,247,0.8)] text-ink-3'
                )}>
                  <Tag className="w-3 h-3" />
                  {tag ?? 'Untagged'}
                </span>
                <span className="text-[11px] text-ink-3">{items.length} script{items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] overflow-hidden">
                <ScriptTable
                  scripts={items}
                  toggleMutation={toggleMutation}
                  runMutation={runMutation}
                  onDelete={handleDelete}
                  formatDateTime={formatDateTime}
                  nextRunsMap={nextRunsMap}
                  onCronClick={handleCronClick}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Flat view (single group or all untagged) */
        <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] overflow-hidden">
          <ScriptTable
            scripts={groups.flatMap((g) => g.items)}
            toggleMutation={toggleMutation}
            runMutation={runMutation}
            onDelete={handleDelete}
            formatDateTime={formatDateTime}
            nextRunsMap={nextRunsMap}
            onCronClick={handleCronClick}
          />
        </div>
      )}

      {showCreate && (
        <CreateScriptModal
          onClose={() => setShowCreate(false)}
          onCreated={() => toast('Script created successfully')}
        />
      )}

      {scriptToDelete && (
        <ConfirmDeleteModal
          script={scriptToDelete}
          onConfirm={() => deleteMutation.mutate(scriptToDelete.id)}
          onCancel={() => setScriptToDelete(null)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
