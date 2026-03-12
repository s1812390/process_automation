import { clsx } from 'clsx'
import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  accentColor?: 'accent' | 'violet' | 'success' | 'warning'
  subtitle?: string
}

const accentStyles = {
  accent: 'bg-accent',
  violet: 'bg-violet',
  success: 'bg-success',
  warning: 'bg-warning',
}

export function StatCard({ title, value, icon: Icon, accentColor = 'accent', subtitle }: StatCardProps) {
  return (
    <div className="relative bg-white rounded-lg border border-[rgba(99,112,156,0.12)] p-5 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Left accent stripe */}
      <div className={clsx('absolute left-0 top-0 bottom-0 w-[3px]', accentStyles[accentColor])} />

      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-[600] text-ink-3 uppercase tracking-[0.6px] mb-1">{title}</p>
          <p className="text-[40px] font-[500] font-mono tracking-[-3px] text-ink-1 leading-none">
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-ink-3 mt-1.5">{subtitle}</p>
          )}
        </div>
        <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center opacity-10', accentStyles[accentColor])}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  )
}
