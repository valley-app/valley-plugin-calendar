import { React, api } from './runtime'
import type { ValleyGroup } from '@valley/plugin-sdk/types'
import { normalizeGroups } from '@valley/plugin-sdk/groups'
import { globalGroups } from './groups'
import { LOCAL_GROUPS_KEY, mergedGroups, normalizeLocalGroups, type CalendarGroup, type LocalGroup } from './localGroups'
import { subscribeHostField } from './hooks'

/**
 * The Calendar plugin's persisted settings: event
 * shared groups, filters, and the day window for the week grid.
 */
export interface CalendarSettings {
  /** The shared groups, then Calendar's own groups — what every picker, filter and colour reads. */
  groups: CalendarGroup[]
  /** The app-wide registry alone. */
  sharedGroups: ValleyGroup[]
  /** Groups only Calendar uses (`localGroups` in Calendar's settings). */
  localGroups: LocalGroup[]
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
   * The groups the Groups section shows (18 Nov, Contacts' model): empty shows
   * everything, otherwise only items of the listed groups (a main group covers
   * its subgroups) and, with {@link NO_GROUP_ID}, the items without a group.
   * Until it is first written, a saved `hiddenGroups` list stands in for it.
   */
  groupFilter: string[]
  /**
   * Stable item-source keys the user has switched off.
   */
  hiddenSources: string[]
  /** Destination of a normal click on contributed Calendar content. */
  itemClickTarget: CalendarItemClickTarget
  /**
   * The Note dates switch on Settings → Calendar (18 Nov, like Map's Map pins
   * switch): off hides the Note dates page, the sidebar segment and tab and puts
   * no note date on the calendar; saved sources stay untouched.
   */
  noteDatesEnabled: boolean
  /** The Calendar page shows its period as a table (18 Nov, the page ⋯ menu's Table view). */
  tableView: boolean
}

export type CalendarItemClickTarget = 'owner' | 'agenda'

/** Both filter popovers write through these keys — one place, two surfaces. */
export const HIDDEN_GROUPS_KEY = 'hiddenGroups'
export const HIDDEN_SOURCES_KEY = 'hiddenSources'
export const GROUP_FILTER_KEY = 'groupFilter'
export const NOTE_DATES_ENABLED_KEY = 'noteDatesEnabled'
export const TABLE_VIEW_KEY = 'tableView'
export const GROUPS_SECTION_FOLDED_KEY = 'groupsSectionFolded'
export const COLLAPSED_GROUPS_KEY = 'collapsedGroups'
/** The Groups section's "No group" row: items that belong to no group. */
export const NO_GROUP_ID = 'calendar:noGroup'
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

/**
 * The saved selection, limited to groups that still exist. A filter saved
 * before 18 Nov listed the hidden groups instead: every main group that was not
 * hidden becomes selected, with No group (ungrouped items were never hidden).
 */
export function readGroupFilter(saved: unknown, legacyHidden: readonly string[], groups: readonly CalendarGroup[]): string[] {
  const ids = new Set(groups.map((group) => group.id))
  const selected = asStringArray(saved).filter((id) => id === NO_GROUP_ID || ids.has(id))
  if (selected.length || asStringArray(saved).length || !legacyHidden.length) return [...new Set(selected)]
  const hidden = new Set(legacyHidden)
  const mains = groups.filter((group) => group.parent === undefined)
  if (mains.every((group) => !hidden.has(group.id))) return []
  return [...mains.filter((group) => !hidden.has(group.id)).map((group) => group.id), NO_GROUP_ID]
}

/** Save the Groups selection; the legacy hidden list is emptied with it, so it never comes back. */
export async function saveGroupFilter(selected: readonly string[]): Promise<boolean> {
  const next = [...new Set(selected)]
  const saved = await api.settings.set(GROUP_FILTER_KEY, next)
  if (!saved.ok) return false
  if (asStringArray(api.settings.get()[HIDDEN_GROUPS_KEY]).length) await api.settings.set(HIDDEN_GROUPS_KEY, [])
  return true
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
  const sharedGroups = normalizeGroups(globalGroups())
  const localGroups = normalizeLocalGroups(s[LOCAL_GROUPS_KEY], sharedGroups)
  const groups = mergedGroups(sharedGroups, localGroups)
  const hiddenGroups = asStringArray(s.hiddenGroups)
  return {
    groups,
    sharedGroups,
    localGroups,
    dayStartHour,
    dayEndHour: asDayEndHour(s.dayEndHour, dayStartHour),
    hiddenGroups,
    groupFilter: readGroupFilter(s[GROUP_FILTER_KEY], hiddenGroups, groups),
    hiddenSources: asStringArray(s.hiddenSources).filter((id) => !id.startsWith('provider-')),
    itemClickTarget: asItemClickTarget(s.itemClickTarget),
    noteDatesEnabled: s[NOTE_DATES_ENABLED_KEY] !== false,
    tableView: s[TABLE_VIEW_KEY] === true
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
