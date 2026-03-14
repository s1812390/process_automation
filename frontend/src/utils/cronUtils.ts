/**
 * Computes the next scheduled run time for a 5-part cron expression.
 * Handles: *, star/step (*/n), comma lists, ranges, and literal values.
 * The calculation is done in the given IANA timezone.
 */

function fieldMatches(value: number, part: string): boolean {
  if (part === '*') return true
  if (part.startsWith('*/')) {
    const step = parseInt(part.slice(2), 10)
    if (isNaN(step) || step === 0) return false
    return value % step === 0
  }
  for (const seg of part.split(',')) {
    const trimmed = seg.trim()
    if (trimmed.includes('-')) {
      const [a, b] = trimmed.split('-').map(Number)
      if (value >= a && value <= b) return true
    } else {
      if (parseInt(trimmed, 10) === value) return true
    }
  }
  return false
}

function getPartsInTz(date: Date, timezone: string) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      minute: 'numeric',
      hour: 'numeric',
      day: 'numeric',
      month: 'numeric',
      weekday: 'short',
      hour12: false,
    })
    const parts = fmt.formatToParts(date)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    const getN = (type: string) => {
      const v = parseInt(get(type), 10)
      return isNaN(v) ? 0 : v
    }

    // hour12:false can give "24" for midnight — normalize
    let hour = getN('hour') % 24

    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dowStr = get('weekday') // "Mon", "Tue", etc.
    // "short" weekday in en-US: Sun Mon Tue Wed Thu Fri Sat
    const dow = weekdayNames.indexOf(dowStr)

    return {
      minute: getN('minute'),
      hour,
      day: getN('day'),
      month: getN('month'),
      dow: dow >= 0 ? dow : 0,
    }
  } catch {
    // fallback to local
    return {
      minute: date.getMinutes(),
      hour: date.getHours(),
      day: date.getDate(),
      month: date.getMonth() + 1,
      dow: date.getDay(),
    }
  }
}

export function getNextCronRun(expr: string, timezone: string): Date | null {
  if (!expr || !expr.trim()) return null
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const [minPart, hourPart, domPart, monthPart, dowPart] = parts

  // Start from the next full minute
  const now = new Date()
  const startMs = Math.ceil(now.getTime() / 60000) * 60000 + 60000

  // Search up to 1 week ahead (10080 minutes)
  for (let i = 0; i < 10080; i++) {
    const candidate = new Date(startMs + i * 60000)
    const p = getPartsInTz(candidate, timezone)

    if (
      fieldMatches(p.minute, minPart) &&
      fieldMatches(p.hour, hourPart) &&
      fieldMatches(p.day, domPart) &&
      fieldMatches(p.month, monthPart) &&
      fieldMatches(p.dow, dowPart)
    ) {
      return candidate
    }
  }
  return null
}

/**
 * Returns a human-readable short description of a cron expression.
 * Examples: "Every 5 min", "Daily at 09:00", "Every Mon at 09:00"
 */
export function describeCron(expr: string): string {
  if (!expr || !expr.trim()) return 'No schedule (manual only)'
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return 'Invalid cron expression'

  const [min, hour, dom, month, dow] = parts

  const timeStr =
    hour !== '*' && min !== '*' && !min.startsWith('*/')
      ? `at ${String(parseInt(hour, 10)).padStart(2, '0')}:${String(parseInt(min, 10)).padStart(2, '0')}`
      : ''

  // Every N minutes
  if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const n = min.slice(2)
    return `Every ${n} min`
  }

  // Every hour at :MM
  if (hour === '*' && dom === '*' && month === '*' && dow === '*' && !min.startsWith('*/')) {
    return `Every hour at :${String(parseInt(min, 10)).padStart(2, '0')}`
  }

  // Weekly — specific day(s)
  if (dow !== '*' && dom === '*' && month === '*') {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const days = dow
      .split(',')
      .map((d) => dayNames[parseInt(d.trim(), 10)] ?? d)
      .join(', ')
    return `Every ${days} ${timeStr}`.trim()
  }

  // Monthly
  if (dom !== '*' && dow === '*' && month === '*') {
    return `Monthly day ${dom} ${timeStr}`.trim()
  }

  // Daily
  if (dom === '*' && dow === '*' && month === '*' && hour !== '*') {
    return `Daily ${timeStr}`.trim()
  }

  return expr
}
