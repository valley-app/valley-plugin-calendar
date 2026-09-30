import { React, api } from './runtime'
import type { ValleyGroup } from '@valley/plugin-sdk/types'
import { normalizeGroups } from '@valley/plugin-sdk/groups'
import { globalGroups } from './groups'
import { subscribeHostField } from './hooks'

/**
 * The Calendar plugin's persisted settings: event
 * shared groups, filters, and the day window for the week grid.
 */
export interface CalendarSettings {
  /** The app-wide registry; Calendar never owns a second list. */
  groups: ValleyGroup[]
  /**
   * The hours the week grid opens on. A *default* window, not a clamp: an item
   * that starts before `dayStartHour` or ends after `dayEndHour` still renders,
   * and the grid grows to reach it (see `WeekGrid.tsx#gridHourWindow`). Storing
   * the pair rather than a height keeps "my day is 07–22" true on every screen.
   */
  dayStartHour: number
  dayEndHour: number
  /**
   * Group ids the user has switched off. Persisted rather than held per surface:
   * the Calendar page and the Agenda panel are two views of one filter, so
   * hiding "Pixar" in either has to hide it in both.
   */
  hiddenGroups: string[]
  /**
   * Stable item-source keys the user has switched off.
   */
  hiddenSources: string[]
  /** Destination of a normal click on contributed Calendar content. */
  itemClickTarget: CalendarItemClickTarget
}

export type CalendarItemClickTarget = 'owner' | 'agenda'

/** Both filter popovers write through these keys — one place, two surfaces. */
export const HIDDEN_GROUPS_KEY = 'hiddenGroups'
export const HIDDEN_SOURCES_KEY = 'hiddenSources'
export const ITEM_CLICK_TARGET_KEY = 'itemClickTarget'

/** The two sources the Calendar owns itself; plugin source keys use their owner id. */
export const EVENTS_SOURCE_ID = 'calendar:events'
export const NOTE_DATES_SOURCE_ID = 'calendar:noteDates'
export const providerSourceKey = (owner: string): string => `calendar:plugin:${owner}`

export const DEFAULT_DAY_START_HOUR = 7
export const DEFAULT_DAY_END_HOUR = 22
export const DEFAULT_ITEM_CLICK_TARGET: CalendarItemClickTarget = 'owner'

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function asHour(value: unknown, fallback: number, max = 23): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max) {
    return Math.round(value)
  }
  return fallback
}

function asItemClickTarget(value: unknown): CalendarItemClickTarget {
  return value === 'agenda' || value === 'owner' ? value : DEFAULT_ITEM_CLICK_TARGET
}

/**
 * The end hour must stay above the start hour, or the grid has no rows at all.
 * Narrowing to a single hour is the mildest repair: it keeps whichever value the
 * user just typed and never silently rewrites the other one on disk.
 */
function asDayEndHour(value: unknown, startHour: number): number {
  const hour = asHour(value, DEFAULT_DAY_END_HOUR, 24)
  return hour > startHour ? hour : Math.min(startHour + 1, 24)
}

/** Read the current settings snapshot, defaulting missing or invalid values. */
export function readCalendarSettings(): CalendarSettings {
  const s = api.settings.get()
  const dayStartHour = asHour(s.dayStartHour, DEFAULT_DAY_START_HOUR)
  return {
    groups: normalizeGroups(globalGroups()),
    dayStartHour,
    dayEndHour: asDayEndHour(s.dayEndHour, dayStartHour),
    hiddenGroups: asStringArray(s.hiddenGroups),
    hiddenSources: asStringArray(s.hiddenSources).filter((id) => !id.startsWith('provider-')),
    itemClickTarget: asItemClickTarget(s.itemClickTarget)
  }
}

/**
 * Subscribe a view to this plugin's owner-scoped settings.
 */
export function useCalendarSettings(): CalendarSettings {
  const [settings, setSettings] = React.useState<CalendarSettings>(readCalendarSettings)
  React.useEffect(() => {
    const refresh = (): void => setSettings(readCalendarSettings())
    const offSettings = api.settings.subscribe(refresh)
    const off = subscribeHostField('groups', refresh)
    return () => {
      offSettings()
      off()
    }
  }, [])
  return settings
}
