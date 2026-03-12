import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { variablesApi, GlobalVar } from '../api/variables'

export default function VariablesPage() {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const { data: vars = [], isLoading } = useQuery({
    queryKey: ['variables'],
    queryFn: variablesApi.list,
  })

  const createMutation = useMutation({
    mutationFn: variablesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variables'] })
      setShowCreate(false)
      setNewKey('')
      setNewValue('')
      setNewDesc('')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { value: string; description?: string } }) =>
      variablesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variables'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: variablesApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['variables'] }),
  })

  const startEdit = (v: GlobalVar) => {
    setEditingId(v.id)
    setEditValue(v.value)
    setEditDesc(v.description || '')
  }

  const saveEdit = (id: number) => {
    updateMutation.mutate({ id, data: { value: editValue, description: editDesc || undefined } })
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[18px] font-[800] text-ink-1">Global Variables</h1>
          <p className="text-[12px] text-ink-3 mt-0.5">
            Injected as environment variables into every script run.
            Access via <code className="font-mono bg-bg px-1 rounded">os.environ['KEY']</code>
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-[700] bg-gradient-to-br from-accent to-[#b00e49] text-white shadow-[0_3px_12px_rgba(224,24,92,0.3)] hover:-translate-y-px active:scale-[0.97] transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Variable
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] p-5 mb-4 space-y-4">
          <h3 className="text-[13px] font-[700] text-ink-1">New Variable</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-[700] text-ink-2 mb-1">Key</label>
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                placeholder="MY_API_KEY"
                className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] font-mono text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
              />
            </div>
            <div>
              <label className="block text-[11px] font-[700] text-ink-2 mb-1">Value</label>
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="secret_value"
                className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
              />
            </div>
            <div>
              <label className="block text-[11px] font-[700] text-ink-2 mb-1">Description (optional)</label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="What this is used for"
                className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 rounded-lg text-[13px] font-[700] text-ink-2 border border-[rgba(99,112,156,0.2)] hover:bg-bg active:scale-[0.97] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate({ key: newKey, value: newValue, description: newDesc || undefined })}
              disabled={!newKey || !newValue || createMutation.isPending}
              className="px-4 py-1.5 rounded-lg text-[13px] font-[700] bg-ink-1 text-white hover:bg-[#1e2535] active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {createMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-ink-3 text-[13px]">Loading...</div>
        ) : vars.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-ink-3 text-[13px]">No global variables yet.</p>
            <p className="text-ink-3 text-[12px] mt-1">Add API keys, tokens, or shared config here.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-[rgba(240,242,247,0.6)]">
                <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3 w-48">Key</th>
                <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Value</th>
                <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Description</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {vars.map((v) => (
                <tr key={v.id} className="border-t border-[rgba(99,112,156,0.06)] hover:bg-accent/[0.025]">
                  <td className="px-4 py-3">
                    <code className="text-[12px] font-mono font-[700] text-violet bg-accent/[0.07] px-1.5 py-0.5 rounded">
                      {v.key}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    {editingId === v.id ? (
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full px-2 py-1 rounded border border-violet text-[13px] text-ink-1 focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <span className="text-[13px] font-mono text-ink-2">{v.value}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === v.id ? (
                      <input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="Description..."
                        className="w-full px-2 py-1 rounded border border-[rgba(99,112,156,0.2)] text-[13px] text-ink-1 focus:outline-none focus:border-violet"
                      />
                    ) : (
                      <span className="text-[12px] text-ink-3">{v.description || '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {editingId === v.id ? (
                        <>
                          <button
                            onClick={() => saveEdit(v.id)}
                            disabled={updateMutation.isPending}
                            className="p-1.5 rounded text-success hover:bg-success/10 transition-colors"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1.5 rounded text-ink-3 hover:bg-bg transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(v)}
                            className="p-1.5 rounded text-ink-3 hover:text-violet hover:bg-accent/10 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete variable "${v.key}"?`)) deleteMutation.mutate(v.id)
                            }}
                            className="p-1.5 rounded text-ink-3 hover:text-danger hover:bg-danger-dim transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
