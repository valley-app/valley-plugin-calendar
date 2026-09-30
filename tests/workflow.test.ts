import { describe, expect, it, vi } from 'vitest'
import { createMockValleyApi } from '@valley/plugin-testkit'
import type { PluginBackendApi, PluginBackendOperationContext, WorkflowExecutionResult } from '@valley/plugin-sdk'
import type { ValleyPluginManifest } from '@valley/plugin-sdk/types'
import { registerCalendarWorkflow } from '../src/workflow'
import { appendEvent, newEvent, updateEvent } from '../src/events'
import { initRuntime } from '../src/runtime'
import config from '../config.json'

function setup() {
  const mock = createMockValleyApi({ manifest: { id: 'calendar', noteDocuments: config.noteDocuments, datasets: config.datasets as unknown as ValleyPluginManifest['datasets'] } })
  const handlers = new Map<string, (input: unknown, context?: PluginBackendOperationContext) => unknown>()
  const emit = vi.fn(async (_service: string, _event: string, _payload: unknown) => {})
  const scopedEmit = vi.fn(async (_service: string, _event: string, _payload: unknown) => {})
  const report = vi.fn()
  const api = { index: mock.api.index, vault: mock.api.vault, notifications: { ...mock.api.notifications, onOccurrence: () => () => {} }, lifecycle: { onResume: () => () => {} }, i18n: { t: mock.api.ui.t, language: () => 'en', onLanguageChanged: () => () => {} }, pluginId: 'calendar', data: mock.api.data, documents: mock.api.documents, settings: mock.api.settings, services: { emit }, rpc: {
    emit: report,
    handle: (method: string, handler: (input: unknown) => unknown) => { handlers.set(method, handler); return () => { handlers.delete(method) } },
    handleOperation: (method: string, handler: (input: unknown, context: PluginBackendOperationContext) => unknown) => { handlers.set(method, handler as never); return () => { handlers.delete(method) } }
  } } as unknown as PluginBackendApi
  const off = registerCalendarWorkflow(api)
  mock.api.backend.call = async <T>(method: string, payload?: unknown) => await handlers.get(method)!(payload) as T
  const context = { id: 'run-action', api: { ...api, services: { emit: scopedEmit } } } as unknown as PluginBackendOperationContext
  const execute = (nodeTypeId: string, parameters: Record<string, unknown> = {}) => handlers.get('workflow.execute')!({ nodeTypeId, parameters, items: [{ json: {} }] }, context) as Promise<WorkflowExecutionResult>
  return { mock, handlers, emit, scopedEmit, report, off, execute }
}

describe('Calendar workflow contribution', () => {
  it('creates, gets, updates and lists local events with scoped commit events', async () => {
    const h = setup()
    const record = (await h.execute('event.create', { title: 'Survey', date: '2026-10-01', startTime: '10:00', endTime: '11:00' })).items[0].json
    expect(record).toMatchObject({ title: 'Survey', allDay: false })
    expect(h.scopedEmit).toHaveBeenCalledWith('workflow.provider', 'event.created', expect.objectContaining({ record: expect.objectContaining({ id: record.id }) }))
    await h.execute('event.update', { id: record.id, note: 'Bring samples' })
    await h.execute('event.update', { id: record.id, endTime: '12:00' })
    expect((await h.execute('event.get', { id: record.id })).items[0].json).toMatchObject({ note: 'Bring samples', startTime: '10:00', endTime: '12:00' })
    expect((await h.execute('event.list', { from: '2026-10-01', to: '2026-10-01' })).items).toHaveLength(1)
    expect((await h.execute('event.list', { from: '2026-10-02' })).items).toHaveLength(0)
    expect(h.emit).not.toHaveBeenCalled()
    await h.off()
    expect(h.handlers.size).toBe(0)
  })

  it('rejects invalid dates, reversed times and unknown records', async () => {
    const h = setup()
    await expect(h.execute('event.create', { title: 'Invalid', date: '2026-02-30' })).rejects.toThrow('valid event date')
    await expect(h.execute('event.create', { title: 'Invalid', date: '2026-10-01', startTime: '12:00', endTime: '11:00' })).rejects.toThrow('end time')
    await expect(h.execute('event.update', { id: 'missing', note: 'Text' })).rejects.toThrow('no longer exists')
    expect(h.scopedEmit).not.toHaveBeenCalled()
    expect((await h.execute('event.list')).items).toEqual([])
    await h.off()
  })

  it('retains UI save and undo success after event delivery fails without swallowing failed commits', async () => {
    const h = setup()
    const dispose = initRuntime(h.mock.api)
    h.emit.mockRejectedValue(new Error('Event transport unavailable'))
    const record = newEvent('Saved event', '2026-09-30')
    expect(await appendEvent(record)).toBe(true)
    expect(h.report).toHaveBeenCalledWith('records.eventDeliveryFailed', expect.objectContaining({ event: 'event.created', recordId: record.id }))
    expect(h.mock.undoActions).toHaveLength(1)
    expect((await h.mock.undoActions[0].undo()).ok).toBe(true)
    expect((await h.mock.undoActions[0].redo!()).ok).toBe(true)
    expect(await updateEvent(record.id, { ...record, title: 'Edited event' })).toBe(true)
    expect((await h.mock.undoActions[1].undo()).ok).toBe(true)
    expect((await h.execute('event.get', { id: record.id })).items[0].json.title).toBe('Saved event')
    h.emit.mockClear()
    vi.spyOn(h.mock.api.data, 'transaction').mockRejectedValueOnce(new Error('Database unavailable'))
    expect(await appendEvent({ ...record, id: 'not-saved' })).toBe(false)
    expect(h.mock.undoActions).toHaveLength(2)
    expect(h.emit).not.toHaveBeenCalled()
    expect(h.mock.datasets.get('calendar.events')).toHaveLength(1)
    h.scopedEmit.mockRejectedValueOnce(new Error('Event transport unavailable'))
    await expect(h.execute('event.create', { title: 'Workflow commit', date: '2026-10-01' })).rejects.toMatchObject({ outcomeUnknown: true, committed: true })
    await dispose()
    await h.off()
  })
})
