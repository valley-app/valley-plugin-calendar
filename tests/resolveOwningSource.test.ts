import { afterEach, expect, it, vi } from 'vitest'
import { CALENDAR_ITEM_SOURCE_V2, CALENDAR_ITEM_SOURCE_TOTAL_LIMIT, type CalendarItemSourceRequest, type CalendarSourceItem } from '@valley/plugin-sdk'
import { createMockValleyApi } from './harness'
import { initRuntime } from '../src/runtime'
import { resolveCalendarTarget } from '../src/commands'

afterEach(() => { vi.restoreAllMocks() })

const item = (id: string): CalendarSourceItem => ({ id, title: id, date: '2026-08-24' })
const overLimit = async (request: CalendarItemSourceRequest) => {
  const offset = Number(request.cursor ?? 0)
  return { items: Array.from({ length: request.limit }, (_, index) => item(`contact-${offset + index}`)), revision: '1', ...(offset + request.limit <= CALENDAR_ITEM_SOURCE_TOTAL_LIMIT ? { cursor: String(offset + request.limit) } : {}) }
}

it('resolves an item from its owning source even when an unrelated source exceeds the range limit', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  const contacts = vi.fn(overLimit)
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: contacts }, 'contacts')
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: async () => ({ items: [item('oak')], revision: '1' }) }, 'todo')
  const todo = mock.api.interop.services.providers(CALENDAR_ITEM_SOURCE_V2).find(source => source.owner === 'todo')!.providerId
  await expect(resolveCalendarTarget({ sourceId: todo, id: 'oak' })).resolves.toMatchObject({ kind: 'sourced', id: 'oak' })
  expect(contacts).not.toHaveBeenCalled()
})

it('still fails strictly when the owning source cannot be read', async () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  initRuntime(mock.api)
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: overLimit }, 'contacts')
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: async () => ({ items: [item('oak')], revision: '1' }) }, 'todo')
  const contacts = mock.api.interop.services.providers(CALENDAR_ITEM_SOURCE_V2).find(source => source.owner === 'contacts')!.providerId
  await expect(resolveCalendarTarget({ sourceId: contacts, id: 'contact-0' })).rejects.toThrow('contacts')
})
