/* Ported verbatim from js/core.js — the agent's status lines and the report
   both compare against these exact strings, so the formatting must not drift. */

/** 1234.6 -> "1,235" */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** -1234.6 -> "$1,235" (sign is dropped; callers add it) */
export function money(n: number): string {
  return '$' + fmt(Math.abs(n))
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
