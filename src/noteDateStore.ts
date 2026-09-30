import { React, api, readOwner } from './runtime'
import type { DatasetRecord, DatasetBatchOperation } from '@valley/plugin-sdk'
import { buildNoteDates, noteDatesSignature, sanitizeNoteDateSource, type NoteDateEntry, type NoteDateSource, type NoteDateIndexEntry } from './noteDates'
import { uiText } from './localization'
import { createReloadQueue, createRevisionCache, subscribeDatasetRevisions } from './reloadQueue'

const SOURCES_DATASET = 'calendar.note_date_sources'
const sourceDataset = () => api.data.dataset(SOURCES_DATASET)

async function sourceRows(dataset = sourceDataset(), assertCurrent = (): void => {}): Promise<DatasetRecord[]> {
  const rows: DatasetRecord[] = []
  let cursor: string | undefined
  do {
    assertCurrent()
    const page = await dataset.query({ orderBy: [{ field: 'position', direction: 'asc' }], limit: 1000, cursor })
    assertCurrent()
    rows.push(...page.rows)
    cursor = page.cursor
  } while (cursor)
  return rows
}

/** Read the configured sources from the durable dataset. */
export function loadNoteDateSources(): Promise<NoteDateSource[]> {
  return sourceReads().read('sources')
}

function sourceReads() {
  return readOwner('noteDateSources', (owner) => {
    const cache = createRevisionCache(async (_key: string, assertCurrent) => {
      const records = await sourceRows(owner.data.dataset(SOURCES_DATASET), assertCurrent)
      return records.map((record) => sanitizeNoteDateSource(
        record.definition && typeof record.definition === 'object' && !Array.isArray(record.definition)
          ? record.definition as Record<string, unknown>
          : {}
      ))
    }, 1)
    const off = subscribeDatasetRevisions(owner, [SOURCES_DATASET], cache.invalidate)
    return { ...cache, dispose: () => { off(); cache.dispose() } }
  })
}

/** Replace the ordered source definitions. */
export async function saveNoteDateSources(next: NoteDateSource[]): Promise<void> {
  const dataset = sourceDataset()
  const existing = await sourceRows(dataset)
  const retained = new Set(next.map((definition) => definition.id))
  const current = new Map(existing.map((record) => [record.id, record]))
  const changed = next.map((source, position) => {
    const definition: DatasetRecord = {}
    for (const [key, value] of Object.entries(source)) if (value !== undefined) definition[key] = value
    return { id: source.id, position, definition }
  })
    .filter((record) => current.get(record.id)?.position !== record.position || JSON.stringify(current.get(record.id)?.definition) !== JSON.stringify(record.definition))
  const operations: DatasetBatchOperation[] = existing.filter((record) => !retained.has(String(record.id)))
    .map((record) => ({ operation: 'delete', key: { id: String(record.id) } }))
  if (changed.length) operations.push({ operation: 'upsert', values: changed })
  if (operations.length > 1000) throw new Error(uiText('calendar.error.atomicLimit'))
  if (operations.length) await dataset.batch(operations)
}

/** Subscribe a view to the sources — reloads on every save. */
export function useNoteDateSources(): NoteDateSource[] {
  const [sources, setSources] = React.useState<NoteDateSource[]>([])
  React.useEffect(() => {
    const queue = createReloadQueue(loadNoteDateSources, setSources, (error) => console.error('[calendar] note-date sources reload failed', error))
    const off = sourceReads().subscribe(() => { void queue.reload() })
    void queue.reload()
    return () => {
      queue.dispose()
      off()
    }
  }, [])
  return sources
}

export function projectNoteDates(entries: readonly NoteDateIndexEntry[], sources: NoteDateSource[], years: number[], viewedYear: number): NoteDateEntry[] {
  const store = readOwner('noteDateProjection', () => {
    let lastEntries: readonly NoteDateIndexEntry[] | undefined
    let lastSources: NoteDateSource[] | undefined
    let signature = ''
    const ranges = new Map<string, NoteDateEntry[]>()
    const clear = (): void => { lastEntries = undefined; lastSources = undefined; signature = ''; ranges.clear() }
    return {
      project: (entries: readonly NoteDateIndexEntry[], sources: NoteDateSource[], years: number[], viewedYear: number): NoteDateEntry[] => {
        if (entries !== lastEntries || sources !== lastSources) {
          const next = noteDatesSignature(entries, sources)
          lastEntries = entries
          lastSources = sources
          if (signature !== next) { signature = next; ranges.clear() }
        }
        const key = JSON.stringify([viewedYear, years])
        let value = ranges.get(key)
        if (!value) {
          value = buildNoteDates(entries, sources, years, viewedYear)
          if (ranges.size >= 16) ranges.delete(ranges.keys().next().value!)
        }
        ranges.delete(key)
        ranges.set(key, value)
        return value
      },
      invalidate: clear,
      dispose: clear
    }
  })
  return store.project(entries, sources, years, viewedYear)
}
