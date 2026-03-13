import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Trash2, Plus, Mail, MessageCircle, X, ChevronLeft, Copy, RefreshCw, Check } from 'lucide-react'
import { scriptsApi, alertsApi, AlertConfigCreate } from '../api/scripts'
import { runsApi } from '../api/runs'
import { ScriptEditor } from '../components/ScriptEditor'
import { CronInput } from '../components/CronInput'
import { StatusBadge } from '../components/StatusBadge'
import { formatDistanceToNow } from 'date-fns'
import { clsx } from 'clsx'

type Tab = 'editor' | 'requirements' | 'settings' | 'parameters' | 'alerts' | 'history'

interface ParamDef {
  name: string
  type: 'string' | 'int' | 'float' | 'bool'
  default: string
  required: boolean
  description: string
}

export default function ScriptDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const scriptId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const initialTab = (searchParams.get('tab') as Tab) || 'editor'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  const { data: script, isLoading } = useQuery({
    queryKey: ['scripts', scriptId],
    queryFn: () => scriptsApi.get(scriptId),
  })

  const { data: alerts = [] } = useQuery({
    queryKey: ['scripts', scriptId, 'alerts'],
    queryFn: () => scriptsApi.getAlerts(scriptId),
    enabled: activeTab === 'alerts',
  })

  const { data: history } = useQuery({
    queryKey: ['runs', { script_id: scriptId }],
    queryFn: () => runsApi.list({ script_id: scriptId, page_size: 50 }),
    enabled: activeTab === 'history',
    refetchInterval: activeTab === 'history' ? 5000 : false,
  })

  const [editorContent, setEditorContent] = useState<string>('')
  const [reqContent, setReqContent] = useState<string>('')
  const [settings, setSettings] = useState<{
    cron_expression: string
    timeout_seconds: string
    priority: number
    max_retries: number
    cpu_cores: string
    ram_limit_mb: string
    is_active: boolean
    tag: string
  } | null>(null)
  const [params, setParams] = useState<ParamDef[]>([])
  const [copiedWebhook, setCopiedWebhook] = useState(false)

  // Run-with-params modal
  const [showRunModal, setShowRunModal] = useState(false)
  const [runParamValues, setRunParamValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (script) {
      if (!editorContent) setEditorContent(script.script_content)
      if (!reqContent) setReqContent(script.requirements_content || '')
      if (!settings) {
        setSettings({
          cron_expression: script.cron_expression || '',
          timeout_seconds: script.timeout_seconds?.toString() || '',
          priority: script.priority,
          max_retries: script.max_retries,
          cpu_cores: script.cpu_cores?.toString() || '',
          ram_limit_mb: script.ram_limit_mb?.toString() || '',
          is_active: script.is_active,
          tag: script.tag || '',
        })
      }
      try {
        const parsed = script.parameters_schema ? JSON.parse(script.parameters_schema) : []
        if (Array.isArray(parsed)) setParams(parsed)
      } catch {
        setParams([])
      }
    }
  }, [script])

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof scriptsApi.update>[1]) => scriptsApi.update(scriptId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scripts', scriptId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => scriptsApi.delete(scriptId),
    onSuccess: () => navigate('/scripts'),
  })

  const regenWebhookMutation = useMutation({
    mutationFn: () => scriptsApi.regenerateWebhook(scriptId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scripts', scriptId] }),
  })

  const runMutation = useMutation({
    mutationFn: (parameters?: Record<string, string>) => scriptsApi.run(scriptId, parameters),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      navigate(`/runs/${data.run_id}`)
    },
  })

  const deleteAlertMutation = useMutation({
    mutationFn: alertsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scripts', scriptId, 'alerts'] }),
  })

  const [newAlert, setNewAlert] = useState<AlertConfigCreate | null>(null)
  const createAlertMutation = useMutation({
    mutationFn: (data: AlertConfigCreate) => scriptsApi.createAlert(scriptId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts', scriptId, 'alerts'] })
      setNewAlert(null)
    },
  })

  if (isLoading || !script) {
    return <div className="p-6 text-ink-3">Loading...</div>
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'editor', label: 'Editor' },
    { key: 'requirements', label: 'Requirements' },
    { key: 'settings', label: 'Settings' },
    { key: 'parameters', label: 'Parameters' },
    { key: 'alerts', label: 'Alerts' },
    { key: 'history', label: 'History' },
  ]

  const webhookUrl = `${window.location.origin}/api/webhooks/${script.webhook_token}`

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl)
    setCopiedWebhook(true)
    setTimeout(() => setCopiedWebhook(false), 2000)
  }

  const handleRunClick = () => {
    if (params.length > 0) {
      const defaults: Record<string, string> = {}
      params.forEach((p) => { defaults[p.name] = p.default || '' })
      setRunParamValues(defaults)
      setShowRunModal(true)
    } else {
      runMutation.mutate(undefined)
    }
  }

  const addParam = () => {
    setParams([...params, { name: '', type: 'string', default: '', required: false, description: '' }])
  }

  const removeParam = (i: number) => setParams(params.filter((_, idx) => idx !== i))

  const updateParam = (i: number, field: keyof ParamDef, value: string | boolean) => {
    const updated = [...params]
    updated[i] = { ...updated[i], [field]: value }
    setParams(updated)
  }

  const saveParams = () => {
    updateMutation.mutate({ parameters_schema: JSON.stringify(params) })
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Run modal */}
      {showRunModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[rgba(99,112,156,0.12)] shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-[15px] font-[800] text-ink-1">Run with Parameters</h3>
            {params.map((p) => (
              <div key={p.name}>
                <label className="block text-[12px] font-[700] text-ink-2 mb-1">
                  {p.name}
                  {p.required && <span className="text-danger ml-1">*</span>}
                  {p.description && <span className="font-[400] text-ink-3 ml-2">{p.description}</span>}
                </label>
                {p.type === 'bool' ? (
                  <select
                    value={runParamValues[p.name] || ''}
                    onChange={(e) => setRunParamValues({ ...runParamValues, [p.name]: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] focus:outline-none focus:border-violet"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={p.type === 'int' || p.type === 'float' ? 'number' : 'text'}
                    value={runParamValues[p.name] || ''}
                    onChange={(e) => setRunParamValues({ ...runParamValues, [p.name]: e.target.value })}
                    placeholder={p.default || `Enter ${p.name}`}
                    className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
                  />
                )}
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowRunModal(false)}
                className="flex-1 px-4 py-2 rounded-lg text-[13px] font-[700] text-ink-2 border border-[rgba(99,112,156,0.2)] hover:bg-bg active:scale-[0.97] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowRunModal(false); runMutation.mutate(runParamValues) }}
                disabled={runMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[13px] font-[700] bg-gradient-to-br from-accent to-[#b00e49] text-white shadow-[0_3px_12px_rgba(224,24,92,0.3)] hover:-translate-y-px active:scale-[0.97] transition-all disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                Run
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/scripts" className="text-[12px] text-ink-3 hover:text-ink-2 flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" />
              Scripts
            </Link>
          </div>
          <h1 className="text-[18px] font-[800] text-ink-1">{script.name}</h1>
          {script.description && (
            <p className="text-[12px] text-ink-3 mt-0.5">{script.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { if (confirm(`Delete "${script.name}"?`)) deleteMutation.mutate() }}
            className="px-3 py-2 rounded-lg text-[13px] font-[700] bg-danger-dim text-danger border border-danger/15 hover:bg-danger/10 active:scale-[0.97] transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRunClick}
            disabled={runMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-[700] bg-gradient-to-br from-accent to-[#b00e49] text-white shadow-[0_3px_12px_rgba(224,24,92,0.3)] hover:-translate-y-px active:scale-[0.97] transition-all disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Run Now
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg rounded-lg p-1 mb-6 w-fit flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              'px-3.5 py-1.5 rounded-md text-[13px] font-[600] transition-all',
              activeTab === tab.key
                ? 'bg-white text-ink-1 shadow-sm'
                : 'text-ink-3 hover:text-ink-2'
            )}
          >
            {tab.label}
            {tab.key === 'parameters' && params.length > 0 && (
              <span className="ml-1.5 text-[10px] font-[800] bg-violet text-white rounded-full px-1.5 py-0.5">
                {params.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Editor */}
      {activeTab === 'editor' && (
        <div className="space-y-4">
          <ScriptEditor value={editorContent || script.script_content} onChange={setEditorContent} height="500px" />
          <div className="flex justify-end">
            <button onClick={() => updateMutation.mutate({ script_content: editorContent })} disabled={updateMutation.isPending}
              className="px-5 py-2 rounded-lg text-[13px] font-[700] bg-ink-1 text-white hover:bg-[#1e2535] hover:-translate-y-px active:scale-[0.97] transition-all disabled:opacity-50">
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Requirements */}
      {activeTab === 'requirements' && (
        <div className="space-y-4">
          <p className="text-[12px] text-ink-3">Enter pip packages, one per line or in standard requirements.txt format.</p>
          <ScriptEditor
            value={reqContent || script.requirements_content || '# requirements.txt\n# e.g. requests==2.31.0\n'}
            onChange={setReqContent} language="plaintext" height="300px"
          />
          <div className="flex justify-end">
            <button onClick={() => updateMutation.mutate({ requirements_content: reqContent })} disabled={updateMutation.isPending}
              className="px-5 py-2 rounded-lg text-[13px] font-[700] bg-ink-1 text-white hover:bg-[#1e2535] hover:-translate-y-px active:scale-[0.97] transition-all disabled:opacity-50">
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Settings */}
      {activeTab === 'settings' && settings && (
        <div className="space-y-5">
          <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] p-6 space-y-5">
            <div>
              <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Tag</label>
              <input
                type="text"
                value={settings.tag}
                onChange={(e) => setSettings({ ...settings, tag: e.target.value })}
                placeholder="e.g. ETL, Reports, Alerts"
                className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
              />
              <p className="text-[10px] text-ink-3 mt-1">Optional label to group scripts on the Scripts page</p>
            </div>
            <div>
              <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Schedule (cron expression)</label>
              <CronInput value={settings.cron_expression} onChange={(v) => setSettings({ ...settings, cron_expression: v })} />
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Timeout (seconds)</label>
                <input type="number" min={1} value={settings.timeout_seconds}
                  onChange={(e) => setSettings({ ...settings, timeout_seconds: e.target.value })}
                  placeholder="Default from global settings"
                  className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20" />
              </div>
              <div>
                <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Priority (1–5)</label>
                <input type="number" min={1} max={5} value={settings.priority}
                  onChange={(e) => setSettings({ ...settings, priority: +e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20" />
                <p className="text-[10px] text-ink-3 mt-1">4–5: high queue · 2–3: normal · 1: low</p>
              </div>
              <div>
                <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Max Retries</label>
                <input type="number" min={0} value={settings.max_retries}
                  onChange={(e) => setSettings({ ...settings, max_retries: +e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20" />
              </div>
              <div>
                <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">CPU Cores Limit</label>
                <input type="number" min={1} value={settings.cpu_cores}
                  onChange={(e) => setSettings({ ...settings, cpu_cores: e.target.value })}
                  placeholder="No limit"
                  className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20" />
              </div>
              <div>
                <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">RAM Limit (MB)</label>
                <input type="number" min={1} value={settings.ram_limit_mb}
                  onChange={(e) => setSettings({ ...settings, ram_limit_mb: e.target.value })}
                  placeholder="No limit"
                  className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20" />
              </div>
              <div className="flex items-center gap-3 pt-5">
                <label className="text-[12px] font-[700] text-ink-2">Active</label>
                <button type="button" onClick={() => setSettings({ ...settings, is_active: !settings.is_active })}
                  className={clsx('relative w-10 h-5 rounded-full transition-colors', settings.is_active ? 'bg-success' : 'bg-[rgba(99,112,156,0.2)]')}>
                  <span className={clsx('absolute top-0.5 left-0 w-4 h-4 rounded-full bg-white shadow transition-transform', settings.is_active ? 'translate-x-[22px]' : 'translate-x-0.5')} />
                </button>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => updateMutation.mutate({
                cron_expression: settings.cron_expression || undefined,
                timeout_seconds: settings.timeout_seconds ? +settings.timeout_seconds : undefined,
                priority: settings.priority, max_retries: settings.max_retries,
                cpu_cores: settings.cpu_cores ? +settings.cpu_cores : undefined,
                ram_limit_mb: settings.ram_limit_mb ? +settings.ram_limit_mb : undefined,
                is_active: settings.is_active,
                tag: settings.tag.trim() || undefined,
              })} disabled={updateMutation.isPending}
                className="px-5 py-2 rounded-lg text-[13px] font-[700] bg-ink-1 text-white hover:bg-[#1e2535] hover:-translate-y-px active:scale-[0.97] transition-all disabled:opacity-50">
                {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>

          {/* Webhook section */}
          <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-[700] text-ink-1">Webhook</h3>
                <p className="text-[11px] text-ink-3 mt-0.5">
                  Trigger this script via HTTP POST. Optionally pass parameters as JSON body.
                </p>
              </div>
              <button
                onClick={() => { if (confirm('Regenerate webhook token? Existing URLs will stop working.')) regenWebhookMutation.mutate() }}
                disabled={regenWebhookMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-[700] text-ink-3 border border-[rgba(99,112,156,0.2)] hover:text-ink-1 hover:bg-bg active:scale-[0.97] transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Regenerate
              </button>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-bg rounded-lg text-[12px] font-mono text-ink-2 border border-[rgba(99,112,156,0.1)] truncate">
                {webhookUrl}
              </code>
              <button onClick={copyWebhook}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-[700] bg-white border border-[rgba(99,112,156,0.2)] text-ink-2 hover:text-ink-1 hover:bg-bg active:scale-[0.97] transition-all whitespace-nowrap">
                {copiedWebhook ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedWebhook ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-ink-3">
              Example: <code className="font-mono bg-bg px-1 rounded">curl -X POST {webhookUrl} -H "Content-Type: application/json" -d '{'{}'}'</code>
            </p>
          </div>
        </div>
      )}

      {/* Parameters */}
      {activeTab === 'parameters' && (
        <div className="space-y-4">
          <p className="text-[12px] text-ink-3">
            Define parameters for this script. They are injected as{' '}
            <code className="font-mono bg-bg px-1 rounded">PARAM_NAME</code> environment variables.
            Access via <code className="font-mono bg-bg px-1 rounded">os.environ.get('PARAM_NAME', 'default')</code>.
          </p>

          <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] overflow-hidden">
            {params.length > 0 && (
              <table className="w-full">
                <thead>
                  <tr className="bg-[rgba(240,242,247,0.6)]">
                    {['Name', 'Type', 'Default', 'Required', 'Description', ''].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {params.map((p, i) => (
                    <tr key={i} className="border-t border-[rgba(99,112,156,0.06)]">
                      <td className="px-3 py-2">
                        <input value={p.name} onChange={(e) => updateParam(i, 'name', e.target.value.replace(/\s/g, '_'))}
                          placeholder="param_name" className="w-full px-2 py-1 rounded border border-[rgba(99,112,156,0.2)] text-[12px] font-mono focus:outline-none focus:border-violet" />
                      </td>
                      <td className="px-3 py-2">
                        <select value={p.type} onChange={(e) => updateParam(i, 'type', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-[rgba(99,112,156,0.2)] text-[12px] focus:outline-none focus:border-violet bg-white">
                          {['string', 'int', 'float', 'bool'].map(t => <option key={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input value={p.default} onChange={(e) => updateParam(i, 'default', e.target.value)}
                          placeholder="default" className="w-full px-2 py-1 rounded border border-[rgba(99,112,156,0.2)] text-[12px] focus:outline-none focus:border-violet" />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={p.required} onChange={(e) => updateParam(i, 'required', e.target.checked)}
                          className="w-4 h-4 accent-violet cursor-pointer" />
                      </td>
                      <td className="px-3 py-2">
                        <input value={p.description} onChange={(e) => updateParam(i, 'description', e.target.value)}
                          placeholder="Optional description" className="w-full px-2 py-1 rounded border border-[rgba(99,112,156,0.2)] text-[12px] focus:outline-none focus:border-violet" />
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeParam(i)} className="p-1 rounded text-ink-3 hover:text-danger hover:bg-danger-dim transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {params.length === 0 && (
              <div className="p-6 text-center text-ink-3 text-[13px]">No parameters defined yet.</div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button onClick={addParam}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-[700] bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:bg-bg active:scale-[0.97] transition-all">
              <Plus className="w-4 h-4" />
              Add Parameter
            </button>
            <button onClick={saveParams} disabled={updateMutation.isPending}
              className="px-5 py-2 rounded-lg text-[13px] font-[700] bg-ink-1 text-white hover:bg-[#1e2535] hover:-translate-y-px active:scale-[0.97] transition-all disabled:opacity-50">
              {updateMutation.isPending ? 'Saving...' : 'Save Parameters'}
            </button>
          </div>
        </div>
      )}

      {/* Alerts */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div key={alert.id} className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {alert.channel === 'email' ? <Mail className="w-4 h-4 text-violet" /> : <MessageCircle className="w-4 h-4 text-violet" />}
                <div>
                  <div className="text-[13px] font-[600] text-ink-1">{alert.destination}</div>
                  <div className="text-[11px] text-ink-3 mt-0.5">
                    {[alert.on_failure && 'failure', alert.on_success && 'success', alert.on_timeout && 'timeout'].filter(Boolean).join(', ')}
                  </div>
                </div>
              </div>
              <button onClick={() => deleteAlertMutation.mutate(alert.id)}
                className="p-1.5 rounded text-ink-3 hover:text-danger hover:bg-danger-dim transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {newAlert ? (
            <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Channel</label>
                  <select value={newAlert.channel} onChange={(e) => setNewAlert({ ...newAlert, channel: e.target.value as 'email' | 'telegram' })}
                    className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] focus:outline-none focus:border-violet">
                    <option value="email">Email</option>
                    <option value="telegram">Telegram</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Destination</label>
                  <input value={newAlert.destination} onChange={(e) => setNewAlert({ ...newAlert, destination: e.target.value })}
                    placeholder={newAlert.channel === 'email' ? 'email@example.com' : 'Chat ID'}
                    className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20" />
                </div>
              </div>
              <div className="flex gap-5">
                {(['on_failure', 'on_success', 'on_timeout'] as const).map((key) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newAlert[key]} onChange={(e) => setNewAlert({ ...newAlert, [key]: e.target.checked })} className="w-3.5 h-3.5 accent-violet" />
                    <span className="text-[12px] text-ink-2 font-[600]">{key.replace('on_', 'On ')}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setNewAlert(null)} className="px-3 py-1.5 rounded-lg text-[13px] font-[700] bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:bg-bg active:scale-[0.97] transition-all">Cancel</button>
                <button onClick={() => createAlertMutation.mutate(newAlert)} disabled={!newAlert.destination || createAlertMutation.isPending}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-[700] bg-ink-1 text-white hover:bg-[#1e2535] active:scale-[0.97] transition-all disabled:opacity-50">
                  Save Alert
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setNewAlert({ channel: 'email', destination: '', on_failure: true, on_success: false, on_timeout: true })}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-[700] bg-white text-ink-2 border border-[rgba(99,112,156,0.2)] hover:bg-bg active:scale-[0.97] transition-all">
              <Plus className="w-4 h-4" />Add Alert
            </button>
          )}
        </div>
      )}

      {/* History */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[rgba(240,242,247,0.6)]">
                {['Status', 'Trigger', 'Attempt', 'Duration', 'Started', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10.5px] font-[700] uppercase tracking-[0.9px] text-ink-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history?.items.map((run) => (
                <tr key={run.id} className="border-t border-[rgba(99,112,156,0.06)] hover:bg-accent/[0.025]">
                  <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-mono font-[700] text-ink-3 bg-bg px-1.5 py-0.5 rounded">{run.triggered_by}</span>
                  </td>
                  <td className="px-4 py-3 text-[12px] font-mono text-ink-3">#{run.attempt_number}</td>
                  <td className="px-4 py-3 text-[13px] font-mono text-ink-2">
                    {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-ink-3">
                    {run.started_at ? formatDistanceToNow(new Date(run.started_at), { addSuffix: true }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/runs/${run.id}`} className="text-[11px] font-[700] text-violet hover:text-violet/70">Logs</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
