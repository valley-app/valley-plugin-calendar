import { uiText } from './localization'
import type { EventRecord } from '@valley/plugin-sdk/types'
import type { NoteInputProps } from '@valley/plugin-sdk'
import { api, readOwner } from './runtime'
import { generateId } from './lib'
import { readEvents, isRemoteEventId } from './records'
export { normalizeEventRecord, normalizeEventUrl } from './records'
import { createRevisionCache, subscribeDatasetRevisions } from './reloadQueue'

/**
 * Calendar events data layer. Local records live in Calendar's durable database,
 * which survives plugin deletion.
 * Mutations register with the core ⌘Z stack via `api.undo` and ride the host's
 * serialized, atomic dataset transaction path.
 */
const EVENTS_DATASET = 'calendar.events'
const TAGS_DATASET = 'calendar.event_tags'
const LINKS_DATASET = 'calendar.event_links'
const ATTACHMENTS_DATASET = 'calendar.event_attachments'

export function onChanged(cb: () => void): () => void {
  return eventReads().subscribe(cb)
}

function eventReads() {
  return readOwner('events', (owner) => {
    const cache = createRevisionCache((key: string, assertCurrent) => {
      const [start, end] = JSON.parse(key) as [string | null, string | null]
      return readEvents(owner, assertCurrent, start ?? undefined, end ?? undefined)
    })
    const off = subscribeDatasetRevisions(owner, [EVENTS_DATASET, TAGS_DATASET, LINKS_DATASET, ATTACHMENTS_DATASET], cache.invalidate)
    return { ...cache, dispose: () => { off(); cache.dispose() } }
  })
}

export function loadEvents(startDate?: string, endDate?: string): Promise<EventRecord[]> {
  return eventReads().read(JSON.stringify([startDate ?? null, endDate ?? null]))
}

export type DocumentRevision = Parameters<NonNullable<NoteInputProps['onRevisionChange']>>[0]

export async function rawAppend(record: EventRecord): Promise<boolean> {
  try { return await api.backend.call<boolean>('records.append', { record }) } catch { return false }
}

export async function rawUpdate(id: string, record: EventRecord, expectedUpdatedAt?: string, documentRevision?: DocumentRevision): Promise<boolean> {
  try {
    const result = await api.backend.call<{ ok: boolean; documentRevision?: DocumentRevision }>('records.update', { id, record, expectedUpdatedAt, documentRevision })
    if (result.ok && documentRevision && result.documentRevision) Object.assign(documentRevision, result.documentRevision)
    return result.ok
  } catch { return false }
}

export async function rawDelete(id: string): Promise<boolean> {
  try { return await api.backend.call<boolean>('records.delete', { id }) } catch { return false }
}

export async function appendEvent(record: EventRecord): Promise<boolean> {
  if (!record.id || !record.title.trim() || !record.date) return false
  const ok = await rawAppend(record)
  if (ok) {
    api.undo.push({
      label: uiText('calendar.undo.addEvent', { title: record.title.trim() }),
      undo: async () => ({ ok: await rawDelete(record.id) }),
      redo: async () => ({ ok: await rawAppend(record) })
    })
  }
  return ok
}

export async function updateEvent(id: string, record: EventRecord, expectedUpdatedAt?: string, documentRevision?: DocumentRevision): Promise<boolean> {
  if (!id || !record.title.trim()) return false
  if (isRemoteEventId(id)) return false // read-only remote event; never write back
  const prev = (await loadEvents()).find((event) => event.id === id)
  const ok = await rawUpdate(id, record, expectedUpdatedAt, documentRevision)
  if (ok && prev) {
    api.undo.push({
      label: uiText('calendar.undo.editEvent', { title: prev.title }),
      undo: async () => ({ ok: await rawUpdate(id, prev) }),
      redo: async () => ({ ok: await rawUpdate(id, record) })
    })
  }
  return ok
}

export async function deleteEvent(id: string): Promise<boolean> {
  if (isRemoteEventId(id)) return false // read-only remote event; never delete
  const prev = (await loadEvents()).find((event) => event.id === id)
  const ok = await rawDelete(id)
  if (ok && prev) {
    api.undo.push({
      label: uiText('calendar.undo.deleteEvent', { title: prev.title }),
      undo: async () => ({ ok: await rawAppend(prev) }),
      redo: async () => ({ ok: await rawDelete(id) })
    })
  }
  return ok
}

/** Build a fresh event with sane defaults. */
export function newEvent(title: string, date: string, opts?: Partial<EventRecord>): EventRecord {
  const now = new Date().toISOString()
  return {
    id: generateId('event'),
    title: title.trim(),
    date,
    tags: [],
    note: '',
    allDay: !opts?.startTime && !opts?.endTime,
    ...opts,
    createdAt: now,
    updatedAt: now
  }
}
