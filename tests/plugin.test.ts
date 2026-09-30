import { describe, expect, it, vi } from 'vitest'
import { PLUGIN_SURFACE_V1 } from '@valley/plugin-sdk'
import { createMockValleyApi } from './harness'
import { register } from '../src/index'
import { initRuntime } from '../src/runtime'
import { registerCalendarSurfaces } from '../src/surfaces'
import { loadEvents, rawUpdate } from '../src/events'
import type { DatasetQuery } from '@valley/plugin-sdk'
import type { ValleyPluginManifest } from '@valley/plugin-sdk/types'
import CONFIG from '../config.json'
describe('calendar package', () => { it('registers through its injected API', () => { const mock = createMockValleyApi(); const dispose = register(mock.api); expect(mock.commands.length).toBeGreaterThan(0); dispose?.() }) })

it('releases surface subscriptions without accessing a revoked session', () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  const dispose = registerCalendarSurfaces(mock.api)
  const surface = mock.api.interop.extensions.providers(PLUGIN_SURFACE_V1)[0].extension
  const unsubscribe = surface.subscribe(vi.fn())
  const state = mock.api.runtime.getOrCreate('calendar.surfaces', () => ({ listeners: new Set() }))
  expect(state.listeners.size).toBe(1)
  dispose()
  const runtime = vi.spyOn(mock.api.runtime, 'getOrCreate').mockImplementation(() => { throw new Error('Plugin session is no longer active') })
  try {
    unsubscribe()
    expect(state.listeners.size).toBe(0)
    expect(runtime).not.toHaveBeenCalled()
  } finally { runtime.mockRestore() }
})

it('loads only in-range event relations, preserving owner boundaries, ordering and cursor pages', async () => {
  const events = Array.from({ length: 101 }, (_, index) => ({ id: `event_${index}`, title: `Fern ${index}`, date: '2026-08-24' }))
  const mock = createMockValleyApi({ manifest: { id: 'calendar' }, datasets: {
    'calendar.events': [...events, { id: 'old', title: 'Archived', date: '2025-01-01' }],
    'calendar.event_tags': [...Array.from({ length: 1001 }, (_, index) => ({ eventId: 'event_0', tag: `fern-${index}` })), { eventId: 'old', tag: 'archived' }],
    'calendar.event_links': [{ eventId: 'event_100', position: 1, url: 'https://example.com/second' }, { eventId: 'event_100', position: 0, url: 'https://example.com/first' }],
    'calendar.event_attachments': [{ eventId: 'old', position: 0, path: 'Old.pdf' }, { eventId: 'event_0', position: 1, path: 'B.pdf' }, { eventId: 'event_0', position: 0, path: 'A.pdf' }]
  } })
  initRuntime(mock.api)
  const dataset = mock.api.data.dataset
  const reads: { id: string; query: DatasetQuery | undefined }[] = []
  mock.api.data.dataset = ((id: string) => {
    const handle = dataset(id)
    return { ...handle, query: async (query) => { reads.push({ id, query }); return handle.query(query) } }
  }) as typeof dataset
  const result = await loadEvents('2026-08-01', '2026-08-31')
  expect(result).toHaveLength(101)
  expect(result.find((event) => event.id === 'event_0')).toMatchObject({ tags: expect.any(Array), attachments: ['A.pdf', 'B.pdf'] })
  expect(result.find((event) => event.id === 'event_0')?.tags).toHaveLength(1001)
  expect(result.find((event) => event.id === 'event_100')?.urls).toEqual(['https://example.com/first', 'https://example.com/second'])
  expect(result.some((event) => event.tags.includes('archived'))).toBe(false)
  for (const { query } of reads.filter(({ id }) => id !== 'calendar.events')) {
    const ids = (query?.where?.eventId as { in: string[] }).in
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.length).toBeLessThanOrEqual(100)
    expect(ids).not.toContain('old')
  }
  expect(reads.some(({ query }) => query?.cursor)).toBe(true)
  reads.length = 0
  expect(await loadEvents('2024-01-01', '2024-01-31')).toEqual([])
  expect(reads.map(({ id }) => id)).toEqual(['calendar.events'])
})

it('updates event documents without fetching tag relations that the document transaction owns', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar', noteDocuments: CONFIG.noteDocuments, datasets: CONFIG.datasets as unknown as ValleyPluginManifest['datasets'] }, datasets: {
    'calendar.events': [{ id: 'fern', title: 'Fern', date: '2026-08-24', note: '', createdAt: '', updatedAt: '' }],
    'calendar.event_tags': [{ eventId: 'fern', tag: 'old' }]
  } })
  initRuntime(mock.api)
  const [event] = await loadEvents()
  const dataset = mock.api.data.dataset
  const reads: string[] = []
  mock.api.data.dataset = ((id: string) => {
    const handle = dataset(id)
    return { ...handle, query: async (query) => { reads.push(id); return handle.query(query) } }
  }) as typeof dataset
  const update = vi.spyOn(mock.api.documents, 'update')
  expect(await rawUpdate(event.id, { ...event, note: 'New note', tags: ['flora/äste'] })).toBe(true)
  expect(reads).not.toContain('calendar.event_tags')
  expect(update.mock.calls[0][1]).toMatchObject({ body: 'New note', explicitTags: ['flora/äste'] })
  expect((await loadEvents())[0]).toMatchObject({ note: 'New note', tags: ['flora/äste'] })
})
