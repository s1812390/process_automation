/**
 * Parse a datetime string as UTC.
 * Backend should always return "Z"-suffixed UTC strings, but this guards
 * against strings that lack any timezone marker (treats them as UTC).
 */
export function parseUTC(s: string | Date): Date {
  if (s instanceof Date) return s
  // Already has explicit timezone info (Z, +HH:MM, -HH:MM)
  if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s)
  // No timezone marker — backend stores UTC, so append Z
  return new Date(s + 'Z')
}
