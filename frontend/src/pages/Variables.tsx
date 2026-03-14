import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, Check, AlertTriangle, Eye, EyeOff, Copy } from 'lucide-react'
import { variablesApi, GlobalVar } from '../api/variables'
import { useToast } from '../components/Toast'

function MaskedValue({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false)
  const toast = useToast()

  const copy = () => {
    navigator.clipboard.writeText(value).then(
      () => toast('Copied to clipboard', 'success'),
      () => toast('Failed to copy', 'error'),
    )
  }

  return (
    <div className="flex items-center gap-1 group">
      <span className="text-[13px] font-mono text-ink-2 min-w-0 truncate max-w-[260px]">
        {revealed ? value : '••••••••••••'}
      </span>
      <button
        onClick={() => setRevealed((r) => !r)}
        title={revealed ? 'Hide' : 'Reveal'}
        className="p-1 rounded text-ink-4 hover:text-ink-2 opacity-0 group-hover:opacity-100 transition-all"
      >
        {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button
        onClick={copy}
        title="Copy value"
        className="p-1 rounded text-ink-4 hover:text-ink-2 opacity-0 group-hover:opacity-100 transition-all"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export default function VariablesPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editValueRevealed, setEditValueRevealed] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newValueRevealed, setNewValueRevealed] = useState(false)
  const [newDesc, setNewDesc] = useState('')
  const [varToDelete, setVarToDelete] = useState<GlobalVar | null>(null)

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
      setNewValueRevealed(false)
      toast('Variable added successfully')
    },
    onError: () => toast('Failed to add variable', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { value: string; description?: string } }) =>
      variablesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variables'] })
      setEditingId(null)
      setEditValueRevealed(false)
      toast('Variable updated')
    },
    onError: () => toast('Failed to update variable', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: variablesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variables'] })
      setVarToDelete(null)
      toast('Variable deleted')
    },
    onError: () => toast('Failed to delete variable', 'error'),
  })

  const startEdit = (v: GlobalVar) => {
    setEditingId(v.id)
    setEditValue(v.value)
    setEditDesc(v.description || '')
    setEditValueRevealed(false)
  }

  const saveEdit = (id: number) => {
    updateMutation.mutate({ id, data: { value: editValue, description: editDesc || undefined } })
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Delete confirm modal */}
      {varToDelete && (
        <div className="fixed inset-0 bg-ink-1/30 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-[rgba(99,112,156,0.1)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-danger-dim flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-4 h-4 text-danger" />
                </div>
                <div>
                  <h2 className="text-[15px] font-[800] text-ink-1">Delete Variable</h2>
                  <p className="text-[12px] text-ink-3 mt-0.5">This action cannot be undone</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-[13px] text-ink-2">
                Are you sure you want to delete variable{' '}
                <code className="font-mono font-[700] text-violet bg-accent/[0.07] px-1.5 py-0.5 rounded">
                  {varToDelete.key}
                </code>
                ?
              </p>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => setVarToDelete(null)}
                className="flex-1 px-4 py-2 rounded-lg text-[13px] font-[700] bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:bg-bg active:scale-[0.97] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(varToDelete.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2 rounded-lg text-[13px] font-[700] bg-danger text-white hover:bg-[#a01227] active:scale-[0.97] transition-all disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div className="relative">
                <input
                  type={newValueRevealed ? 'text' : 'password'}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="secret_value"
                  className="w-full px-3 py-2 pr-8 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
                />
                <button
                  type="button"
                  onClick={() => setNewValueRevealed((r) => !r)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-1"
                >
                  {newValueRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
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
                      <div className="relative">
                        <input
                          type={editValueRevealed ? 'text' : 'password'}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full px-2 py-1 pr-8 rounded border border-violet text-[13px] text-ink-1 focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setEditValueRevealed((r) => !r)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-1"
                        >
                          {editValueRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ) : (
                      <MaskedValue value={v.value} />
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
                            onClick={() => setVarToDelete(v)}
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
