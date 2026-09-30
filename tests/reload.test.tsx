import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { CALENDAR_ITEM_SOURCE_REVISION_V1, CALENDAR_ITEM_SOURCE_V2, type CalendarSourceItem, type DatasetChangeEvent } from '@valley/plugin-sdk'
import type { IndexEntry } from '@valley/plugin-sdk/types'
import { createMockValleyApi, pagedSource } from './harness'
import { initRuntime } from '../src/runtime'
import { listSourcedItems, updateSourcedItem, useSourcedItems } from '../src/itemSources'
import { createReloadQueue, createRevisionCache } from '../src/reloadQueue'
import { useCalendarData } from '../src/useCalendarData'
import { AgendaPanel } from '../src/AgendaPanel'
import { initLocalization } from '../src/localization'
import { loadEvents } from '../src/events'
import { loadNoteDateSources, projectNoteDates, saveNoteDateSources, useNoteDateSources } from '../src/noteDateStore'
import { defaultNoteDateSource, sanitizeNoteDateSource } from '../src/noteDates'
import { useCalendarItems } from '../src/useCalendarItems'
import { useCalendarYear } from '../src/hooks'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

it('keeps Agenda typing, clear, and Escape inside the same shared search frame', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  initLocalization(mock.api)
  render(React.createElement(AgendaPanel))
  const input = await screen.findByRole('textbox', { name: 'Search agenda' })
  const frame = input.parentElement!
  expect(frame).toHaveClass('search-field')
  expect(input).toHaveClass('search-field-input')
  expect(frame.querySelector('.search-field-icon')).toBeInTheDocument()
  fireEvent.change(input, { target: { value: 'moss' } })
  const clear = screen.getByRole('button', { name: 'Clear search' })
  expect(clear).toHaveClass('search-field-action')
  expect(clear.parentElement).toBe(frame)
  fireEvent.click(clear)
  expect(input).toHaveValue('')
  fireEvent.change(input, { target: { value: 'fern' } })
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(input).toHaveValue('')
  expect(screen.getByRole('textbox', { name: 'Search agenda' })).toBe(input)
})

it('shares a contributed-item burst across mounted surfaces and publishes the newest result', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  let title = 'Before'
  const list = vi.fn(async () => {
    const snapshot = title
    await held
    return [{ id: 'fern', title: snapshot, date: '2026-08-24' }]
  })
  const offProvider = mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: pagedSource(list) }, 'todo')
  const main = renderHook(useSourcedItems)
  const sidebar = renderHook(useSourcedItems)
  expect(list).toHaveBeenCalledTimes(1)
  await act(async () => {
    title = 'After'
    for (let revision = 1; revision <= 20; revision++) {
      mock.api.interop.state.publish(CALENDAR_ITEM_SOURCE_REVISION_V1, revision)
    }
  })
  expect(list).toHaveBeenCalledTimes(1)
  await act(async () => { release() })
  await waitFor(() => {
    expect(main.result.current.items[0]?.item.title).toBe('After')
    expect(sidebar.result.current.items[0]?.item.title).toBe('After')
  })
  expect(list).toHaveBeenCalledTimes(2)
  main.unmount(); sidebar.unmount(); offProvider()
})

it('shares identical event ranges without conflating different ranges', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' }, datasets: { 'calendar.events': [{ id: 'fern', title: 'Fern', date: '2026-08-24' }] } })
  initRuntime(mock.api)
  const dataset = mock.api.data.dataset
  const ranges: unknown[] = []
  mock.api.data.dataset = ((id: string) => {
    const handle = dataset(id)
    return { ...handle, query: async (query) => { if (id === 'calendar.events') ranges.push(query?.where); return handle.query(query) } }
  }) as typeof dataset
  const results = await Promise.all([loadEvents('2026-08-01', '2026-08-31'), loadEvents('2026-08-01', '2026-08-31'), loadEvents('2026-09-01', '2026-09-30')])
  expect(ranges).toHaveLength(2)
  expect(results.map((items) => items.length)).toEqual([1, 1, 0])
})

it.each([999, 1000, 1001])('loads and edits every one of %i note-date sources atomically', async (count) => {
  const sources = Array.from({ length: count }, (_, position) => ({ ...defaultNoteDateSource(), id: `source-${position}`, title: `Source ${position}` }))
  const mock = createMockValleyApi({ manifest: { id: 'calendar' }, datasets: { 'calendar.note_date_sources': sources.map((definition, position) => ({ id: definition.id, position, definition })) } })
  initRuntime(mock.api)
  expect((await loadNoteDateSources()).map((source) => source.id)).toEqual(sources.map((source) => source.id))
  const next = sources.slice().reverse().map((source) => ({ ...source, title: `${source.title} edited` }))
  await saveNoteDateSources(next)
  expect((await loadNoteDateSources()).map(({id,title})=>({id,title}))).toEqual(next.map(({id,title})=>({id,title})))
  if (count === 1001) {
    await expect(saveNoteDateSources([])).rejects.toThrow('1000 operations')
    expect(await loadNoteDateSources()).toHaveLength(count)
  }
})

it('clears optional note-date fields without losing defined false, zero, or ordered field values', async () => {
  const source = sanitizeNoteDateSource({ id: 'field-dates', title: 'Field dates', color: 'palette:primary-blue', folder: 'Fieldwork', recurrenceLimitYears: 2 })
  const mock = createMockValleyApi({ manifest: { id: 'calendar' }, datasets: {
    'calendar.note_date_sources': [{ id: source.id, position: 0, definition: source }]
  } })
  initRuntime(mock.api)
  const next = { ...source, color: undefined, folder: undefined, matchValue: '', recurrenceLimitYears: 0, visible: false, showCount: false, showFields: ['habitat', 'species'] }
  await saveNoteDateSources([next])
  const persisted = mock.datasets.get('calendar.note_date_sources')?.[0]?.definition
  expect(persisted).toStrictEqual(JSON.parse(JSON.stringify(persisted)))
  expect(persisted).not.toHaveProperty('color')
  expect(persisted).not.toHaveProperty('folder')
  expect(persisted).toMatchObject({ matchValue: '', recurrenceLimitYears: 0, visible: false, showCount: false, showFields: ['habitat', 'species'] })
  expect(await loadNoteDateSources()).toEqual([next])
})

it('finishes an accepted read after unmount without starting queued reloads or publishing stale state', async () => {
  let release!: (items: CalendarSourceItem[]) => void
  const read = vi.fn(() => new Promise<CalendarSourceItem[]>((resolve) => { release = resolve }))
  const publish = vi.fn()
  const queue = createReloadQueue(read, publish)
  const first = queue.reload()
  expect(queue.reload()).toBe(first)
  queue.dispose()
  release([{ id: 'fern', title: 'Fern', date: '2026-08-24' }])
  await first
  expect(read).toHaveBeenCalledTimes(1)
  expect(publish).not.toHaveBeenCalled()
})

it('coalesces local event reloads from core-state changes and retains a newer event mutation', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' }, datasets: {
    'calendar.events': [{ id: 'fern', title: 'Before', date: '2026-08-24' }]
  } })
  initRuntime(mock.api)
  const dataset = mock.api.data.dataset
  let reads = 0
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  mock.api.data.dataset = ((id: string) => {
    const handle = dataset(id)
    return { ...handle, query: async (query) => {
      const first = id === 'calendar.events' && ++reads === 1
      const result = await handle.query(query)
      if (first) await held
      return result
    } }
  }) as typeof dataset
  const hook = renderHook(() => useCalendarData('2026-08-01', '2026-08-31'))
  await act(async () => {
    for (let index = 0; index < 20; index++) mock.emitState({ activePath: `Notes/Fern-${index}.md` })
    await dataset('calendar.events').update({ id: 'fern' }, { title: 'After' })
  })
  expect(reads).toBe(1)
  await act(async () => { release() })
  await waitFor(() => expect(hook.result.current.events[0]?.title).toBe('After'))
  expect(reads).toBe(2)
  hook.unmount()
})

it('keeps read failures observable and permits a later reload', async () => {
  const read = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(['fern'])
  const publish = vi.fn()
  const queue = createReloadQueue(read, publish)
  await expect(queue.reload()).rejects.toThrow('Unavailable')
  await queue.reload()
  expect(publish).toHaveBeenCalledWith(['fern'])
})

it('reports a coalesced fire-and-forget failure once and allows the next refresh', async () => {
  let reject!: (error: Error) => void
  const read = vi.fn().mockImplementationOnce(() => new Promise((_, fail) => { reject = fail })).mockResolvedValue(['fern'])
  const publish = vi.fn()
  const report = vi.fn()
  const queue = createReloadQueue(read, publish, report)
  void queue.reload()
  for (let index = 0; index < 20; index++) void queue.reload()
  const error = new Error('Read unavailable')
  reject(error)
  await waitFor(() => expect(report).toHaveBeenCalledOnce())
  expect(report).toHaveBeenCalledWith(error)
  await queue.reload()
  expect(publish).toHaveBeenCalledWith(['fern'])
})

it('keeps settled ranges shared across views and ignores navigation and unrelated datasets', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' }, datasets: {
    'calendar.events': [{ id: 'fern', title: 'Fern', date: '2026-08-24' }]
  } })
  initRuntime(mock.api)
  const dataset = mock.api.data.dataset
  const reads: string[] = []
  mock.api.data.dataset = ((id: string) => {
    const handle = dataset(id)
    return { ...handle, query: async (query) => { reads.push(id); return handle.query(query) } }
  }) as typeof dataset
  const list = vi.fn(async () => [{ id: 'moss', title: 'Moss', date: '2026-08-24' }])
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: pagedSource(list) }, 'source')
  const first = renderHook(() => useCalendarData('2026-08-01', '2026-08-31'))
  await waitFor(() => expect(first.result.current.events).toHaveLength(1))
  await waitFor(() => expect(first.result.current.sourced).toHaveLength(1))
  const settled = reads.length
  const second = renderHook(() => useCalendarData('2026-08-01', '2026-08-31'))
  await waitFor(() => expect(second.result.current.events).toHaveLength(1))
  const source = { id: 'preview', title: 'Preview', isPlaying: true, canSkip: false, toggle: () => {}, pause: () => {} }
  const playback = mock.api.playback.register(source)
  await act(async () => {
    playback.claim()
    for (let position = 0; position < 20; position++) playback.update({ ...source, position })
    for (let index = 0; index < 20; index++) mock.emitState({ activePath: `Notes/Fern-${index}.md`, canGoBack: index % 2 === 0 })
    await dataset('calendar.calendars').upsert({ id: 'elsewhere', name: 'Unrelated' })
  })
  playback.dispose()
  expect(reads).toHaveLength(settled)
  expect(list).toHaveBeenCalledOnce()
  await act(async () => { await dataset('calendar.event_tags').upsert({ eventId: 'fern', tag: 'botany' }) })
  await waitFor(() => expect(first.result.current.events[0]?.tags).toEqual(['botany']))
  expect(second.result.current.events[0]?.tags).toEqual(['botany'])
  expect(reads.filter((id) => id === 'calendar.events')).toHaveLength(2)
  expect(list).toHaveBeenCalledOnce()
})

it('deduplicates dataset revisions without accepting older generations', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  const dataset = mock.api.data.dataset
  let changed!: (event: DatasetChangeEvent) => void
  const query = vi.fn(async () => ({ rows: [], revision: 1 }))
  mock.api.data.dataset = ((id: string) => {
    const handle = dataset(id)
    return id === 'calendar.events' ? { ...handle, query, subscribe: (listener) => { changed = listener; return () => {} } } : handle
  }) as typeof dataset
  await loadEvents()
  const event: DatasetChangeEvent = { dataset: 'calendar.events', reason: 'update', revision: 2, vaultGeneration: 3 }
  changed(event)
  await loadEvents()
  changed(event)
  changed({ ...event, revision: 1 })
  changed({ ...event, vaultGeneration: 2, revision: 99 })
  await loadEvents()
  expect(query).toHaveBeenCalledTimes(2)
  changed({ ...event, vaultGeneration: 4, revision: 1 })
  await loadEvents()
  expect(query).toHaveBeenCalledTimes(3)
})

it('reuses source reads after settlement and refreshes provider replacement, removal and mutations', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  let title = 'Before'
  const list = vi.fn(async () => [{ id: 'fern', title, date: '2026-08-24' }])
  const off = mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: pagedSource(list), update: async () => { title = 'Edited'; return true } }, 'source')
  const first = await listSourcedItems()
  expect(await listSourcedItems()).toBe(first)
  expect(list).toHaveBeenCalledOnce()
  expect(await updateSourcedItem(first[0].sourceId, 'fern', { title: 'Edited' })).toBe(true)
  expect((await listSourcedItems())[0]?.item.title).toBe('Edited')
  expect(list).toHaveBeenCalledTimes(2)
  off()
  const replacement = vi.fn(async () => [{ id: 'fern', title: 'Replacement', date: '2026-08-24' }])
  const offReplacement = mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: pagedSource(replacement) }, 'source')
  expect((await listSourcedItems())[0]?.item.title).toBe('Replacement')
  expect(replacement).toHaveBeenCalledOnce()
  offReplacement()
  expect(await listSourcedItems()).toEqual([])
})

it('does not cache failed provider results and makes later explicit retries observable', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  const list = vi.fn().mockRejectedValueOnce(new Error('Provider unavailable')).mockResolvedValue([{ id: 'fern', title: 'Recovered', date: '2026-08-24' }])
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: pagedSource(list) }, 'source')
  expect(await listSourcedItems()).toEqual([])
  expect((await listSourcedItems())[0]?.item.title).toBe('Recovered')
  expect(list).toHaveBeenCalledTimes(2)
})

it('replaces a removed provider during its pending list without publishing the old session', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  const old = vi.fn(async () => { await held; return [{ id: 'fern', title: 'Old', date: '2026-08-24' }] })
  const off = mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: pagedSource(old) }, 'source')
  const hook = renderHook(useSourcedItems)
  const replacement = vi.fn(async () => [{ id: 'fern', title: 'New', date: '2026-08-24' }])
  await act(async () => {
    off()
    mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: pagedSource(replacement) }, 'source')
    release()
  })
  await waitFor(() => expect(hook.result.current.items[0]?.item.title).toBe('New'))
  expect(old).toHaveBeenCalledOnce()
  expect(replacement).toHaveBeenCalledOnce()
})

it('shares note-date hydration and dirty pending reruns across mounted and later consumers', async () => {
  const source = { ...defaultNoteDateSource(), id: 'dates', title: 'Before' }
  const mock = createMockValleyApi({ manifest: { id: 'calendar' }, datasets: {
    'calendar.note_date_sources': [{ id: source.id, position: 0, definition: source }]
  } })
  initRuntime(mock.api)
  const dataset = mock.api.data.dataset
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  let reads = 0
  mock.api.data.dataset = ((id: string) => {
    const handle = dataset(id)
    return { ...handle, query: async (query) => {
      const first = id === 'calendar.note_date_sources' && ++reads === 1
      const result = await handle.query(query)
      if (first) await held
      return result
    } }
  }) as typeof dataset
  const first = renderHook(useNoteDateSources)
  const second = renderHook(useNoteDateSources)
  await act(async () => {
    await dataset('calendar.note_date_sources').update({ id: 'dates' }, { definition: { ...source, title: 'After' } })
    release()
  })
  await waitFor(() => expect(first.result.current[0]?.title).toBe('After'))
  expect(second.result.current).toBe(first.result.current)
  expect(reads).toBe(2)
  const later = renderHook(useNoteDateSources)
  await waitFor(() => expect(later.result.current).toBe(first.result.current))
  expect(reads).toBe(2)
})

it('retains note-date sources on a read failure and retries on the next relevant change', async () => {
  const source = { ...defaultNoteDateSource(), id: 'dates', title: 'Before' }
  const mock = createMockValleyApi({ manifest: { id: 'calendar' }, datasets: {
    'calendar.note_date_sources': [{ id: source.id, position: 0, definition: source }]
  } })
  initRuntime(mock.api)
  const dataset = mock.api.data.dataset
  let fail = false
  mock.api.data.dataset = ((id: string) => {
    const handle = dataset(id)
    return { ...handle, query: async (query) => {
      if (id === 'calendar.note_date_sources' && fail) throw new Error('Read unavailable')
      return handle.query(query)
    } }
  }) as typeof dataset
  const report = vi.spyOn(console, 'error').mockImplementation(() => {})
  const hook = renderHook(useNoteDateSources)
  await waitFor(() => expect(hook.result.current[0]?.title).toBe('Before'))
  await act(async () => {
    fail = true
    await dataset('calendar.note_date_sources').update({ id: 'dates' }, { definition: { ...source, title: 'Failed' } })
  })
  await waitFor(() => expect(report).toHaveBeenCalledOnce())
  expect(hook.result.current[0]?.title).toBe('Before')
  await act(async () => {
    fail = false
    await dataset('calendar.note_date_sources').update({ id: 'dates' }, { definition: { ...source, title: 'Recovered' } })
  })
  await waitFor(() => expect(hook.result.current[0]?.title).toBe('Recovered'))
})

it('fences pending pagination and removes read subscriptions when its runtime is unloaded', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  const dispose = initRuntime(mock.api)
  const dataset = mock.api.data.dataset
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  const off = vi.fn()
  const query = vi.fn(async () => { await held; return { rows: [], revision: 1, cursor: 'next-page' } })
  mock.api.data.dataset = ((id: string) => ({ ...dataset(id), query, subscribe: () => off })) as typeof dataset
  const pending = loadEvents()
  const rejected = expect(pending).rejects.toThrow('disposed')
  dispose()
  dispose()
  release()
  await rejected
  expect(query).toHaveBeenCalledOnce()
  expect(off).toHaveBeenCalledTimes(4)
  const next = createMockValleyApi({ manifest: { id: 'calendar' }, datasets: {
    'calendar.events': [{ id: 'moss', title: 'New vault', date: '2026-08-24' }]
  } })
  initRuntime(next.api)
  expect((await loadEvents())[0]?.title).toBe('New vault')
})

it('bounds retained ranges and concurrent reads, and does not poison retries after failure', async () => {
  const read = vi.fn(async (key: string) => key)
  const cache = createRevisionCache(read, 2)
  await cache.read('first')
  await cache.read('second')
  await cache.read('third')
  await cache.read('second')
  expect(read).toHaveBeenCalledTimes(3)
  await cache.read('first')
  expect(read).toHaveBeenCalledTimes(4)
  let release!: (value: string) => void
  const held = createRevisionCache(() => new Promise<string>((resolve) => { release = resolve }), 1)
  const pending = held.read('first')
  await expect(held.read('second')).rejects.toThrow('too many pending')
  release('complete')
  expect(await pending).toBe('complete')
  const retry = createRevisionCache(vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue('Recovered'))
  await expect(retry.read('first')).rejects.toThrow('Unavailable')
  expect(await retry.read('first')).toBe('Recovered')
})

it('shares note-date projections while distinguishing relevant raw values and year ranges', () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  const sources = [{ ...defaultNoteDateSource(), id: 'dates', matchValue: 'botany', dateField: 'date' }]
  const entries: IndexEntry[] = [{ relPath: 'Fern.md', title: 'Fern', kind: 'note', mtimeMs: 0, frontmatter: { type: 'botany', date: ['2026-08-24', 'Other'] } }]
  const first = projectNoteDates(entries, sources, [2026], 2026)
  expect(first).toHaveLength(1)
  expect(projectNoteDates(entries, sources, [2026], 2026)).toBe(first)
  const unrelated = entries.map((entry) => ({ ...entry, frontmatter: { ...entry.frontmatter, habitat: 'Forest' } }))
  expect(projectNoteDates(unrelated, sources, [2026], 2026)).toBe(first)
  const otherRange = projectNoteDates(entries, sources, [2027], 2027)
  expect(otherRange).toEqual(first)
  expect(otherRange).not.toBe(first)
  const changed = entries.map((entry) => ({ ...entry, frontmatter: { ...entry.frontmatter, date: '2026-08-24, Other' } }))
  expect(projectNoteDates(changed, sources, [2026], 2026)).toEqual([])
})

it('shares mounted item projections and avoids index work for unrelated state changes', async () => {
  const source = { ...defaultNoteDateSource(), id: 'dates', matchValue: 'botany' }
  const entries: IndexEntry[] = [{ relPath: 'Fern.md', title: 'Fern', kind: 'note', mtimeMs: 0, frontmatter: { type: 'botany', date: '2026-08-24' } }]
  const mock = createMockValleyApi({ manifest: { id: 'calendar' }, indexEntries: entries, datasets: {
    'calendar.note_date_sources': [{ id: source.id, position: 0, definition: source }]
  } })
  initRuntime(mock.api)
  const first = renderHook(() => useCalendarItems({ focusYear: 2026 }))
  const second = renderHook(() => useCalendarItems({ focusYear: 2026 }))
  await waitFor(() => expect(first.result.current.noteDates).toHaveLength(1))
  expect(second.result.current.noteDates).toBe(first.result.current.noteDates)
  const result = first.result.current
  await act(async () => { mock.emitState({ activePath: 'Moss.md', canGoBack: true }) })
  expect(first.result.current).toBe(result)
  await act(async () => { mock.emitState({ indexEntries: entries.map((entry) => ({ ...entry, frontmatter: { ...entry.frontmatter, date: '2026-08-25' } })) }) })
  expect(first.result.current.noteDates[0]?.date).toBe('2026-08-25')
  expect(second.result.current.noteDates).toBe(first.result.current.noteDates)
})

it('advances the shared year at local midnight and cancels its timer after the last subscriber', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59))
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  const dispose = initRuntime(mock.api)
  const first = renderHook(useCalendarYear)
  const second = renderHook(useCalendarYear)
  expect(first.result.current).toBe(2026)
  expect(vi.getTimerCount()).toBe(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(first.result.current).toBe(2027)
  expect(second.result.current).toBe(2027)
  first.unmount()
  expect(vi.getTimerCount()).toBe(1)
  second.unmount()
  expect(vi.getTimerCount()).toBe(0)
  dispose()
})

it('does not let an unmounted reload callback invalidate a later runtime', async () => {
  const first = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(first.api)
  const hook = renderHook(useSourcedItems)
  const reload = hook.result.current.reload
  hook.unmount()
  const second = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(second.api)
  const list = vi.fn(async () => [{ id: 'fern', title: 'New session', date: '2026-08-24' }])
  second.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: pagedSource(list) }, 'source')
  const accepted = await listSourcedItems()
  reload()
  expect(await listSourcedItems()).toBe(accepted)
  expect(list).toHaveBeenCalledOnce()
})

it('rechecks a settled range on a vault change even when no dataset event accompanies it', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' }, datasets: {
    'calendar.events': [{ id: 'fern', title: 'Origin', date: '2026-08-24' }]
  } })
  initRuntime(mock.api)
  const dataset = mock.api.data.dataset
  const query = vi.fn(async (request) => dataset('calendar.events').query(request))
  mock.api.data.dataset = ((id: string) => id === 'calendar.events' ? { ...dataset(id), query } : dataset(id)) as typeof dataset
  expect((await loadEvents())[0]?.title).toBe('Origin')
  mock.datasets.set('calendar.events', [{ id: 'moss', title: 'Destination', date: '2026-08-24' }])
  mock.emitState({ vault: { path: '/managed/destination', name: 'destination', displayName: 'Destination' } })
  expect((await loadEvents())[0]?.title).toBe('Destination')
  expect(query).toHaveBeenCalledTimes(2)
})

it('waits for every accepted provider before rerunning a dirty aggregate', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  let releaseFast!: () => void
  let releaseSlow!: () => void
  const fastHeld = new Promise<void>((resolve) => { releaseFast = resolve })
  const slowHeld = new Promise<void>((resolve) => { releaseSlow = resolve })
  const fast = vi.fn(async () => { await fastHeld; return [{ id: 'fern', title: 'Fern', date: '2026-08-24' }] })
  const slow = vi.fn(async () => { await slowHeld; return [{ id: 'moss', title: 'Moss', date: '2026-08-24' }] })
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: pagedSource(fast) }, 'fast')
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: pagedSource(slow) }, 'slow')
  const pending = listSourcedItems()
  mock.api.interop.state.publish(CALENDAR_ITEM_SOURCE_REVISION_V1, 1)
  releaseFast()
  await act(async () => {})
  expect(fast).toHaveBeenCalledOnce()
  expect(slow).toHaveBeenCalledOnce()
  releaseSlow()
  expect(await pending).toHaveLength(2)
  expect(fast).toHaveBeenCalledTimes(2)
  expect(slow).toHaveBeenCalledTimes(2)
})

it.each(['revision', 'failure'] as const)('settles every accepted relation read before a %s retry', async (trigger) => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' }, datasets: {
    'calendar.events': [{ id: 'fern', title: 'Fern', date: '2026-08-24' }]
  } })
  initRuntime(mock.api)
  const dataset = mock.api.data.dataset
  let releaseFast!: () => void
  let releaseSlow!: () => void
  const fastHeld = new Promise<void>((resolve) => { releaseFast = resolve })
  const slowHeld = new Promise<void>((resolve) => { releaseSlow = resolve })
  const calls: string[] = []
  mock.api.data.dataset = ((id: string) => {
    const handle = dataset(id)
    return { ...handle, query: async (request) => {
      const first = !calls.includes(id)
      calls.push(id)
      if (first && id === 'calendar.event_tags') {
        await fastHeld
        if (trigger === 'failure') throw new Error('Tags unavailable')
      }
      if (first && id === 'calendar.event_links') await slowHeld
      return handle.query(request)
    } }
  }) as typeof dataset
  let settled = false
  const pending = loadEvents()
  void pending.then(() => { settled = true }, () => { settled = true })
  const expected = trigger === 'failure' ? expect(pending).rejects.toThrow('Tags unavailable') : null
  await waitFor(() => expect(calls).toContain('calendar.event_attachments'))
  if (trigger === 'revision') await dataset('calendar.events').update({ id: 'fern' }, { title: 'Updated' })
  releaseFast()
  await act(async () => {})
  expect(settled).toBe(false)
  expect(calls.filter((id) => id === 'calendar.events')).toHaveLength(1)
  expect(calls.filter((id) => id === 'calendar.event_links')).toHaveLength(1)
  releaseSlow()
  if (expected) {
    await expected
    expect(calls.filter((id) => id === 'calendar.events')).toHaveLength(1)
    expect((await loadEvents())[0]?.title).toBe('Fern')
  } else {
    expect((await pending)[0]?.title).toBe('Updated')
  }
  expect(calls.filter((id) => id === 'calendar.events')).toHaveLength(2)
  expect(calls.filter((id) => id === 'calendar.event_links')).toHaveLength(2)
})
