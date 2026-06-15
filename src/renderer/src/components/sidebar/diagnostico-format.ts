// Small display formatters shared by the Incidencias list and the detail panel.

export function formatRelative(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) {
    return 'hace un momento'
  }
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) {
    return `hace ${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `hace ${hours} h`
  }
  return `hace ${Math.floor(hours / 24)} d`
}

/** Duration as `m:ss` (or `Xh Ym` past an hour). */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Compact token count, e.g. 1234 → 1.2k. */
export function formatTokens(n: number): string {
  if (n < 1000) {
    return String(n)
  }
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`
}
