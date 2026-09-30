import { createCalendarDomain } from '../src/domain'
import { vi } from 'vitest'
import { createMockValleyApi as createBaseMock } from '@valley/plugin-testkit'
import type { CalendarItemSourceRequest, CalendarSourceItem } from '@valley/plugin-sdk'
export * from '@valley/plugin-testkit'

export function createMockValleyApi(options: Parameters<typeof createBaseMock>[0] = {}) {
  const mock = createBaseMock({ ...options, manifest: { ...options.manifest, indexState: 'scoped' } })
  const domain = createCalendarDomain(mock.api)
  const previous = mock.api.backend.call
  mock.api.backend.call = vi.fn(async <T>(method: string, payload?: unknown): Promise<T> => {
    const input = payload as { record: Parameters<typeof domain.append>[0]; id: string; expectedUpdatedAt?: string; documentRevision?: Parameters<typeof domain.update>[3] }
    if (method === 'records.append') return await domain.append(input.record) as T
    if (method === 'records.update') return await domain.update(input.id, input.record, input.expectedUpdatedAt, input.documentRevision) as T
    if (method === 'records.delete') return await domain.remove(input.id) as T
    return previous<T>(method, payload)
  }) as typeof mock.api.backend.call
  return mock
}

export function pagedSource(read: () => Promise<CalendarSourceItem[]>) {
  return async ({ startDate, endDate, limit, cursor }: CalendarItemSourceRequest) => {
    const all = (await read()).filter(item => item.date <= endDate && (item.endDate ?? item.date) >= startDate)
    const offset = Number(cursor ?? 0)
    return { items: all.slice(offset, offset + limit), revision: 'fixture', ...(offset + limit < all.length ? { cursor: String(offset + limit) } : {}) }
  }
}
