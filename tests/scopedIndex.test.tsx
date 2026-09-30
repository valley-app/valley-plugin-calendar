import * as React from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PluginIndexPage } from '@valley/plugin-sdk'
import { createMockValleyApi } from './harness'
import { initRuntime } from '../src/runtime'
import { useNoteIndex } from '../src/noteIndex'
import { buildNoteDates, defaultNoteDateSource } from '../src/noteDates'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { cleanup(); for (const dispose of cleanups.splice(0)) await dispose(); vi.restoreAllMocks() })
const source = { ...defaultNoteDateSource(), id: 'dates', matchKey: 'type', matchValue: 'project', dateField: 'due', labelMode: 'property' as const, labelField: 'label', startTimeField: 'start', showFields: ['owner'] }
const note = (id: number) => ({ relPath: `Projects/${id}.md`, title: String(id), kind: 'note' as const, mtimeMs: 1, frontmatter: { type: 'project', due: '2026-08-24', label: `Project ${id}`, start: '09:00', owner: 'Fern', unrelated: 'omit' } })

it('shares one scoped observation and ignores unused metadata changes while preserving note-date fields', async () => {
  const entries = Array.from({ length: 200 }, (_, index) => note(index))
  const mock = createMockValleyApi({ manifest: { id: 'calendar', indexState: 'scoped' }, indexEntries: entries })
  cleanups.push(initRuntime(mock.api))
  const observe = vi.spyOn(mock.api.index, 'observe')
  const first = renderHook(() => useNoteIndex([source]))
  const second = renderHook(() => useNoteIndex([source]))
  await waitFor(() => expect(first.result.current).toHaveLength(200))
  expect(second.result.current).toBe(first.result.current)
  expect(observe).toHaveBeenCalledOnce()
  expect(observe).toHaveBeenCalledWith({ kinds: ['note'], fields: ['excluded', 'frontmatter', 'kind', 'title'], frontmatterKeys: ['due', 'label', 'owner', 'start', 'type'] }, expect.any(Function))
  expect(mock.api.getState().indexEntries).toEqual([])
  expect(first.result.current[0].frontmatter).not.toHaveProperty('unrelated')
  expect(buildNoteDates(first.result.current, [source], [2026], 2026)[0]).toMatchObject({ title: 'Project 0', date: '2026-08-24', startTime: '09:00', fields: [{ key: 'owner', value: 'Fern' }] })
  const before = first.result.current
  await act(async () => { mock.emitState({ indexEntries: entries.map(entry => ({ ...entry, mtimeMs: 2, frontmatter: { ...entry.frontmatter, unrelated: 'changed' } })) }) })
  expect(first.result.current).toBe(before)
  await act(async () => { mock.emitState({ indexEntries: entries.map(entry => ({ ...entry, frontmatter: { ...entry.frontmatter, due: '2026-08-25' } })) }) })
  await waitFor(() => expect(first.result.current[0].frontmatter?.due).toBe('2026-08-25'))
})

it('releases the last view and joins an accepted read before runtime teardown finishes', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar', indexState: 'scoped' }, indexEntries: [note(1)] })
  const dispose = initRuntime(mock.api)
  const observe = mock.api.index.observe
  let release!: (page: PluginIndexPage) => void
  let accepted: PluginIndexPage | undefined
  const held = new Promise<PluginIndexPage>(resolve => { release = resolve })
  const closed = vi.fn()
  vi.spyOn(mock.api.index, 'observe').mockImplementation(async (scope, listener) => {
    const handle = await observe(scope, listener)
    return { read: async request => { accepted = await handle.read(request); return held }, dispose: async () => { closed(); await handle.dispose() } }
  })
  const first = renderHook(() => useNoteIndex([source]))
  const second = renderHook(() => useNoteIndex([source]))
  await waitFor(() => expect(accepted).toBeDefined())
  first.unmount()
  expect(closed).not.toHaveBeenCalled()
  second.unmount()
  const settled = vi.fn()
  const pending = dispose().then(settled)
  await act(async () => {})
  expect(closed).toHaveBeenCalledOnce()
  expect(settled).not.toHaveBeenCalled()
  release(accepted!)
  await pending
  expect(settled).toHaveBeenCalledOnce()
})

it('uses separate settings and projection scopes and releases a replaced source selection', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar', indexState: 'scoped' }, indexEntries: [note(1)] })
  cleanups.push(initRuntime(mock.api))
  const observe = mock.api.index.observe
  const closed = vi.fn()
  vi.spyOn(mock.api.index, 'observe').mockImplementation(async (scope, listener) => {
    const handle = await observe(scope, listener)
    return { ...handle, dispose: async () => { closed(); await handle.dispose() } }
  })
  const settings = renderHook(() => useNoteIndex())
  const projection = renderHook(({ field }) => useNoteIndex([{ ...source, dateField: field }]), { initialProps: { field: 'due' } })
  await waitFor(() => expect(projection.result.current).toHaveLength(1))
  expect(settings.result.current[0].frontmatter).toHaveProperty('unrelated', 'omit')
  projection.rerender({ field: 'other' })
  await waitFor(() => expect(closed).toHaveBeenCalledOnce())
  await waitFor(() => expect(projection.result.current[0]?.frontmatter).not.toHaveProperty('due'))
  expect(mock.api.index.observe).toHaveBeenCalledTimes(3)
})

it('keeps a resumed StrictMode observation shared with later surfaces', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar', indexState: 'scoped' }, indexEntries: [note(1)] })
  cleanups.push(initRuntime(mock.api))
  const observe = vi.spyOn(mock.api.index, 'observe')
  const first = renderHook(() => useNoteIndex([source]), { wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode> })
  await waitFor(() => expect(first.result.current).toHaveLength(1))
  const observations = observe.mock.calls.length
  const second = renderHook(() => useNoteIndex([source]))
  await waitFor(() => expect(second.result.current).toBe(first.result.current))
  expect(observe).toHaveBeenCalledTimes(observations)
})
