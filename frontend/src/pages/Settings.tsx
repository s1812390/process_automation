import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, Settings } from '../api/settings'
import { CheckCircle, Bell } from 'lucide-react'
import { useTimezone } from '../context/TimezoneContext'
import { useToast } from '../components/Toast'

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Almaty', label: 'Asia/Almaty (UTC+5, Казахстан)' },
  { value: 'Asia/Aqtau', label: 'Asia/Aqtau (UTC+5, Актау)' },
  { value: 'Asia/Aqtobe', label: 'Asia/Aqtobe (UTC+5, Актобе)' },
  { value: 'Asia/Oral', label: 'Asia/Oral (UTC+5, Уральск)' },
  { value: 'Europe/Moscow', label: 'Europe/Moscow (UTC+3, Москва)' },
  { value: 'Asia/Tashkent', label: 'Asia/Tashkent (UTC+5, Ташкент)' },
  { value: 'Asia/Bishkek', label: 'Asia/Bishkek (UTC+6, Бишкек)' },
  { value: 'Asia/Yekaterinburg', label: 'Asia/Yekaterinburg (UTC+5)' },
  { value: 'UTC', label: 'UTC (UTC+0)' },
  { value: 'Europe/London', label: 'Europe/London (UTC+0/+1)' },
]

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)
  const { formatDateTime } = useTimezone()
  const toast = useToast()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  const [form, setForm] = useState<Settings>({
    max_concurrent_workers: 2,
    default_timeout_seconds: 3600,
    default_max_retries: 0,
    default_cpu_cores: undefined,
    default_ram_limit_mb: undefined,
    timezone: 'Asia/Almaty',
    global_alert_on_failure: false,
    global_alert_on_timeout: false,
    global_alert_channel: null,
    global_alert_destination: null,
  })

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const updateMutation = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data)
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      toast('Settings saved successfully')
    },
    onError: () => toast('Failed to save settings', 'error'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(form)
  }

  if (isLoading) {
    return <div className="text-ink-3 text-[13px]">Loading settings...</div>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg border border-[rgba(99,112,156,0.12)] overflow-hidden">
        <div className="px-6 py-5 border-b border-[rgba(99,112,156,0.08)]">
          <h2 className="text-[14.5px] font-[800] text-ink-1">Global Settings</h2>
          <p className="text-[12px] text-ink-3 mt-0.5">
            These defaults apply to all scripts unless overridden per-script.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Timezone */}
          <div>
            <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">
              Timezone
            </label>
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-ink-3 mt-1">
              Current time:&nbsp;
              <span className="font-mono font-[600] text-ink-2">{formatDateTime(new Date())}</span>
              &nbsp;· Cron expressions are interpreted in this timezone.
            </p>
          </div>

          {/* Max concurrent workers */}
          <div>
            <label className="block text-[12px] font-[700] text-ink-2 mb-2">
              Max Concurrent Workers
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={8}
                value={form.max_concurrent_workers}
                onChange={(e) => setForm({ ...form, max_concurrent_workers: +e.target.value })}
                className="flex-1 accent-violet"
              />
              <span className="w-8 text-center text-[18px] font-mono font-[500] text-ink-1">
                {form.max_concurrent_workers}
              </span>
            </div>
            <p className="text-[11px] text-ink-3 mt-1">
              Number of scripts that can run simultaneously. Restart workers to apply.
            </p>
          </div>

          {/* Default timeout */}
          <div>
            <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">
              Default Timeout (seconds)
            </label>
            <input
              type="number"
              min={1}
              value={form.default_timeout_seconds}
              onChange={(e) => setForm({ ...form, default_timeout_seconds: +e.target.value })}
              className="w-48 px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 font-mono focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
            />
            <p className="text-[11px] text-ink-3 mt-1">
              Scripts without a specific timeout will use this value.
            </p>
          </div>

          {/* Default max retries */}
          <div>
            <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">
              Default Max Retries
            </label>
            <input
              type="number"
              min={0}
              max={10}
              value={form.default_max_retries}
              onChange={(e) => setForm({ ...form, default_max_retries: +e.target.value })}
              className="w-24 px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 font-mono focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
            />
            <p className="text-[11px] text-ink-3 mt-1">
              0 = no retries on failure.
            </p>
          </div>

          {/* CPU limit */}
          <div>
            <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">
              Default CPU Cores Limit
            </label>
            <input
              type="number"
              min={0}
              value={form.default_cpu_cores ?? ''}
              onChange={(e) =>
                setForm({ ...form, default_cpu_cores: e.target.value ? +e.target.value : undefined })
              }
              placeholder="0 (unlimited)"
              className="w-48 px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 font-mono focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
            />
            <p className="text-[11px] text-ink-3 mt-1">Leave empty or 0 for no limit.</p>
          </div>

          {/* RAM limit */}
          <div>
            <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">
              Default RAM Limit (MB)
            </label>
            <input
              type="number"
              min={0}
              value={form.default_ram_limit_mb ?? ''}
              onChange={(e) =>
                setForm({ ...form, default_ram_limit_mb: e.target.value ? +e.target.value : undefined })
              }
              placeholder="0 (unlimited)"
              className="w-48 px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 font-mono focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
            />
            <p className="text-[11px] text-ink-3 mt-1">Leave empty or 0 for no limit.</p>
          </div>

          {/* Global Admin Alerts */}
          <div className="pt-2 border-t border-[rgba(99,112,156,0.08)]">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4 text-violet" />
              <div>
                <h3 className="text-[13px] font-[800] text-ink-1">Admin Alerts (Global)</h3>
                <p className="text-[11px] text-ink-3 mt-0.5">
                  Receive alerts for any script failure or timeout, regardless of per-script settings.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Triggers */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.global_alert_on_failure}
                    onChange={(e) => setForm({ ...form, global_alert_on_failure: e.target.checked })}
                    className="w-3.5 h-3.5 accent-violet"
                  />
                  <span className="text-[12px] font-[600] text-ink-2">On Failure</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.global_alert_on_timeout}
                    onChange={(e) => setForm({ ...form, global_alert_on_timeout: e.target.checked })}
                    className="w-3.5 h-3.5 accent-violet"
                  />
                  <span className="text-[12px] font-[600] text-ink-2">On Timeout</span>
                </label>
              </div>

              {/* Channel */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">Channel</label>
                  <select
                    value={form.global_alert_channel || ''}
                    onChange={(e) => setForm({ ...form, global_alert_channel: e.target.value || null })}
                    className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
                  >
                    <option value="">— disabled —</option>
                    <option value="email">Email</option>
                    <option value="telegram">Telegram</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-[700] text-ink-2 mb-1.5">
                    {form.global_alert_channel === 'telegram' ? 'Chat ID' : 'Email address'}
                  </label>
                  <input
                    type="text"
                    value={form.global_alert_destination || ''}
                    onChange={(e) => setForm({ ...form, global_alert_destination: e.target.value || null })}
                    placeholder={form.global_alert_channel === 'telegram' ? '-100123456789' : 'admin@company.com'}
                    disabled={!form.global_alert_channel}
                    className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {!form.global_alert_channel && (
                <p className="text-[11px] text-ink-3">
                  Select a channel to enable global alerts.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-[rgba(99,112,156,0.08)]">
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-5 py-2 rounded-lg text-[13px] font-[700] bg-ink-1 text-white hover:bg-[#1e2535] hover:-translate-y-px active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
            </button>
            {saved && (
              <div className="flex items-center gap-1.5 text-[12px] text-success font-[600]">
                <CheckCircle className="w-4 h-4" />
                Saved!
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
