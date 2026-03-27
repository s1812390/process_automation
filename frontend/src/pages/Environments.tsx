import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, RefreshCw, Package, AlertCircle, CheckCircle, Clock, X, ChevronRight, HardDrive, AlertTriangle, Lock } from 'lucide-react'
import { environmentsApi, PythonEnv, EnvPackage } from '../api/environments'
import { useToast } from '../components/Toast'
import { clsx } from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import { parseUTC } from '../utils/dateUtils'

function fmtSize(kb: number | null | undefined): string {
  if (!kb) return '—'
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function StatusDot({ status }: { status: string }) {
  if (status === 'installed') return <CheckCircle className="w-3.5 h-3.5 text-success flex-shrink-0" />
  if (status === 'installing') return <Clock className="w-3.5 h-3.5 text-warning flex-shrink-0 animate-spin" />
  return <AlertCircle className="w-3.5 h-3.5 text-danger flex-shrink-0" />
}

// ── Create Environment Modal ────────────────────────────────────────────────
function CreateEnvModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const createMutation = useMutation({
    mutationFn: environmentsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environments'] })
      toast('Environment created successfully', 'success')
      onClose()
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail || 'Failed to create environment'
      toast(msg, 'error')
    },
  })

  return (
    <div className="fixed inset-0 bg-ink-1/30 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-[rgba(99,112,156,0.1)] bg-gradient-to-br from-violet-dim to-accent-dim/50 rounded-t-xl flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-[800] text-ink-1">New Python Environment</h2>
            <p className="text-[11px] text-ink-3 mt-0.5">Creates an isolated venv on disk</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-ink-3 hover:bg-bg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. data-science, etl-jobs"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
            />
          </div>
          <div>
            <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
            />
          </div>
          {createMutation.isPending && (
            <p className="text-[12px] text-ink-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              Creating venv, please wait…
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-[13px] font-[700] bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:bg-bg active:scale-[0.97] transition-all">
              Cancel
            </button>
            <button
              disabled={!name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ name: name.trim(), description: description.trim() || undefined })}
              className="flex-1 px-4 py-2 rounded-lg text-[13px] font-[700] bg-ink-1 text-white hover:bg-[#1e2535] active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Delete Env Confirm ──────────────────────────────────────────────────────
function DeleteEnvModal({ env, onClose }: { env: PythonEnv; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const deleteMutation = useMutation({
    mutationFn: () => environmentsApi.delete(env.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environments'] })
      toast('Environment deleted', 'success')
      onClose()
    },
    onError: () => toast('Failed to delete environment', 'error'),
  })
  return (
    <div className="fixed inset-0 bg-ink-1/30 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-5 border-b border-[rgba(99,112,156,0.1)] flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-danger-dim flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4.5 h-4.5 text-danger" />
          </div>
          <div>
            <h2 className="text-[15px] font-[800] text-ink-1">Delete Environment</h2>
            <p className="text-[11px] text-ink-3 mt-0.5">This will remove the venv from disk</p>
          </div>
        </div>
        <div className="px-6 py-5 text-[13px] text-ink-2">
          Delete <span className="font-[700] text-ink-1">"{env.name}"</span> and all its packages?
          Scripts using this environment will fall back to the system Python.
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-[13px] font-[700] bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:bg-bg active:scale-[0.97] transition-all">
            Cancel
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="flex-1 px-4 py-2 rounded-lg text-[13px] font-[700] bg-danger text-white hover:bg-[#a01227] active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Package row ─────────────────────────────────────────────────────────────
function PackageRow({ pkg, onUninstall, isSystem }: { pkg: EnvPackage; onUninstall: () => void; isSystem?: boolean }) {
  return (
    <tr className="border-t border-[rgba(99,112,156,0.06)] hover:bg-accent/[0.02]">
      <td className="px-4 py-2.5 flex items-center gap-2">
        <StatusDot status={pkg.status} />
        <span className="text-[13px] font-[600] text-ink-1 font-mono">{pkg.package_name}</span>
      </td>
      <td className="px-4 py-2.5 text-[12px] text-ink-2 font-mono">{pkg.version || '—'}</td>
      <td className="px-4 py-2.5 text-[12px] text-ink-3">{fmtSize(pkg.size_kb)}</td>
      <td className="px-4 py-2.5 text-[11px] text-ink-3">
        {pkg.installed_at
          ? formatDistanceToNow(parseUTC(pkg.installed_at), { addSuffix: true })
          : '—'}
      </td>
      <td className="px-4 py-2.5 text-right">
        {!isSystem && pkg.status !== 'installing' && (
          <button
            onClick={onUninstall}
            title="Uninstall"
            className="p-1.5 rounded-lg text-ink-3 hover:bg-danger-dim hover:text-danger transition-all active:scale-[0.97]"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function EnvironmentsPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [selectedEnvId, setSelectedEnvId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteEnv, setDeleteEnv] = useState<PythonEnv | null>(null)

  // Install form state
  const [pkgName, setPkgName] = useState('')
  const [pkgVersion, setPkgVersion] = useState('')

  const { data: envs = [], isLoading } = useQuery({
    queryKey: ['environments'],
    queryFn: environmentsApi.list,
    refetchInterval: 5000,
  })

  // Auto-select first env when list loads
  useEffect(() => {
    if (envs.length > 0 && selectedEnvId === null) {
      setSelectedEnvId(envs[0].id)
    }
    // If selected env was deleted, clear selection
    if (selectedEnvId !== null && !envs.find((e) => e.id === selectedEnvId)) {
      setSelectedEnvId(envs.length > 0 ? envs[0].id : null)
    }
  }, [envs])

  const selectedEnv = envs.find((e) => e.id === selectedEnvId) || null

  // Packages for selected env
  const { data: packages = [], isLoading: pkgsLoading, refetch: refetchPkgs } = useQuery({
    queryKey: ['environments', selectedEnvId, 'packages'],
    queryFn: () => environmentsApi.listPackages(selectedEnvId!),
    enabled: selectedEnvId !== null,
    refetchInterval: 3000, // poll while any package is installing
  })

  const installMutation = useMutation({
    mutationFn: ({ envId, name, version }: { envId: number; name: string; version?: string }) =>
      environmentsApi.installPackage(envId, { package_name: name, version: version || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environments', selectedEnvId, 'packages'] })
      queryClient.invalidateQueries({ queryKey: ['environments'] })
      toast('Package install started', 'success')
      setPkgName('')
      setPkgVersion('')
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail || 'Failed to install package'
      toast(msg, 'error')
    },
  })

  const uninstallMutation = useMutation({
    mutationFn: ({ envId, pkgId }: { envId: number; pkgId: number }) =>
      environmentsApi.uninstallPackage(envId, pkgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environments', selectedEnvId, 'packages'] })
      queryClient.invalidateQueries({ queryKey: ['environments'] })
      toast('Package uninstalled', 'success')
    },
    onError: () => toast('Failed to uninstall package', 'error'),
  })

  const syncMutation = useMutation({
    mutationFn: (envId: number) => environmentsApi.sync(envId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['environments', selectedEnvId, 'packages'] })
      queryClient.invalidateQueries({ queryKey: ['environments'] })
      toast(`Sync done: +${result.added} added, −${result.removed} removed, ${result.updated} updated`, 'success')
    },
    onError: () => toast('Sync failed', 'error'),
  })

  const handleInstall = () => {
    if (!pkgName.trim() || !selectedEnvId) return
    installMutation.mutate({
      envId: selectedEnvId,
      name: pkgName.trim(),
      version: pkgVersion.trim() || undefined,
    })
  }

  const hasInstalling = packages.some((p) => p.status === 'installing')

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[14.5px] font-[800] text-ink-1">Python Environments</h2>
          <p className="text-[12px] text-ink-3 mt-0.5">
            {envs.length} environment{envs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-[700] bg-gradient-to-br from-accent to-[#b00e49] text-white shadow-[0_3px_12px_rgba(224,24,92,0.3)] hover:-translate-y-px active:scale-[0.97] transition-all"
        >
          <Plus className="w-4 h-4" />
          New Environment
        </button>
      </div>

      <div className="flex gap-4 h-[calc(100vh-200px)]">
        {/* ── Left panel: env list ── */}
        <div className="w-64 flex-shrink-0 bg-white rounded-xl border border-[rgba(99,112,156,0.12)] overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-[12px] text-ink-3">Loading…</div>
          ) : envs.length === 0 ? (
            <div className="p-6 text-center">
              <Package className="w-8 h-8 text-ink-3 mx-auto mb-2" />
              <p className="text-[12px] text-ink-3">No environments yet</p>
            </div>
          ) : (
            <ul>
              {envs.map((env) => (
                <li key={env.id}>
                  <button
                    onClick={() => setSelectedEnvId(env.id)}
                    className={clsx(
                      'w-full text-left px-4 py-3 border-b border-[rgba(99,112,156,0.06)] flex items-center gap-2 transition-colors',
                      selectedEnvId === env.id
                        ? 'bg-accent-dim border-l-2 border-l-accent'
                        : 'hover:bg-bg'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-[700] text-ink-1 truncate">{env.name}</span>
                        {env.is_system && (
                          <Lock className="w-3 h-3 text-ink-3 flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-[10.5px] text-ink-3 mt-0.5">
                        {env.package_count} pkg{env.package_count !== 1 ? 's' : ''} · {fmtSize(env.total_size_kb)}
                      </div>
                    </div>
                    <ChevronRight className={clsx('w-3.5 h-3.5 flex-shrink-0 text-ink-3 transition-transform', selectedEnvId === env.id && 'text-accent')} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Right panel: env detail ── */}
        {selectedEnv ? (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* Env info bar */}
            <div className="bg-white rounded-xl border border-[rgba(99,112,156,0.12)] px-5 py-4 flex items-center gap-6 flex-shrink-0">
              <div className="flex-1 grid grid-cols-4 gap-4">
                <div>
                  <div className="text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3 mb-0.5">Name</div>
                  <div className="text-[14px] font-[800] text-ink-1">{selectedEnv.name}</div>
                  {selectedEnv.description && (
                    <div className="text-[11px] text-ink-3 mt-0.5">{selectedEnv.description}</div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3 mb-0.5">Python</div>
                  <div className="text-[13px] font-[700] text-ink-1 font-mono">{selectedEnv.python_version || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3 mb-0.5">Packages</div>
                  <div className="text-[13px] font-[700] text-ink-1">{selectedEnv.package_count}</div>
                </div>
                <div>
                  <div className="text-[10px] font-[700] uppercase tracking-[0.8px] text-ink-3 mb-0.5">Total Size</div>
                  <div className="text-[13px] font-[700] text-ink-1 flex items-center gap-1">
                    <HardDrive className="w-3.5 h-3.5 text-ink-3" />
                    {fmtSize(selectedEnv.total_size_kb)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {selectedEnv.is_system ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-[700] text-ink-3 bg-bg border border-[rgba(99,112,156,0.2)]">
                    <Lock className="w-3.5 h-3.5" />
                    Read-only
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => syncMutation.mutate(selectedEnv.id)}
                      disabled={syncMutation.isPending}
                      title="Sync packages: reconcile DB with actual pip list"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-[700] text-ink-3 border border-[rgba(99,112,156,0.2)] hover:text-ink-1 hover:bg-bg active:scale-[0.97] transition-all disabled:opacity-50"
                    >
                      <RefreshCw className={clsx('w-3.5 h-3.5', syncMutation.isPending && 'animate-spin')} />
                      {syncMutation.isPending ? 'Syncing…' : 'Sync'}
                    </button>
                    <button
                      onClick={() => setDeleteEnv(selectedEnv)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-[700] bg-danger-dim text-danger border border-danger/15 hover:bg-danger/10 active:scale-[0.97] transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Install package form — hidden for system env */}
            {!selectedEnv.is_system && (
              <div className="bg-white rounded-xl border border-[rgba(99,112,156,0.12)] px-5 py-4 flex-shrink-0">
                <div className="text-[12px] font-[700] text-ink-2 mb-3">Install Package</div>
                <div className="flex gap-2">
                  <input
                    value={pkgName}
                    onChange={(e) => setPkgName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
                    placeholder="Package name (e.g. pandas)"
                    className="flex-1 px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
                  />
                  <input
                    value={pkgVersion}
                    onChange={(e) => setPkgVersion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
                    placeholder="Version (optional)"
                    className="w-40 px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
                  />
                  <button
                    onClick={handleInstall}
                    disabled={!pkgName.trim() || installMutation.isPending}
                    className="px-4 py-2 rounded-lg text-[13px] font-[700] bg-ink-1 text-white hover:bg-[#1e2535] active:scale-[0.97] transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Install
                  </button>
                </div>
                {hasInstalling && (
                  <p className="text-[11px] text-warning mt-2 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 animate-spin" />
                    Installation in progress…
                  </p>
                )}
              </div>
            )}

            {/* Packages table */}
            <div className="bg-white rounded-xl border border-[rgba(99,112,156,0.12)] overflow-hidden flex-1 flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-[rgba(99,112,156,0.08)] flex items-center justify-between flex-shrink-0">
                <span className="text-[12px] font-[700] text-ink-2">
                  Installed Packages
                  {packages.length > 0 && (
                    <span className="ml-2 text-[10px] font-[800] bg-violet text-white rounded-full px-1.5 py-0.5">
                      {packages.length}
                    </span>
                  )}
                </span>
              </div>
              <div className="overflow-y-auto flex-1">
                {pkgsLoading ? (
                  <div className="p-6 text-center text-[12px] text-ink-3">Loading packages…</div>
                ) : packages.length === 0 ? (
                  <div className="p-8 text-center">
                    <Package className="w-8 h-8 text-ink-3 mx-auto mb-2" />
                    <p className="text-[13px] text-ink-2 font-[600]">No packages installed</p>
                    {!selectedEnv.is_system && (
                      <p className="text-[11px] text-ink-3 mt-1">Use the form above to install packages</p>
                    )}
                  </div>
                ) : (
                  <table className="w-full" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '35%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '15%' }} />
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '8%' }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-[rgba(240,242,247,0.6)]">
                        <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Package</th>
                        <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Version</th>
                        <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Size</th>
                        <th className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">Installed</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {packages.map((pkg) => (
                        <PackageRow
                          key={pkg.id}
                          pkg={pkg}
                          isSystem={selectedEnv.is_system}
                          onUninstall={() =>
                            uninstallMutation.mutate({ envId: selectedEnv.id, pkgId: pkg.id })
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-xl border border-[rgba(99,112,156,0.12)] flex items-center justify-center">
            <div className="text-center">
              <Package className="w-12 h-12 text-ink-3 mx-auto mb-3" />
              <p className="text-[14px] font-[700] text-ink-2">Select an environment</p>
              <p className="text-[12px] text-ink-3 mt-1">
                {envs.length === 0
                  ? 'Create your first environment to get started'
                  : 'Choose an environment from the left panel'}
              </p>
            </div>
          </div>
        )}
      </div>

      {showCreate && <CreateEnvModal onClose={() => setShowCreate(false)} />}
      {deleteEnv && <DeleteEnvModal env={deleteEnv} onClose={() => setDeleteEnv(null)} />}
    </div>
  )
}
