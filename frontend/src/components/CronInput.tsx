import { useState } from 'react'
import { clsx } from 'clsx'
import { getNextCronRun, describeCron } from '../utils/cronUtils'
import { useTimezone } from '../context/TimezoneContext'

interface CronInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

const PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 min', value: '*/5 * * * *' },
  { label: 'Every 15 min', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily 9 AM', value: '0 9 * * *' },
  { label: 'Daily midnight', value: '0 0 * * *' },
  { label: 'Weekly Mon', value: '0 9 * * 1' },
  { label: 'Monthly 1st', value: '0 9 1 * *' },
]

export function CronInput({ value, onChange, className }: CronInputProps) {
  const [showPresets, setShowPresets] = useState(false)
  const { timezone, formatDateTime } = useTimezone()

  const description = describeCron(value)
  const nextRun = value && value.trim() ? getNextCronRun(value.trim(), timezone) : null

  return (
    <div className={clsx('space-y-2', className)}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="* * * * * (leave empty for manual only)"
          className="w-full px-3 py-2 rounded-lg border border-[rgba(99,112,156,0.2)] bg-white text-[13px] text-ink-1 font-mono placeholder:text-ink-3 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/20"
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-ink-3 space-y-0.5">
          <div>{description}</div>
          {nextRun && (
            <div className="text-violet/80 font-[600]">
              Next run: {formatDateTime(nextRun)}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowPresets(!showPresets)}
          className="text-[11px] text-violet font-[600] hover:text-violet/70"
        >
          Presets
        </button>
      </div>
      {showPresets && (
        <div className="grid grid-cols-2 gap-1.5 p-3 bg-bg rounded-lg border border-[rgba(99,112,156,0.12)]">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                onChange(p.value)
                setShowPresets(false)
              }}
              className={clsx(
                'text-left px-2.5 py-1.5 rounded text-[11px] transition-colors',
                value === p.value
                  ? 'bg-violet-dim text-violet font-[700]'
                  : 'text-ink-2 hover:bg-white hover:text-ink-1 font-[500]'
              )}
            >
              <div className="font-[600]">{p.label}</div>
              <div className="font-mono text-[10px] text-ink-3 mt-0.5">{p.value}</div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onChange('')
              setShowPresets(false)
            }}
            className="col-span-2 text-left px-2.5 py-1.5 rounded text-[11px] text-ink-3 hover:bg-white hover:text-ink-2 transition-colors"
          >
            Clear (manual only)
          </button>
        </div>
      )}
    </div>
  )
}
