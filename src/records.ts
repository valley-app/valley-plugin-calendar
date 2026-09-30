import type { DataRecord, EventRecord } from '@valley/plugin-sdk/types'
import type { DatasetRecord, DatasetTransactionOperation, DatasetWhere, ValleyPluginApi } from '@valley/plugin-sdk'
import { asColor, asString, asTime } from '@valley/plugin-sdk/normalize'
import { isAllowedExternalUrl, normalizeRelPathOpt, parseAppOpenUrl } from '@valley/plugin-sdk/paths'

const EVENTS_DATASET = 'calendar.events'
const TAGS_DATASET = 'calendar.event_tags'
const LINKS_DATASET = 'calendar.event_links'
const ATTACHMENTS_DATASET = 'calendar.event_attachments'

function asBool(value: unknown): boolean {
  return value === true
}

/** Only shared safe web/app schemes and valid Valley file deep links. */
export function normalizeEventUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return parseAppOpenUrl(trimmed) || isAllowedExternalUrl(trimmed) ? trimmed : undefined
}

function normalizeUrls(value: unknown): string[] | undefined {
  const raw = Array.isArray(value) ? value : []
  const out: string[] = []
  for (const entry of raw) {
    const url = normalizeEventUrl(entry)
    if (url && !out.includes(url)) out.push(url)
  }
  return out.length > 0 ? out : undefined
}

function normalizeAttachments(value: unknown): string[] | undefined {
  const raw = Array.isArray(value) ? value : []
  const out: string[] = []
  for (const entry of raw) {
    const relPath = normalizeRelPathOpt(entry)
    if (relPath && !out.includes(relPath)) out.push(relPath)
  }
  return out.length > 0 ? out : undefined
}

function normalizeLocation(value: unknown): EventRecord['location'] {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const name = asString(raw.name).trim()
  if (!name) return undefined
  const lng = typeof raw.lng === 'number' && Number.isFinite(raw.lng) ? raw.lng : undefined
  const lat = typeof raw.lat === 'number' && Number.isFinite(raw.lat) ? raw.lat : undefined
  // Half a fix is no fix — the map would open at the equator.
  return lng !== undefined && lat !== undefined ? { name, lng, lat } : { name }
}

/**
 * The last day of a span. A same-day end is dropped rather than stored — it
 * carries nothing a single-day event does not already say — and so is a
 * backwards one: an end before its start would materialize a range the grids
 * cannot draw, and ISO dates compare correctly as strings.
 */
function normalizeEndDate(date: string, value: unknown): string | undefined {
  const end = asString(value).slice(0, 10)
  return end && date && end > date ? end : undefined
}

/** Read-only events pulled from a remote calendar use a `<provider>:` id prefix. */
export function isRemoteEventId(id: string): boolean {
  return id.startsWith('google:') || id.startsWith('microsoft:')
}

export function normalizeEventRecord(record: DataRecord): EventRecord {
  const now = new Date().toISOString()
  const id = asString(record.id, `event_${Date.now().toString(36)}`)
  const createdAt = asString(record.createdAt, now)
  const startTime = asTime(record.startTime)
  const endTime = asTime(record.endTime)
  const date = asString(record.date).slice(0, 10)
  return {
    id,
    title: asString(record.title).trim(),
    date,
    endDate: normalizeEndDate(date, record.endDate),
    reminderOffsets: Array.isArray(record.reminderOffsets) ? record.reminderOffsets as number[] : undefined,
    reminderTime: asTime(record.reminderTime),
    startTime,
    endTime,
    allDay: asBool(record.allDay) || (!startTime && !endTime),
    color: asColor(record.color),
    category: asString(record.category).trim() || undefined,
    groupId: asString(record.groupId).trim() || undefined,
    group: asString(record.group).trim() || undefined,
    location: normalizeLocation(record.location),
    urls: normalizeUrls(record.urls),
    attachments: normalizeAttachments(record.attachments),
    tags: Array.isArray(record.tags)
      ? record.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()).map((t) => t.trim())
      : [],
    note: asString(record.note),
    filePath: normalizeRelPathOpt(record.filePath),
    createdAt,
    updatedAt: asString(record.updatedAt, createdAt),
    source: asString(record.source).trim() || undefined,
    accountId: asString(record.accountId).trim() || undefined,
    readOnly: asBool(record.readOnly) || undefined
  }
}

export function eventRow(record: EventRecord): DatasetRecord {
  return {
    id: record.id,
    calendarId: null,
    providerId: null,
    title: record.title,
    date: record.date,
    endDate: record.endDate ?? null,
    reminderOffsets: record.reminderOffsets ?? null,
    reminderTime: record.reminderTime ?? null,
    startTime: record.startTime ?? null,
    endTime: record.endTime ?? null,
    allDay: record.allDay ?? null,
    timezone: null,
    color: record.color ?? null,
    category: record.category ?? null,
    groupId: record.groupId ?? null,
    group: record.group ?? null,
    location: record.location ?? null,
    note: record.note,
    filePath: record.filePath ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    source: record.source ?? null,
    accountId: record.accountId ?? null,
    readOnly: record.readOnly ?? null,
    recurrenceRule: null,
    recurrenceMasterId: null
  }
}

export async function allRows(dataset: string, where: DatasetWhere | undefined, owner: Pick<ValleyPluginApi, 'data'>, assertCurrent = (): void => {}): Promise<DatasetRecord[]> {
  const rows: DatasetRecord[] = []
  let cursor: string | undefined
  do {
    assertCurrent()
    const page = await owner.data.dataset(dataset).query({ where, limit: 1000, cursor })
    assertCurrent()
    rows.push(...page.rows)
    cursor = page.cursor
  } while (cursor)
  return rows
}

export async function eventRelations(eventIds: string[] | undefined, includeTags: boolean, owner: Pick<ValleyPluginApi, 'data'>, assertCurrent = (): void => {}): Promise<{
  tags: DatasetRecord[]
  links: DatasetRecord[]
  attachments: DatasetRecord[]
}> {
  const read = async (dataset: string): Promise<DatasetRecord[]> => {
    if (!eventIds) return allRows(dataset, undefined, owner, assertCurrent)
    const rows: DatasetRecord[] = []
    for (let offset = 0; offset < eventIds.length; offset += 100) {
      rows.push(...await allRows(dataset, { eventId: { in: eventIds.slice(offset, offset + 100) } }, owner, assertCurrent))
    }
    return rows
  }
  const results = await Promise.allSettled([
    includeTags ? read(TAGS_DATASET) : [],
    read(LINKS_DATASET),
    read(ATTACHMENTS_DATASET)
  ])
  const [tags, links, attachments] = results.map((result) => {
    if (result.status === 'rejected') throw result.reason
    return result.value
  })
  return { tags, links, attachments }
}

export function relationWrites(record: EventRecord, includeTags = true): DatasetTransactionOperation[] {
  return [
    ...(includeTags ? record.tags.map((tag) => ({ dataset: TAGS_DATASET, operation: 'insert' as const, values: { eventId: record.id, tag } })) : []),
    ...(record.urls ?? []).map((url, position) => ({ dataset: LINKS_DATASET, operation: 'insert' as const, values: { eventId: record.id, position, url } })),
    ...(record.attachments ?? []).map((path, position) => ({ dataset: ATTACHMENTS_DATASET, operation: 'insert' as const, values: { eventId: record.id, position, path } }))
  ]
}

export function forWrite(record: EventRecord): EventRecord {
  return {
    ...record,
    endDate: normalizeEndDate(record.date, record.endDate),
    filePath: normalizeRelPathOpt(record.filePath),
    urls: normalizeUrls(record.urls),
    attachments: normalizeAttachments(record.attachments)
  }
}

export async function readEvents(owner: Pick<ValleyPluginApi, 'data'>, assertCurrent: () => void, startDate?: string, endDate?: string): Promise<EventRecord[]> {
  const where: DatasetWhere | undefined = startDate && endDate
    ? { date: { lte: endDate }, or: [{ endDate: { gte: startDate } }, { endDate: { isNull: true }, date: { gte: startDate } }] }
    : undefined
  const raw = await allRows(EVENTS_DATASET, where, owner, assertCurrent)
  if (!raw.length) return []
  const relations = await eventRelations(where ? raw.map((row) => String(row.id)) : undefined, true, owner, assertCurrent)
  const byEvent = (rows: DatasetRecord[], ordered = false): Map<unknown, DatasetRecord[]> => {
    const index = new Map<unknown, DatasetRecord[]>()
    for (const row of rows) {
      const entries = index.get(row.eventId)
      if (entries) entries.push(row)
      else index.set(row.eventId, [row])
    }
    if (ordered) for (const entries of index.values()) entries.sort((a, b) => Number(a.position) - Number(b.position))
    return index
  }
  const tags = byEvent(relations.tags)
  const links = byEvent(relations.links, true)
  const attachments = byEvent(relations.attachments, true)
  return raw.map((row) => normalizeEventRecord({
    ...row,
    tags: (tags.get(row.id) ?? []).map((entry) => entry.tag),
    urls: (links.get(row.id) ?? []).map((entry) => entry.url),
    attachments: (attachments.get(row.id) ?? []).map((entry) => entry.path)
  } as DataRecord)).filter((event) => event.title && event.date)
}

