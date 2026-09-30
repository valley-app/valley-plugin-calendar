// Date helpers for the calendar views. The week-start-aware grid math is shared
// with the core `DateField` popover and lives in `@valley/plugin-sdk/dateGrid`; only the
// calendar-specific helpers are defined here.

import { isoDay, parseLocalDate } from '@valley/plugin-sdk/dateGrid'

export {
  WEEKDAY_LABELS,
  MONTH_SHORT,
  localizedWeekday,
  localizedMonth,
  isoWeek,
  sameDay,
  weekdayOffset,
  startOfWeek,
  monthGrid,
  orderedWeekdays,
  orderedWeekdayIndices,
  isoDay,
  parseLocalDate
} from '@valley/plugin-sdk/dateGrid'

// ── day-range helpers ───────────────────────────────────────────────────────

/**
 * A multi-day event is materialized one chip per day, so the length of a span is
 * a length of a list. A typo in the end date must therefore cost a clamped list
 * and not a hang — a year is already far past what any surface can draw.
 */
export const MAX_SPAN_DAYS = 366

/** `from` shifted by `days`, as an ISO day. Local time, like every date here. */
export function addDays(from: string, days: number): string {
  const date = parseLocalDate(from)
  date.setDate(date.getDate() + days)
  return isoDay(date)
}

/** Whole days from `from` to `to` — negative when `to` is the earlier one. */
export function daysBetween(from: string, to: string): number {
  const start = parseLocalDate(from)
  const end = parseLocalDate(to)
  // Compare at noon: a DST boundary between the two makes the raw millisecond
  // difference 23 or 25 hours, and `Math.round` on 23/24 would still land right
  // while a `floor` would not.
  start.setHours(12, 0, 0, 0)
  end.setHours(12, 0, 0, 0)
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

/**
 * Every day from `from` to `to` inclusive. `[from]` when there is no end, when
 * the end is the same day, or when it is earlier — the three ways an event says
 * "one day".
 */
export function daysInRange(from: string, to?: string): string[] {
  if (!from) return []
  if (!to || to <= from) return [from]
  const span = Math.min(daysBetween(from, to), MAX_SPAN_DAYS - 1)
  const out: string[] = []
  for (let i = 0; i <= span; i++) out.push(addDays(from, i))
  return out
}

// ── time helpers ────────────────────────────────────────────────────────────

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map((n) => parseInt(n, 10))
  return (h || 0) * 60 + (m || 0)
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
