import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Play, Edit2, Trash2, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react'
import { scriptsApi, Script, ScriptCreate } from '../api/scripts'
import { StatusBadge } from '../components/StatusBadge'
import { ScriptEditor } from '../components/ScriptEditor'
import { CronInput } from '../components/CronInput'
import { formatDistanceToNow } from 'date-fns'
import { clsx } from 'clsx'

function CreateScriptModal({ onClose }: { onClose: () => void }) {
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
  })

  const createMutation = useMutation({
    mutationFn: scriptsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] })
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      ...form,
      cron_expression: form.cron_expression || undefined,
      requirements_content: form.requirements_content || undefined,
      description: form.description || undefined,
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
            <div className="col-span-2">
              <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description"
                className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
              />
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

export default function Scripts() {
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts'],
    queryFn: scriptsApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => scriptsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scripts'] }),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: number) => scriptsApi.toggle(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scripts'] }),
  })

  const runMutation = useMutation({
    mutationFn: (id: number) => scriptsApi.run(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs'] }),
  })

  const handleDelete = (script: Script) => {
    if (confirm(`Delete "${script.name}"? This will also delete all run history.`)) {
      deleteMutation.mutate(script.id)
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[14.5px] font-[800] text-ink-1">All Scripts</h2>
          <p className="text-[12px] text-ink-3 mt-0.5">{scripts.length} scripts total</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-[700] bg-gradient-to-br from-accent to-[#b00e49] text-white shadow-[0_3px_12px_rgba(224,24,92,0.3)] hover:-translate-y-px active:scale-[0.97] transition-all"
        >
          <Plus className="w-4 h-4" />
          New Script
        </button>
      </div>

      <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] overflow-hidden">
        {isLoading ? (
          <div className="px-6 py-10 text-center text-[13px] text-ink-3">Loading...</div>
        ) : scripts.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-bg flex items-center justify-center mx-auto mb-4">
              <Plus className="w-6 h-6 text-ink-3" />
            </div>
            <p className="text-[14px] font-[700] text-ink-2 mb-1">No scripts yet</p>
            <p className="text-[12px] text-ink-3">Create your first script to get started</p>
          </div>
        ) : (
          <table className="w-full">
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
              {scripts.map((script) => (
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
                      <span className="text-[11px] font-mono font-[700] text-ink-2 bg-violet-dim px-2 py-0.5 rounded">
                        {script.cron_expression}
                      </span>
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
                            ? formatDistanceToNow(new Date(script.last_run_at), { addSuffix: true })
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
                        onClick={() => handleDelete(script)}
                        title="Delete"
                        className="p-1.5 rounded-lg text-ink-3 hover:bg-danger-dim hover:text-danger transition-all active:scale-[0.97]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreateScriptModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
