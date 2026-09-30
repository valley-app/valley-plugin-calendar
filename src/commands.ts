/**
 * The calendar plugin's command-bus surface. `calendar:add` is a write command:
 * it uses the **raw** event op and returns a `revert`, so the bus owns the single
 * ⌘Z entry. The navigation commands (goto/set-view/today) drive the shared time
 * selection via `api.workspace.patchTimeControl` and return the new
 * `TimeControlState`; `list` returns structured `EventRecord[]`. All of those are
 * `read` (ephemeral / query, not undoable).
 */
import type { CalendarViewMode, EventRecord, TimeControlState, DataRecord } from '@valley/plugin-sdk/types'
import type { ValleyPluginApi, CalendarItemPatch } from '@valley/plugin-sdk'
import { loadEvents, newEvent, normalizeEventRecord, rawAppend, rawDelete, rawUpdate } from './events'
import { listSourcedItems, sourceDescriptors, sourcedItemActions, updateSourcedItem, removeSourcedItem, createSourcedItem, runSourcedItemAction } from './itemSources'
import { eventToItem, sourcedToItem, requestCalendarItemEdit, type CalItem } from './items'
import { addDays, daysBetween } from './dateMath'

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '')

function todayIso(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** First-of-month anchor (`YYYY-MM-01`) for a `YYYY-MM-DD` date — the cursor shape. */
const monthAnchor = (date: string): string => `${date.slice(0, 7)}-01`
/** Extract `YYYY-MM-DD` from a date or full ISO string. */
const datePart = (v: string): string | undefined => v.match(/\d{4}-\d{2}-\d{2}/)?.[0]
/** Extract `HH:MM` from a time or full ISO string. */
const timePart = (v: string): string | undefined => v.match(/\d{1,2}:\d{2}/)?.[0]

const VIEWS: CalendarViewMode[] = ['month', 'week', 'year']

const eventText = { type: 'string' }
export const calendarValuesSchema = { type: 'object', additionalProperties: false, properties: {
  ...Object.fromEntries(['title', 'date', 'endDate', 'startTime', 'endTime', 'groupId', 'group', 'note', 'filePath', 'priority'].map((key) => [key, eventText])),
  completed: { type: 'boolean' },
  ...Object.fromEntries(['tags', 'urls', 'attachments'].map((key) => [key, { type: 'array', items: eventText }])),
  location: { oneOf: [{ type: 'null' }, { type: 'object', required: ['name'], additionalProperties: false, properties: { name: eventText, lng: { type: 'number', minimum: -180, maximum: 180 }, lat: { type: 'number', minimum: -90, maximum: 90 } } }] }
} }
export interface CalendarTarget { id: string; sourceId?: string }
export function parseCalendarTarget(raw: unknown): CalendarTarget {
  const input = raw as Record<string, unknown> | null
  if (!input || typeof input.id !== 'string' || !input.id.trim() || (input.sourceId !== undefined && typeof input.sourceId !== 'string')) throw new Error('Expected a calendar item id and optional source id.')
  return { id: input.id, sourceId: typeof input.sourceId === 'string' && input.sourceId ? input.sourceId : undefined }
}
export function parseCalendarValues(raw: unknown): CalendarItemPatch & { endDate?: string; groupId?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected calendar item values.')
  const values = raw as Record<string, unknown>
  for (const [key, value] of Object.entries(values)) {
    if (!(key in calendarValuesSchema.properties)) throw new Error(`Unsupported calendar property "${key}".`)
    if (key === 'completed') { if (typeof value !== 'boolean') throw new Error('Expected a completion flag.') }
    else if (['tags', 'urls', 'attachments'].includes(key)) { if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) throw new Error(`Expected a text list for "${key}".`) }
    else if (key === 'location') {
      if (value !== null) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid location.')
        const point = value as Record<string, unknown>
        if (typeof point.name !== 'string' || Object.keys(point).some((field) => !['name', 'lng', 'lat'].includes(field)) || (point.lng !== undefined && (typeof point.lng !== 'number' || !Number.isFinite(point.lng) || Math.abs(point.lng) > 180)) || (point.lat !== undefined && (typeof point.lat !== 'number' || !Number.isFinite(point.lat) || Math.abs(point.lat) > 90)) || (point.lng === undefined) !== (point.lat === undefined)) throw new Error('Invalid location.')
      }
    } else if (typeof value !== 'string') throw new Error(`Expected text for "${key}".`)
  }
  if (typeof values.title === 'string' && !values.title.trim()) throw new Error('An event title cannot be empty.')
  for (const key of ['date', 'endDate']) if (values[key] && !/^\d{4}-\d{2}-\d{2}$/.test(String(values[key]))) throw new Error('Invalid calendar date.')
  for (const key of ['startTime', 'endTime']) if (values[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(values[key]))) throw new Error('Invalid calendar time.')
  return values as CalendarItemPatch & { endDate?: string; groupId?: string }
}
export async function resolveCalendarTarget(target: CalendarTarget): Promise<CalItem> {
  if (target.sourceId) {
    if (!sourceDescriptors().some((source) => source.sourceId === target.sourceId)) throw new Error('The calendar item provider is unavailable.')
    const sourced = (await listSourcedItems(true)).find((entry) => entry.sourceId === target.sourceId && entry.item.id === target.id)
    if (sourced) return sourcedToItem(sourced)
  } else {
    const local = (await loadEvents()).find((entry) => entry.id === target.id)
    if (local) return eventToItem(local)

  }
  throw new Error('The calendar item no longer exists.')
}
export async function editCalendarValues(target: CalendarTarget, values: ReturnType<typeof parseCalendarValues>, expectedUpdatedAt?: string) {
  const item = await resolveCalendarTarget(target)
  if (item.readOnly) throw new Error('This calendar item is read-only.')
  if (target.sourceId) {
    if (values.groupId !== undefined) throw new Error('This calendar source uses group names.')
    const patch = item.sourced?.endDate && values.date !== undefined && values.endDate === undefined
      ? { ...values, endDate: addDays(item.sourced.endDate, daysBetween(item.sourced.date, values.date)) }
      : values
    if (!(await updateSourcedItem(target.sourceId, target.id, patch))) throw new Error('Could not save the calendar source item.')
    return { value: await resolveCalendarTarget(target), revert: null }
  }
  const previous = item.event!
  if (expectedUpdatedAt !== undefined && previous.updatedAt !== expectedUpdatedAt) throw new Error('This event changed elsewhere. Reload it before saving; your draft is preserved.')
  if (values.completed !== undefined || values.priority !== undefined || values.group !== undefined) throw new Error('Events use groupId and do not have a task status or priority.')
  const next = normalizeEventRecord({ ...previous, ...values, allDay: !(values.startTime ?? previous.startTime) && !(values.endTime ?? previous.endTime), updatedAt: new Date().toISOString() } as unknown as DataRecord)
  if (!next.date || (values.endDate && values.endDate < next.date)) throw new Error('The event end date must follow its start date.')
  if (values.filePath && next.filePath !== values.filePath) throw new Error('Invalid event file path.')
  for (const key of ['urls', 'attachments'] as const) if (values[key]?.some((value) => !next[key]?.includes(value))) throw new Error(`Invalid event ${key}.`)
  if (!(await rawUpdate(target.id, next, previous.updatedAt))) throw new Error('Could not save the event.')
  return { value: eventToItem(next), revert: { label: `Edit “${previous.title}”`, run: async () => { if (!(await rawUpdate(target.id, previous))) throw new Error('Could not restore the event.') }, reapply: async () => { if (!(await rawUpdate(target.id, next))) throw new Error('Could not reapply the event edit.') } } }
}

export async function calendarCommandRevision(raw: unknown): Promise<unknown> {
  const input = (raw ?? {}) as { target?: CalendarTarget; id?: string; sourceId?: string }
  const target = input.target ?? (input.id ? { id: input.id, sourceId: input.sourceId } : undefined)
  if (target) return resolveCalendarTarget(target)
  return input.sourceId ? sourceDescriptors().find((source) => source.sourceId === input.sourceId) ?? null : { day: todayIso() }
}

/** Register every `calendar:*` command; returns a combined disposer. */
export function registerCalendarCommands(api: ValleyPluginApi): () => void {
  const offs = [
    api.commands.register({ id: 'list-items', label: 'Calendar: List all items', labelKey: 'calendar.command.listItems', paletteSafe: false, sideEffect: 'read', input: { schema: { type: 'object', properties: { from: eventText, to: eventText, sourceId: eventText }, additionalProperties: false }, parse: (raw) => { const input = (raw ?? {}) as Record<string, unknown>; for (const key of ['from', 'to', 'sourceId']) if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error('Expected calendar filter text.'); return { from: asStr(input.from), to: asStr(input.to), sourceId: asStr(input.sourceId) } } }, run: async ({ from, to, sourceId }) => {
      const local = (await loadEvents()).map(eventToItem)
      const contributed = (await listSourcedItems(true, from || '0001-01-01', to || '9999-12-31')).map(sourcedToItem)
      return [...local, ...contributed].filter((item) => (!from || (item.endDate ?? item.date) >= from) && (!to || item.date <= to) && (!sourceId || item.sourceId === sourceId))
    } }),
    api.commands.register({ id: 'source-actions', label: 'Calendar: List source item actions', labelKey: 'calendar.command.sourceActions', paletteSafe: false, sideEffect: 'read', input: { schema: { type: 'object', properties: { id: eventText, sourceId: eventText }, required: ['id', 'sourceId'], additionalProperties: false }, parse: (raw) => { const target = parseCalendarTarget(raw); if (!target.sourceId) throw new Error('Expected a source id.'); return { id: target.id, sourceId: target.sourceId } } }, run: async ({ id, sourceId }) => { await resolveCalendarTarget({ id, sourceId }); return sourcedItemActions(sourceId, id) } }),
    api.commands.register({ id: 'get', label: 'Calendar: Get item', labelKey: 'calendar.command.get', paletteSafe: false, sideEffect: 'read', input: { schema: { type: 'object', properties: { id: eventText, sourceId: eventText }, required: ['id'], additionalProperties: false }, parse: parseCalendarTarget }, run: resolveCalendarTarget }),
    api.commands.register({ id: 'open', label: 'Calendar: Open item', labelKey: 'calendar.command.open', paletteSafe: false, sideEffect: 'read', input: { schema: { type: 'object', properties: { id: eventText, sourceId: eventText }, required: ['id'], additionalProperties: false }, parse: parseCalendarTarget }, run: async (target) => { const item = await resolveCalendarTarget(target); requestCalendarItemEdit(item); return item } }),
    api.commands.register({
      id: 'edit-fields',
      label: 'Calendar: Edit item fields',
      labelKey: 'calendar.command.editFields',
      paletteSafe: false,
      sideEffect: 'write',
      input: { schema: { type: 'object', properties: { id: eventText, sourceId: eventText, values: calendarValuesSchema, expectedUpdatedAt: eventText }, required: ['id', 'values'], additionalProperties: false }, parse: (raw) => { const input = raw as Record<string, unknown>; const target = parseCalendarTarget(raw); if (input.expectedUpdatedAt !== undefined && typeof input.expectedUpdatedAt !== 'string') throw new Error('Expected an event revision.'); return { target, values: parseCalendarValues(input.values), expectedUpdatedAt: input.expectedUpdatedAt as string | undefined } } },
      run: ({ target, values, expectedUpdatedAt }) => editCalendarValues(target, values, expectedUpdatedAt),
      revision: (input) => calendarCommandRevision(input),
      preview: (input) => ({ changes: input })
    }),
    api.commands.register({
      id: 'delete',
      label: 'Calendar: Delete item',
      labelKey: 'calendar.command.delete',
      paletteSafe: false,
      sideEffect: 'write',
      input: { schema: { type: 'object', properties: { id: eventText, sourceId: eventText }, required: ['id'], additionalProperties: false }, parse: parseCalendarTarget },
      run: async (target) => {
      const item = await resolveCalendarTarget(target)
      if (item.readOnly) throw new Error('This calendar item is read-only.')
      if (target.sourceId) { if (!(await removeSourcedItem(target.sourceId, target.id))) throw new Error('Could not delete the calendar source item.'); return { value: item, revert: null } }
      if (!(await rawDelete(target.id))) throw new Error('Could not delete the event.')
      return { value: item, revert: { label: `Delete “${item.title}”`, run: async () => { if (!(await rawAppend(item.event!))) throw new Error('Could not restore the event.') } } }
    },
      revision: (input) => calendarCommandRevision(input),
      preview: (input) => ({ changes: input })
    }),
    api.commands.register({ id: 'sources', label: 'Calendar: List item sources', labelKey: 'calendar.command.sources', paletteSafe: false, sideEffect: 'read', run: () => sourceDescriptors() }),
    api.commands.register({
      id: 'source-create',
      label: 'Calendar: Create source item',
      labelKey: 'calendar.command.sourceCreate',
      paletteSafe: false,
      sideEffect: 'write',
      input: { schema: { type: 'object', properties: { sourceId: eventText, date: eventText, values: calendarValuesSchema }, required: ['sourceId', 'date', 'values'], additionalProperties: false }, parse: (raw) => { const input = raw as Record<string, unknown>; if (typeof input?.sourceId !== 'string' || !input.sourceId || typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Expected a source id and date.'); const values = parseCalendarValues(input.values); if (!values.title?.trim() || values.endDate !== undefined || values.groupId !== undefined) throw new Error('Expected source item title and supported values.'); return { sourceId: input.sourceId, date: input.date, values } } },
      run: async ({ sourceId, date, values }) => { if (!(await createSourcedItem(sourceId, date, values))) throw new Error('Could not create the source item.'); return { value: true, revert: null } },
      revision: (input) => calendarCommandRevision(input),
      preview: (input) => ({ changes: input })
    }),
    api.commands.register({
      id: 'source-action',
      label: 'Calendar: Run source item action',
      labelKey: 'calendar.command.sourceAction',
      paletteSafe: false,
      sideEffect: 'write',
      input: { schema: { type: 'object', properties: { sourceId: eventText, id: eventText, actionId: eventText }, required: ['sourceId', 'id', 'actionId'], additionalProperties: false }, parse: (raw) => { const input = raw as Record<string, unknown>; const target = parseCalendarTarget(raw); if (!target.sourceId || typeof input.actionId !== 'string' || !input.actionId) throw new Error('Expected a source and action id.'); return { sourceId: target.sourceId, id: target.id, actionId: input.actionId } } },
      run: async ({ sourceId, id, actionId }) => { await resolveCalendarTarget({ sourceId, id }); if (!(await runSourcedItemAction(sourceId, id, actionId))) throw new Error('Could not run the source item action.'); return { value: true, revert: null } },
      revision: (input) => calendarCommandRevision(input),
      preview: (input) => ({ changes: input })
    }),

    api.commands.register({
      id: 'open-page',
      label: 'Open Calendar page', labelKey: 'auto.b29a9852d77e',
      sideEffect: 'read',
      run: () => {
        api.workspace.openMainTab()
        return undefined
      },
      formatCli: () => 'Opened calendar page.'
    }),

    api.commands.register({
      id: 'add',
      label: 'Calendar: Add an event',
      labelKey: 'auto.e16f07326a18',
      paletteSafe: false,
      sideEffect: 'write',
      input: {
        schema: {"type":"object","properties":{"title":{"type":"string"},"date":{"type":"string"},"start":{"type":"string"},"end":{"type":"string"},"group":{"type":"string"}},"required":["title"],"additionalProperties":false},
        parse: (raw) => {
          const o = (raw ?? {}) as Record<string, unknown>
          const title = asStr(o.title).trim()
          if (!title) throw new Error('Usage: calendar add "<title>" [--date --start --end --group]')
          return { title, date: asStr(o.date), start: asStr(o.start), end: asStr(o.end), group: asStr(o.group) }
        },
        fromCli: (args, flags) => ({
          title: args.join(' ').trim(),
          date: flags.date,
          start: flags.start,
          end: flags.end,
          group: flags.group
        })
      },
      run: async ({ title, date, start, end, group }) => {
        const day = datePart(date) || datePart(start) || datePart(end) || todayIso()
        const record = newEvent(title, day, {
          startTime: start ? timePart(start) : undefined,
          endTime: end ? timePart(end) : undefined,
          groupId: group || undefined
        })
        if (!(await rawAppend(record))) throw new Error('Failed to add event.')
        return {
          value: record,
          revert: {
            label: `Add event “${record.title}”`,
            run: async () => {
              await rawDelete(record.id)
            },
            reapply: async () => {
              await rawAppend(record)
            }
          }
        }
      },
      formatCli: (v) => `Added event "${v.title}" on ${v.date}${v.startTime ? ` ${v.startTime}` : ''}`,
      revision: (input) => calendarCommandRevision(input),
      preview: (input) => ({ changes: input })
    }),

    api.commands.register({
      id: 'goto',
      label: 'Calendar: Go to date', labelKey: 'auto.bf2660184858',
      paletteSafe: false,
      sideEffect: 'read',
      input: {
        schema: {"type":"object","properties":{"date":{"type":"string"}},"required":["date"],"additionalProperties":false},
        parse: (raw) => {
          const date = datePart(asStr((raw as Record<string, unknown> | undefined)?.date))
          if (!date) throw new Error('Usage: calendar goto <YYYY-MM-DD>')
          return { date }
        },
        fromCli: (args) => ({ date: args[0] })
      },
      run: ({ date }): TimeControlState =>
        api.workspace.patchTimeControl({ cursor: monthAnchor(date), selectedDate: date }),
      formatCli: (tc) => `Calendar at ${tc.selectedDate ?? tc.cursor} (${tc.view})`
    }),

    api.commands.register({
      id: 'set-view',
      label: 'Calendar: Set view', labelKey: 'auto.7f852a5678f1',
      paletteSafe: false,
      sideEffect: 'write',
      input: {
        schema: {"type":"object","properties":{"view":{"type":"string","enum":["month","week","year"]}},"required":["view"],"additionalProperties":false},
        parse: (raw) => {
          const view = asStr((raw as Record<string, unknown> | undefined)?.view).toLowerCase()
          if (!(VIEWS as string[]).includes(view)) throw new Error(`Usage: calendar set-view ${VIEWS.join('|')}`)
          return { view: view as CalendarViewMode }
        },
        fromCli: (args) => ({ view: (args[0] ?? '').toLowerCase() })
      },
      run: async ({ view }) => {
        await api.settings.set('mainView', view)
        return { value: await api.workspace.patchTimeControl({ view }), revert: null }
      },
      revision: async () => String(api.settings.get().mainView ?? (await api.workspace.getTimeControl()).view),
      preview: ({ view }) => ({ view }),
      formatCli: (tc) => `Calendar view: ${tc.view}`
    }),

    api.commands.register({
      id: 'today',
      label: 'Calendar: Go to today', labelKey: 'auto.ee8581831b9c',
      sideEffect: 'read',
      run: (): TimeControlState => {
        const today = todayIso()
        return api.workspace.patchTimeControl({ cursor: monthAnchor(today), selectedDate: today })
      },
      formatCli: (tc) => `Calendar at ${tc.selectedDate ?? tc.cursor} (${tc.view})`
    }),

    api.commands.register({
      id: 'list',
      label: 'Calendar: List events', labelKey: 'auto.05d290d65a74',
      paletteSafe: false,
      sideEffect: 'read',
      input: {
        schema: {"type":"object","properties":{"from":{"type":"string"},"to":{"type":"string"}},"required":[],"additionalProperties":false},
        parse: (raw) => {
          const o = (raw ?? {}) as Record<string, unknown>
          return { from: datePart(asStr(o.from)) ?? '', to: datePart(asStr(o.to)) ?? '' }
        },
        fromCli: (_args, flags) => ({ from: asStr(flags.from), to: asStr(flags.to) })
      },
      run: async ({ from, to }): Promise<EventRecord[]> => {
        const events = await loadEvents()
        const filtered = events.filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
        return filtered.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
      },
      formatCli: (events) =>
        events.length === 0
          ? 'No events.'
          : events.map((e) => `  ${e.date}${e.startTime ? ` ${e.startTime}` : ''}  ${e.title}`).join('\n')
    })
  ]
  return () => offs.forEach((off) => off())
}
