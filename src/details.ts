import { WORKSPACE_DETAILS_V1, type WorkspaceDetailItem, type WorkspaceDetailValue, type WorkspaceDetailsProvider } from '@valley/plugin-sdk'
import type { TimeControlState } from '@valley/plugin-sdk/types'
import { api } from './runtime'
import type { CalItem } from './items'
import { addDays, isoDay, isoWeek, localizedMonth, parseLocalDate, startOfWeek } from './dateMath'
import { WEEK_START_INDEX } from './lib'
import { uiText } from './localization'

/**
 * Calendar's Footer details and Info rows (18 Nov): the shown period, the
 * selected day, entry counts for today, this week and this month, the next
 * entry, how much of today is booked, open and overdue tasks, events, note
 * dates this month and the number of groups. The footer reads
 * "name · value"; Info lists the same rows with the bare value.
 */
const ROWS = ['period', 'selected', 'today', 'week', 'month', 'next', 'busyToday', 'openTasks', 'overdue', 'events', 'noteDates', 'groups'] as const
type Row = typeof ROWS[number]

const ENGLISH: Record<Row, string> = {
  period: 'Shown period', selected: 'Selected day', today: 'Today', week: 'This week', month: 'This month', next: 'Next',
  busyToday: 'Booked today', openTasks: 'Open tasks', overdue: 'Overdue', events: 'Events', noteDates: 'Note dates this month', groups: 'Groups'
}

interface DetailsFeed { items: readonly CalItem[]; groups: number; listeners: Set<() => void> }

function feed(): DetailsFeed {
  return api.runtime.getOrCreate('calendar.detailsFeed', () => ({ items: [], groups: 0, listeners: new Set() }))
}

/** The entries a Calendar surface shows, after its filters; the footer and Info count from the latest. */
export function publishCalendarItems(items: readonly CalItem[], groups: number): void {
  const current = feed()
  if (current.items === items && current.groups === groups) return
  current.items = items
  current.groups = groups
  for (const listener of [...current.listeners]) listener()
}

const minutesOf = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

function hoursLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60), rest = minutes % 60
  return [hours ? uiText('calendar.card.hours', { count: hours }) : '', rest || !hours ? uiText('calendar.card.minutes', { count: rest }) : ''].filter(Boolean).join(' ')
}

function periodLabel(time: TimeControlState): string {
  const cursor = parseLocalDate(time.cursor)
  const language = api.ui.language()
  if (time.view === 'year') return String(cursor.getFullYear())
  if (time.view === 'week') {
    const start = startOfWeek(parseLocalDate(time.selectedDate ?? time.cursor), WEEK_START_INDEX[api.getState().weekStart] ?? 1)
    return `W${isoWeek(start)} ${start.getFullYear()}`
  }
  return `${localizedMonth(cursor.getMonth(), language)} ${cursor.getFullYear()}`
}

export function calendarDetailValues(items: readonly CalItem[], groups: number, time: TimeControlState, now = new Date()): Record<Row, WorkspaceDetailValue> {
  const today = isoDay(now)
  const weekStart = isoDay(startOfWeek(now, WEEK_START_INDEX[api.getState().weekStart] ?? 1))
  const weekEnd = addDays(weekStart, 6)
  const month = today.slice(0, 7)
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const seen = new Set<string>()
  const counts = { today: 0, week: 0, month: 0, openTasks: 0, overdue: 0, events: 0, noteDates: 0 }
  let busy = 0
  let next: CalItem | null = null
  for (const item of items) {
    const key = `${item.kind}:${item.sourceId ?? ''}:${item.id}:${item.date}`
    if (seen.has(key)) continue
    seen.add(key)
    if (item.date === today) counts.today++
    if (item.date >= weekStart && item.date <= weekEnd) counts.week++
    if (item.date.startsWith(month)) counts.month++
    if (item.kind === 'event' || item.kind === 'file') counts.events++
    if (item.kind === 'noteDate' && item.date.startsWith(month)) counts.noteDates++
    if (item.kind === 'sourced' && item.completed === false) {
      counts.openTasks++
      if ((item.endDate ?? item.date) < today) counts.overdue++
    }
    if (item.date === today && item.startTime && item.endTime && minutesOf(item.endTime) > minutesOf(item.startTime)) busy += minutesOf(item.endTime) - minutesOf(item.startTime)
    const upcoming = item.date > today || (item.date === today && (item.startTime ?? '24:00') >= clock)
    if (upcoming && !item.completed && (!next || item.date < next.date || (item.date === next.date && (item.startTime ?? '24:00') < (next.startTime ?? '24:00')))) next = item
  }
  const line = (row: Row, value: string | number): WorkspaceDetailValue => ({ text: `${uiText(`calendar.details.${row}`)} · ${value}`, value })
  const selected = time.selectedDate ? parseLocalDate(time.selectedDate).toLocaleDateString(api.ui.language(), { weekday: 'short', day: 'numeric', month: 'short' }) : ''
  const nextText = next
    ? [next.title, next.date === today ? next.startTime ?? uiText('calendar.card.allDay') : parseLocalDate(next.date).toLocaleDateString(api.ui.language(), { weekday: 'short', day: 'numeric', month: 'short' }) + (next.startTime ? ` ${next.startTime}` : '')].join(' · ')
    : uiText('calendar.details.nothingNext')
  return {
    period: line('period', periodLabel(time)),
    selected: selected ? line('selected', selected) : { text: '', value: '', available: false },
    today: line('today', counts.today),
    week: line('week', counts.week),
    month: line('month', counts.month),
    next: line('next', nextText),
    busyToday: line('busyToday', hoursLabel(busy)),
    openTasks: line('openTasks', counts.openTasks),
    overdue: line('overdue', counts.overdue),
    events: line('events', counts.events),
    noteDates: line('noteDates', counts.noteDates),
    groups: line('groups', groups)
  }
}

export function registerCalendarDetails(getTime: () => TimeControlState, subscribeTime: (listener: () => void) => () => void): () => void {
  const listeners = new Set<() => void>()
  let cached: { items: readonly CalItem[]; groups: number; time: TimeControlState; minute: string; language: string; snapshot: { items: Record<string, WorkspaceDetailValue> } } | null = null
  const items: WorkspaceDetailItem[] = [
    { id: 'title', label: 'Title', labelKey: 'calendar.details.title', kind: 'text' },
    ...ROWS.map((id) => ({ id, label: ENGLISH[id], labelKey: `calendar.details.${id}`, kind: 'text' as const }))
  ]
  const provider: WorkspaceDetailsProvider = {
    id: 'calendar.details', label: 'Calendar', labelKey: 'manifest.name', pluginViews: true,
    items,
    defaultItems: ['title', 'today', 'next'],
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => {
      const { items: entries, groups } = feed(), time = getTime(), now = new Date()
      const minute = `${isoDay(now)} ${now.getHours()}:${now.getMinutes()}`, language = api.ui.language()
      if (!cached || cached.items !== entries || cached.groups !== groups || cached.time !== time || cached.minute !== minute || cached.language !== language) {
        cached = { items: entries, groups, time, minute, language, snapshot: { items: calendarDetailValues(entries, groups, time, now) } }
      }
      return cached.snapshot
    }
  }
  const off = api.interop.extensions.provide(WORKSPACE_DETAILS_V1, provider)
  const refresh = (): void => { for (const listener of [...listeners]) listener() }
  const shared = feed()
  shared.listeners.add(refresh)
  const offTime = subscribeTime(refresh)
  // "Next" and "Booked today" move with the clock.
  const timer = setInterval(refresh, 60_000)
  return () => { clearInterval(timer); shared.listeners.delete(refresh); offTime(); off(); listeners.clear() }
}
