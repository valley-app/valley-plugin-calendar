import { useCalendarDocuments } from './calendarDocuments'
import { React, api } from './runtime'
import type { EventRecord, ValleyGroup } from '@valley/plugin-sdk/types'
import { groupForName } from '@valley/plugin-sdk/groups'
import { useCalendarYear } from './hooks'
import { useNoteIndex } from './noteIndex'
import { useCalendarSettings } from './settingsStore'
import { useCalendarData } from './useCalendarData'
import { daysInRange } from './dateMath'
import { projectNoteDates, useNoteDateSources } from './noteDateStore'
import {
  activeYears,
  type NoteDateEntry
} from './noteDates'
import { eventToItem, noteDateToItem, sourcedToItem, type CalItem } from './items'
import { useCalendarSourceProviders, type SourcedItem, type CalendarSourceError } from './itemSources'
import { visibleItems, type ItemSourceOption } from './filters'
import { EVENTS_SOURCE_ID, NOTE_DATES_SOURCE_ID } from './settingsStore'
import { resolveItemColor } from './colors'
import { uiText } from './localization'

export interface CalendarItems {
  /** Items contributed by other plugins through `calendar.itemSource`. */
  sourced: SourcedItem[]
  events: EventRecord[]
  sourceErrors: CalendarSourceError[]
  documentErrors: string[]
  /** Every dated thing: contributed items, events and note-scraped dates. */
  items: CalItem[]
  itemsByDay: Map<string, CalItem[]>
  /** The materialized note-date entries. */
  noteDates: NoteDateEntry[]
  /** Everything currently feeding the surface, for the sources filter. */
  sourceOptions: ItemSourceOption[]
  /** Record totals for the shared group filter, keyed by group id. */
  groupCounts: Readonly<Record<string, number>>
  colorFor: (item: CalItem) => string
}

export function calendarItemColor(item: CalItem, groups: readonly ValleyGroup[]): string {
  if (item.color) return item.color
  if (item.groupId) {
    const group = groups.find((entry) => entry.id === item.groupId)
    if (group) return group.color
  }
  return resolveItemColor({ priority: item.priority, status: item.status })
}

/**
 * A multi-day event, as one entry per day it covers.
 *
 * Expanding here rather than in `itemsByDay` is deliberate: the week grid is fed
 * the flat `items` array filtered by `it.date` (`Calendar.tsx`), so a span
 * materialized only in the day map would be invisible there. Every copy keeps
 * the record's `id` and its `endDate`; only `date` and `occurrenceKey` differ.
 */
function expandSpan(item: CalItem, startDate: string, endDate: string): CalItem[] {
  if (!item.endDate) return [item]
  return daysInRange(item.date < startDate ? startDate : item.date, item.endDate > endDate ? endDate : item.endDate).map((day) => ({
    ...item,
    date: day,
    occurrenceKey: `${item.id}@${day}`
  }))
}

function linkedSlotKey(item: CalItem): string | null {
  if (!item.filePath) return null
  return [
    item.filePath,
    item.date,
    item.endDate ?? item.date,
    item.startTime ?? '',
    item.endTime ?? ''
  ].join('\u0000')
}

export function deduplicateCalendarItems(items: readonly CalItem[]): CalItem[] {
  const contributedSlots = new Set(
    items
      .filter((item) => item.kind === 'sourced')
      .map(linkedSlotKey)
      .filter((key): key is string => key !== null)
  )
  return items.filter((item) => {
    if (item.kind !== 'event' || item.event?.source || item.event?.endDate) return true
    const key = linkedSlotKey(item)
    return key === null || !contributedSlots.has(key)
  })
}

/**
 * The Calendar's single item layer — shared by the main Calendar and the Agenda
 * panel so there is one place that knows how contributed items, events and note
 * dates turn into `CalItem`s and which colour each one gets. Contributed items
 * arrive already normalized by their provider; nothing here knows which plugins
 * exist.
 *
 * Note dates are materialized for the years around today and the caller's
 * focused year, and rebuilt only when {@link noteDatesSignature} changes, so an
 * unrelated vault save costs one fingerprint pass and no new arrays.
 */
export function useCalendarItems(opts: { focusYear?: number; filePath?: string } = {}): CalendarItems {
  const { focusYear } = opts
  const currentYear = useCalendarYear()
  const { groups: calendarGroups, hiddenGroups, hiddenSources } = useCalendarSettings()
  const providers = useCalendarSourceProviders()
  const sources = useNoteDateSources()
  const indexEntries = useNoteIndex(sources)

  const years = React.useMemo(
    () => activeYears(new Date(currentYear, 0, 1), focusYear),
    [currentYear, focusYear]
  )
  const { sourced, events, sourceErrors } = useCalendarData(`${years[0]}-01-01`, `${years.at(-1)}-12-31`)

  const noteDates = React.useMemo(() => projectNoteDates(indexEntries, sources, years, focusYear ?? currentYear), [currentYear, focusYear, indexEntries, sources, years])

  const documents = useCalendarDocuments(`${years[0]}-01-01`, `${years.at(-1)}-12-31`, opts.filePath)

  const baseItems = React.useMemo<CalItem[]>(() => [
    ...documents.items,
    ...(!opts.filePath ? [
    ...sourced.map(sourcedToItem),
    ...events.map(eventToItem),
    ...noteDates.map(noteDateToItem)
    ] : [])
  ], [sourced, events, noteDates, documents.items, opts.filePath])

  const items = React.useMemo<CalItem[]>(() => {
    const out: CalItem[] = []
    for (const item of baseItems) out.push(...(item.kind === 'event' || item.kind === 'sourced' || item.kind === 'file' ? expandSpan(item, `${years[0]}-01-01`, `${years.at(-1)}-12-31`) : [item]))
    // One filter pass for every surface: the Calendar page and the Agenda panel
    // must never disagree about what the user switched off.
    return deduplicateCalendarItems(visibleItems(out, calendarGroups, hiddenGroups, hiddenSources))
  }, [baseItems, calendarGroups, hiddenGroups, hiddenSources, years])

  /**
   * What is on offer, whether or not it is currently switched on — a filter that
   * dropped its own "off" row would be impossible to undo.
   */
  const sourceOptions = React.useMemo<ItemSourceOption[]>(() => {
    const out: ItemSourceOption[] = [
      { id: EVENTS_SOURCE_ID, label: uiText('calendar.filter.events'), count: events.length + documents.items.filter(item => item.kind === 'file').length },
      { id: NOTE_DATES_SOURCE_ID, label: uiText('calendar.filter.noteDates'), count: noteDates.length + documents.items.filter(item => item.kind === 'noteDate').length }
    ]
    const seen = new Set<string>()
    for (const provider of providers) {
      if (seen.has(provider.sourceKey)) continue
      seen.add(provider.sourceKey)
      const localized = provider.integration?.localized?.[api.ui.language()]
      out.push({
        id: provider.sourceKey,
        label: localized?.name ?? provider.integration?.name ?? provider.owner,
        count: sourced.filter((item) => item.sourceOwner === provider.owner).length
      })
    }
    return out
  }, [events.length, noteDates.length, providers, sourced, documents.items])

  const groupCounts = React.useMemo<Readonly<Record<string, number>>>(() => {
    const counts: Record<string, number> = Object.fromEntries(calendarGroups.map((group) => [group.id, 0]))
    for (const item of baseItems) {
      const group = item.groupId
        ? calendarGroups.find((entry) => entry.id === item.groupId)
        : groupForName(calendarGroups, item.group)
      if (group) counts[group.id] = (counts[group.id] ?? 0) + 1
    }
    return counts
  }, [baseItems, calendarGroups])

  const colorFor = React.useCallback(
    (item: CalItem): string => calendarItemColor(item, calendarGroups),
    [calendarGroups]
  )

  const itemsByDay = React.useMemo(() => {
    const map = new Map<string, CalItem[]>()
    for (const it of items) {
      const list = map.get(it.date) ?? []
      list.push(it)
      map.set(it.date, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'))
    }
    return map
  }, [items])

  return { documentErrors: documents.errors, sourced, events, sourceErrors, items, itemsByDay, noteDates, sourceOptions, groupCounts, colorFor }
}
