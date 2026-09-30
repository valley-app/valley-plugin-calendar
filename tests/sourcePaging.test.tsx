import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CALENDAR_ITEM_SOURCE_V1, CALENDAR_ITEM_SOURCE_V2, CALENDAR_ITEM_SOURCE_REVISION_V1, type CalendarItemSourceRequest, type CalendarSourceItem } from '@valley/plugin-sdk'
import { createMockValleyApi } from './harness'
import { initRuntime } from '../src/runtime'
import { createSourcedItem, listSourcedItems, useSourcedItems } from '../src/itemSources'
import { persistItemMove, sourcedToItem } from '../src/items'
import { editCalendarValues } from '../src/commands'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const range = { startDate: '2026-08-01', endDate: '2026-08-31' }
const item = (id: string, title = id): CalendarSourceItem => ({ id, title, date: '2026-08-24' })

it('shares a bounded range across surfaces and publishes only a complete page set', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const list = vi.fn(async (request: CalendarItemSourceRequest) => {
    const offset = Number(request.cursor ?? 0)
    if (offset) await held
    return { items: Array.from({ length: Math.min(request.limit, 300 - offset) }, (_, index) => item(String(offset + index))), revision: '1', ...(offset ? {} : { cursor: '256' }) }
  })
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list }, 'provider')
  const main = renderHook(() => useSourcedItems(range.startDate, range.endDate))
  const sidebar = renderHook(() => useSourcedItems(range.startDate, range.endDate))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  expect(main.result.current.items).toEqual([])
  expect(sidebar.result.current.items).toEqual([])
  await act(async () => { release() })
  await waitFor(() => expect(main.result.current.items).toHaveLength(300))
  expect(sidebar.result.current.items).toBe(main.result.current.items)
  expect(list.mock.calls.map(([request]) => request)).toEqual([{ ...range, limit: 256 }, { ...range, limit: 256, cursor: '256' }])
})

it('keeps a working v2 source visible and names an incompatible v1 source without invoking it', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  const legacy = vi.fn(async () => [item('legacy')])
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V1, { list: legacy }, 'old-planner')
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: async () => ({ items: [item('modern')], revision: '1' }) }, 'new-planner')
  const hook = renderHook(() => useSourcedItems(range.startDate, range.endDate))
  await waitFor(() => expect(hook.result.current.items).toHaveLength(1))
  expect(hook.result.current.items[0].item.id).toBe('modern')
  expect(hook.result.current.errors).toEqual([{ owner: 'old-planner', message: expect.stringContaining('incompatible') }])
  expect(legacy).not.toHaveBeenCalled()
  await expect(listSourcedItems(true, range.startDate, range.endDate)).rejects.toThrow('old-planner')
})

it('discards every page of a superseded revision before publishing a replacement', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  let revision = 1
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const list = vi.fn(async (request: CalendarItemSourceRequest) => {
    const accepted = revision
    if (request.cursor && accepted === 1) await held
    return { items: [item(request.cursor ? 'second' : 'first', `revision ${accepted}`)], revision: String(accepted), ...(request.cursor ? {} : { cursor: 'next' }) }
  })
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list }, 'provider')
  const hook = renderHook(() => useSourcedItems(range.startDate, range.endDate))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  await act(async () => {
    revision = 2
    mock.api.interop.state.publish(CALENDAR_ITEM_SOURCE_REVISION_V1, revision)
    release()
  })
  await waitFor(() => expect(hook.result.current.items).toHaveLength(2))
  expect(hook.result.current.items.map(value => value.item.title)).toEqual(['revision 2', 'revision 2'])
  expect(list).toHaveBeenCalledTimes(4)
})

it.each(['duplicates', 'cursor', 'revision', 'out-of-range'] as const)('rejects %s pages without showing partial provider items', async failure => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: async (request: CalendarItemSourceRequest) => ({
    items: [failure === 'out-of-range' ? { ...item('old'), date: '2020-01-01' } : item(!request.cursor || failure === 'duplicates' ? 'first' : 'second')],
    revision: request.cursor && failure === 'revision' ? '2' : '1',
    ...(!request.cursor || failure === 'cursor' ? { cursor: 'same' } : {})
  }) }, 'provider')
  const hook = renderHook(() => useSourcedItems(range.startDate, range.endDate))
  await waitFor(() => expect(hook.result.current.errors).toHaveLength(1))
  expect(hook.result.current.items).toEqual([])
})

it('includes overlapping spans and fails explicitly when the total range budget is exhausted', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  const remove = mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: async () => ({ items: [{ ...item('span'), date: '2026-07-30', endDate: '2026-08-02' }], revision: '1' }) }, 'spans')
  expect(await listSourcedItems(true, range.startDate, range.endDate)).toHaveLength(1)
  remove()
  const list = vi.fn(async (request: CalendarItemSourceRequest) => {
    const offset = Number(request.cursor ?? 0)
    return { items: Array.from({ length: 256 }, (_, index) => item(String(offset + index))), revision: '1', cursor: String(offset + 256) }
  })
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list }, 'large')
  await expect(listSourcedItems(true, range.startDate, range.endDate)).rejects.toThrow('10000')
  expect(list).toHaveBeenCalledTimes(40)
})

it('moves both ends of a contributed span and preserves them during a timed resize', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  const update = vi.fn(async () => true)
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: async () => ({ items: [{ ...item('span'), date: '2026-08-20', endDate: '2026-08-23' }], revision: '1' }), update }, 'spans')
  const [source] = await listSourcedItems(true, range.startDate, range.endDate)
  const grabbed = { ...sourcedToItem(source), date: '2026-08-22' }
  await persistItemMove(grabbed, '2026-08-29', undefined, undefined)
  expect(update).toHaveBeenLastCalledWith('span', { date: '2026-08-27', endDate: '2026-08-30', startTime: undefined, endTime: undefined })
  await persistItemMove(grabbed, '2026-08-22', '09:00', '11:00')
  expect(update).toHaveBeenLastCalledWith('span', { date: '2026-08-20', endDate: '2026-08-23', startTime: '09:00', endTime: '11:00' })
  await editCalendarValues({ id: 'span', sourceId: source.sourceId }, { date: '2026-08-27' })
  expect(update).toHaveBeenLastCalledWith('span', { date: '2026-08-27', endDate: '2026-08-30' })
})

it('hides the previous range immediately and ignores its delayed refresh after navigation', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  let hold = false
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const list = vi.fn(async (request: CalendarItemSourceRequest) => {
    if (hold && request.startDate === range.startDate) await held
    return { items: [{ id: request.startDate, title: request.startDate, date: request.startDate }], revision: '1' }
  })
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list }, 'provider')
  const hook = renderHook(({ start, end }) => useSourcedItems(start, end), { initialProps: { start: range.startDate, end: range.endDate } })
  await waitFor(() => expect(hook.result.current.items).toHaveLength(1))
  act(() => { hold = true; hook.result.current.reload() })
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  hook.rerender({ start: '2026-09-01', end: '2026-09-30' })
  expect(hook.result.current.items).toEqual([])
  await waitFor(() => expect(hook.result.current.items[0]?.item.date).toBe('2026-09-01'))
  await act(async () => { release() })
  expect(hook.result.current.items[0].item.date).toBe('2026-09-01')
})

it.each([
  { title: ' ' }, { date: '2026-02-30' }, { startTime: '25:00' }, { endTime: '10:00' },
  { startTime: '10:00', endTime: '09:00' }, { completed: 'yes' }, { note: {} },
  { location: { name: 'Forest', lat: 95 } }, { tags: 'fern' }, { fields: [{ key: 'Age', value: 3 }] }
])('rejects a malformed contribution without rendering partial data: %j', async invalid => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: async () => ({ items: [{ ...item('invalid'), ...invalid } as CalendarSourceItem], revision: '1' }) }, 'provider')
  await expect(listSourcedItems(true, range.startDate, range.endDate)).rejects.toThrow()
})

it('validates the fixed creation shape before invoking its owner', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  const create = vi.fn(async () => true)
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: async () => ({ items: [], revision: '1' }), create }, 'provider')
  const source = mock.api.interop.services.providers(CALENDAR_ITEM_SOURCE_V2)[0]
  expect(await createSourcedItem(source.providerId, '2026-08-24', { title: ' ' })).toBe(false)
  expect(await createSourcedItem(source.providerId, '2026-08-24', { title: 'Survey', startTime: '25:00' })).toBe(false)
  expect(create).not.toHaveBeenCalled()
  expect(await createSourcedItem(source.providerId, '2026-08-24', { title: 'Survey', startTime: '09:00', endTime: '10:00', location: { name: 'Forest' }, note: 'Bring labels.' })).toBe(true)
  expect(create).toHaveBeenCalledTimes(1)
})
