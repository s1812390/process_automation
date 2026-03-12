import { clsx } from 'clsx'

interface StatusBadgeProps {
  status: string
  className?: string
}

const statusConfig: Record<string, { bg: string; text: string; border: string; dot?: boolean }> = {
  running: {
    bg: 'bg-success-dim',
    text: 'text-success',
    border: 'border-success-mid',
    dot: true,
  },
  pending: {
    bg: 'bg-warning-dim',
    text: 'text-warning',
    border: 'border-warning-mid',
  },
  failed: {
    bg: 'bg-danger-dim',
    text: 'text-danger',
    border: 'border-danger/15',
  },
  timeout: {
    bg: 'bg-danger-dim',
    text: 'text-danger',
    border: 'border-danger/15',
  },
  success: {
    bg: 'bg-success-dim',
    text: 'text-success',
    border: 'border-success-mid',
  },
  cancelled: {
    bg: 'bg-bg',
    text: 'text-ink-3',
    border: 'border-[rgba(99,112,156,0.2)]',
  },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.cancelled

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-[700] font-mono',
        config.bg,
        config.text,
        config.border,
        className
      )}
    >
      {config.dot && (
        <span className={clsx('w-1.5 h-1.5 rounded-full bg-current pulse-dot')} />
      )}
      {status}
    </span>
  )
}
