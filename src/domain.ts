import type { ValleyPluginApi } from '@valley/plugin-sdk'
import type { DataRecord, EventRecord } from '@valley/plugin-sdk/types'
import { eventRelations, eventRow, forWrite, isRemoteEventId, normalizeEventRecord, readEvents, relationWrites } from './records'

type OwnerApi = Pick<ValleyPluginApi, 'data' | 'pluginId'> & { settings?: Pick<ValleyPluginApi['settings'], 'get'> } & { documents: Pick<ValleyPluginApi['documents'], 'read' | 'update'> }
type Revision = { expectedRevision: number; vaultGeneration: number }
export type CalendarEventSink = (event: string, payload: { record: EventRecord; previous?: EventRecord }) => Promise<void>

function validateReminders(record: { reminderOffsets?: number[]; reminderTime?: string }): void {
  const offsets = record.reminderOffsets
  if (offsets !== undefined && (!Array.isArray(offsets) || offsets.length > 16 || offsets.some(value => !Number.isInteger(value) || value < 0 || value > 10080) || new Set(offsets).size !== offsets.length)) throw new Error('Invalid reminder offsets')
  if (record.reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(record.reminderTime)) throw new Error('Invalid reminder time')
}

export function createCalendarDomain(owner: OwnerApi, publish: CalendarEventSink = async () => {}) {
  let active = true
  let pending: Promise<unknown> = Promise.resolve()
  const committedEvent = async (emit: CalendarEventSink, event: string, payload: Parameters<CalendarEventSink>[1]) => {
    try { await emit(event, payload) }
    catch (error) { throw Object.assign(error instanceof Error ? error : new Error(String(error)), { outcomeUnknown: true, committed: true }) }
  }
  const assertActive = () => { if (!active) throw new Error('Calendar service is stopped.') }
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.catch(() => {}).then(() => { assertActive(); return operation() })
    pending = result
    return result
  }
  const read = (api: OwnerApi, startDate?: string, endDate?: string) => readEvents(api, assertActive, startDate, endDate)
  const writable = (record: EventRecord) => {
    if (record.readOnly || isRemoteEventId(record.id)) throw new Error('This calendar event is read-only.')
    if (!record.id || !record.title?.trim() || !record.date) throw new Error('Expected an event id, title and date.')
  }
  const update = async (api: OwnerApi, id: string, record: EventRecord, expectedUpdatedAt?: string, documentRevision?: Revision, emit = publish) => {
    validateReminders(record)
    const ref = { pluginId: owner.pluginId, sourceId: 'events', itemId: id }
    const baseline = await api.documents.read(ref)
    const stored = await api.data.dataset('calendar.events').get({ id })
    if (!baseline || !stored || (expectedUpdatedAt !== undefined && stored.updatedAt !== expectedUpdatedAt)) return { ok: false }
    const relations = await eventRelations([id], false, api, assertActive)
    const previous = normalizeEventRecord({
      ...stored, note: baseline.body, tags: baseline.explicitTags,
      urls: [...relations.links].sort((a, b) => Number(a.position) - Number(b.position)).map(entry => entry.url),
      attachments: [...relations.attachments].sort((a, b) => Number(a.position) - Number(b.position)).map(entry => entry.path)
    } as DataRecord)
    writable(previous)
    const next = forWrite(normalizeEventRecord({ ...record, id } as unknown as DataRecord))
    writable(next)
    const row = eventRow(next)
    delete row.id
    delete row.note
    assertActive()
    const committed = await api.documents.update(ref, {
      expectedRevision: documentRevision?.expectedRevision ?? baseline.revision,
      vaultGeneration: documentRevision?.vaultGeneration ?? baseline.vaultGeneration,
      body: next.note, explicitTags: next.tags ?? [],
      operations: [
        { dataset: 'calendar.events', operation: 'update', key: { id }, values: row },
        ...relations.links.map(entry => ({ dataset: 'calendar.event_links', operation: 'delete' as const, key: { eventId: id, position: Number(entry.position) } })),
        ...relations.attachments.map(entry => ({ dataset: 'calendar.event_attachments', operation: 'delete' as const, key: { eventId: id, position: Number(entry.position) } })),
        ...relationWrites(next, false)
      ]
    })
    if (JSON.stringify({ ...previous, updatedAt: undefined }) !== JSON.stringify({ ...next, updatedAt: undefined })) await committedEvent(emit, 'event.updated', { record: next, previous })
    return { ok: true, record: next, documentRevision: { expectedRevision: committed.revision, vaultGeneration: committed.vaultGeneration } }
  }
  return {
    list: (startDate?: string, endDate?: string, api = owner) => read(api, startDate, endDate),
    get: async (id: string, api = owner) => (await read(api)).find(event => event.id === id) ?? null,
    append: (record: EventRecord, api = owner, emit = publish) => serialize(async () => {
      validateReminders(record)
      const next = forWrite(normalizeEventRecord(record as unknown as DataRecord))
      if (next.startTime && next.reminderOffsets === undefined) next.reminderOffsets = Array.isArray(owner.settings?.get().reminderOffsets) ? [...owner.settings!.get().reminderOffsets as number[]] : [10]
      writable(next)
      await api.data.transaction([{ dataset: 'calendar.events', operation: 'insert', values: eventRow(next) }, ...relationWrites(next)])
      await committedEvent(emit, 'event.created', { record: next })
      return true
    }),
    update: (id: string, record: EventRecord, expectedUpdatedAt?: string, documentRevision?: Revision, api = owner, emit = publish) =>
      serialize(() => update(api, id, record, expectedUpdatedAt, documentRevision, emit)),
    patch: (id: string, values: Partial<EventRecord> | ((current: EventRecord) => Partial<EventRecord>), api = owner, emit = publish) => serialize(async () => {
      const previous = (await read(api)).find(event => event.id === id)
      if (!previous) throw new Error('The event no longer exists.')
      const patch = typeof values === 'function' ? values(previous) : values
      const result = await update(api, id, { ...previous, ...patch, updatedAt: new Date().toISOString() }, previous.updatedAt, undefined, emit)
      if (!result.ok || !result.record) throw new Error('The event changed before it could be saved.')
      return result.record
    }),
    remove: (id: string, api = owner) => serialize(async () => {
      const previous = (await read(api)).find(event => event.id === id)
      if (!previous) return false
      writable(previous)
      return (await api.data.dataset('calendar.events').delete({ id })).affected > 0
    }),
    dispose: async () => { active = false; await pending.catch(() => {}) }
  }
}
