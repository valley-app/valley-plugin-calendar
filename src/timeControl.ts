import { React, api } from './runtime'
import type { CalendarViewMode, SlotId, TimeControlState } from '@valley/plugin-sdk/types'
import { defaultTimeControl, isTimeControlDate, normalizeTimeControl } from '@valley/plugin-sdk/timeControl'

export type { CalendarViewMode, TimeControlState } from '@valley/plugin-sdk/types'
export { defaultTimeControl } from '@valley/plugin-sdk/timeControl'

/**
 * Plugin-side view of the shared calendar selection. The store itself is
 * core-owned (persisted through IPC to
 * `.valley/state/timecontrol.json`) because AppState mirrors it onto the
 * dashboard timeframe takeover; the plugin reads and writes it through the SDK
 * (`api.workspace.getTimeControl` / `patchTimeControl` / `onTimeControlChanged`).
 */

export interface CalendarLinkState extends TimeControlState, Record<string, unknown> {
  v: 1
}

export function calendarLinkState(value: TimeControlState): CalendarLinkState {
  return { v: 1, ...value }
}

export function calendarLinkPatch(raw: Record<string, unknown>): Partial<TimeControlState> | null {
  if (raw.v !== 1 || (raw.view !== 'month' && raw.view !== 'week' && raw.view !== 'year')) return null
  if (!isTimeControlDate(raw.cursor)) return null
  return normalizeTimeControl(raw)
}

export function calendarViewMode(surface: SlotId, fallback: CalendarViewMode): CalendarViewMode {
  const value = api.settings.get()[surface === 'right_sidebar' ? 'sidebarView' : 'mainView']
  return value === 'week' || value === 'month' || value === 'year' ? value : fallback
}

export function saveCalendarViewMode(surface: SlotId, view: CalendarViewMode): void {
  void api.settings.set(surface === 'right_sidebar' ? 'sidebarView' : 'mainView', view)
}

export function useTimeControl(surface?: SlotId): [TimeControlState, (patch: Partial<TimeControlState>) => void] {
  const [tc, setTc] = React.useState<TimeControlState>(defaultTimeControl)

  React.useEffect(() => {
    let cancelled = false
    let changed = false
    void api.workspace.getTimeControl().then((value) => {
      if (!cancelled && !changed) setTc(surface ? { ...value, view: calendarViewMode(surface, value.view) } : value)
    })
    const off = api.workspace.onTimeControlChanged((next) => {
      changed = true
      setTc(current => surface ? { ...next, view: current.view } : next)
    })
    const offSettings = surface ? api.settings.subscribe(() => {
      setTc(current => ({ ...current, view: calendarViewMode(surface, current.view) }))
    }) : undefined
    return () => {
      cancelled = true
      off()
      offSettings?.()
    }
  }, [surface])

  const patch = React.useCallback((p: Partial<TimeControlState>) => {
    setTc((current) => ({ ...current, ...p }))
    if (surface && p.view) saveCalendarViewMode(surface, p.view)
    const { view: _view, ...dates } = p
    const shared = surface ? dates : p
    if (Object.keys(shared).length) void api.workspace.patchTimeControl(shared)
  }, [surface])

  return [tc, patch]
}

/** Inclusive list of `YYYY-MM-DD` days in `[start, end]` (order-independent). */
export function rangeDays(start: string, end: string): string[] {
  const a = new Date(`${start}T00:00:00`)
  const b = new Date(`${end}T00:00:00`)
  const lo = a <= b ? a : b
  const hi = a <= b ? b : a
  const days: string[] = []
  for (const d = new Date(lo); d <= hi; d.setDate(d.getDate() + 1)) {
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    days.push(`${d.getFullYear()}-${mm}-${dd}`)
  }
  return days
}
