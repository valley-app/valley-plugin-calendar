import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it, vi } from 'vitest'
import type { DataRecord, LeafPane, ValleyPluginManifest } from '@valley/plugin-sdk/types'
import { CALENDAR_ITEM_SOURCE_V2, type CalendarItemPatch, type CalendarSourceItem } from '@valley/plugin-sdk'
import { createMockValleyApi, type MockValleyApi } from './harness'
import { initRuntime as initCalendarRuntime } from '../src/runtime'
import { openCalendarPage, registerCalendarCommands } from '../src/commands'
import config from '../config.json'

function validatePublishedResults(mock: { api: import('@valley/plugin-sdk').ValleyPluginApi }): void {
  const original = mock.api.commands.register
  vi.spyOn(mock.api.commands, 'register').mockImplementation(definition => {
    const schema = (definition as typeof definition & { outputSchema?: Record<string, unknown> }).outputSchema
    expect(schema, definition.id).toBeDefined()
    const validate = new Ajv2020({ strict: false, strictSchema: true, allowUnionTypes: true, ownProperties: true, validateFormats: false }).compile(schema!)
    expect(validate({ unexpected: true }), definition.id).toBe(false)
    return original({ ...definition, run: async (input, context) => {
      const result = await definition.run(input, context)
      const value = definition.sideEffect === 'write' ? (result as { value: unknown }).value : result
      expect(validate(value), `${definition.id}: ${JSON.stringify(validate.errors)}`).toBe(true)
      return result
    } } as typeof definition)
  })
}

/** A main pane that behaves like the host's tab placement: an open plugin tab is revealed, `newTab` adds a tab and any other
 *  open retargets the active tab. The changed layout reaches the plugin after the call returns, as a state update. */
function simulatedPane(mock: MockValleyApi): LeafPane {
  const pane: LeafPane = { type: 'leaf', id: 'pane-main', activeTabId: 'note', tabs: [{ id: 'note', folderPath: 'Field notes/moss.md' }] }
  const listeners = new Set<() => void>()
  let created = 0
  vi.spyOn(mock.api, 'subscribe').mockImplementation(listener => { listeners.add(listener); return () => { listeners.delete(listener) } })
  vi.mocked(mock.api.workspace.captureLayout).mockImplementation(() => ({ layout: structuredClone(pane), activePaneId: pane.id, leftSidebarWidth: 260, leftSidebarVisible: true }))
  vi.mocked(mock.api.workspace.openMainTab).mockImplementation(options => {
    setTimeout(() => {
      const open = pane.tabs.find(tab => tab.kind === 'plugin' && tab.pluginId === 'calendar')
      if (open) pane.activeTabId = open.id
      else if (options?.newTab) { const id = `calendar-${++created}`; pane.tabs.push({ id, folderPath: '', kind: 'plugin', pluginId: 'calendar' }); pane.activeTabId = id }
      else Object.assign(pane.tabs.find(tab => tab.id === pane.activeTabId)!, { kind: 'plugin', pluginId: 'calendar' })
      listeners.forEach(listener => listener())
    }, 20)
  })
  return pane
}

describe('calendar commands (bus)', () => {
  function setup(events: DataRecord[] = []): MockValleyApi {
    const mock = createMockValleyApi({
      manifest: { id: 'calendar', datasets: config.datasets as unknown as ValleyPluginManifest['datasets'], noteDocuments: config.noteDocuments },
      datasets: {
        'calendar.events': events,
        'calendar.event_tags': [],
        'calendar.event_links': [],
        'calendar.event_attachments': []
      }
    })
    validatePublishedResults(mock)
    initCalendarRuntime(mock.api)
    registerCalendarCommands(mock.api)
    return mock
  }

  it('calendar:add appends an event and reverts', async () => {
    const mock = setup()
    const r = await mock.api.commands.execute('calendar:add', { title: 'Survey', date: '2026-06-20', start: '14:00', end: '16:00' })
    expect(r.ok).toBe(true)
    expect(mock.datasets.get('calendar.events')?.[0]).toMatchObject({ title: 'Survey', date: '2026-06-20', startTime: '14:00', endTime: '16:00' })
    await mock.busUndo[0].undo()
    expect(mock.datasets.get('calendar.events') ?? []).toHaveLength(0)
  })

  it('calendar:list returns events inside the window, sorted by date', async () => {
    const mock = setup([
      { id: '1', title: 'B', date: '2026-06-21' } as DataRecord,
      { id: '2', title: 'A', date: '2026-06-20' } as DataRecord,
      { id: '3', title: 'C', date: '2026-07-01' } as DataRecord
    ])
    const r = await mock.api.commands.execute('calendar:list', { from: '2026-06-01', to: '2026-06-30' })
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.value as { date: string }[]).map((e) => e.date)).toEqual(['2026-06-20', '2026-06-21'])
  })

  it('calendar:goto patches the shared time control', async () => {
    const mock = setup()
    const r = await mock.api.commands.execute('calendar:goto', { date: '2026-06-20' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toMatchObject({ selectedDate: '2026-06-20', cursor: '2026-06-01' })
  })

  it('settles goto and today to a plain time-control value when the sandboxed host answers patchTimeControl asynchronously', async () => {
    const mock = setup()
    const host = mock.api.workspace.patchTimeControl.bind(mock.api.workspace)
    vi.spyOn(mock.api.workspace, 'patchTimeControl').mockImplementation(patch => Promise.resolve(host(patch)) as never)
    for (const [id, input] of [['calendar:goto', { date: '2026-06-20' }], ['calendar:today', undefined]] as const) {
      const r = await mock.api.commands.execute(id, input)
      expect(r.ok, id).toBe(true)
      if (!r.ok) continue
      expect(r.value, id).not.toBeInstanceOf(Promise)
      expect(Object.getPrototypeOf(r.value), id).toBe(Object.prototype)
      expect(r.value, id).toMatchObject({ selectedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    }
  })

  it('declares the persisted time-selection commands goto and today as non-undoable writes with a side-effect-free preview', async () => {
    const mock = setup()
    for (const id of ['calendar:goto', 'calendar:today']) expect(mock.api.commands.describe(id), id).toMatchObject({ sideEffect: 'write', previewSupported: true })
    const before = structuredClone(mock.timeControl())
    expect(await mock.api.commands.preview('calendar:goto', { date: '2026-06-20' })).toEqual({ ok: true, value: { cursor: '2026-06-01', selectedDate: '2026-06-20' } })
    expect(await mock.api.commands.preview('calendar:today', undefined)).toMatchObject({ ok: true, value: { selectedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } })
    expect(mock.timeControl()).toEqual(before)
    const undo = mock.busUndo.length
    expect(await mock.api.commands.execute('calendar:goto', { date: '2026-06-20' })).toMatchObject({ ok: true, value: { selectedDate: '2026-06-20', cursor: '2026-06-01' } })
    expect(await mock.api.commands.execute('calendar:today', undefined)).toMatchObject({ ok: true, value: { selectedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } })
    expect(mock.busUndo).toHaveLength(undo)
  })

  it('validates local item and navigation results through their exact published contracts while retaining revisions and undo', async () => {
    const mock = setup()
    const created = await mock.api.commands.execute('calendar:add', { title: 'Fern survey', date: '2026-06-20' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const event = created.value as { id: string; updatedAt: string }
    for (const command of ['get', 'open']) expect(await mock.api.commands.execute(`calendar:${command}`, { id: event.id })).toMatchObject({ ok: true, value: { kind: 'event', id: event.id } })
    const edited = await mock.api.commands.execute('calendar:edit-fields', { id: event.id, expectedUpdatedAt: event.updatedAt, values: { note: '', tags: [], location: null } })
    expect(edited, JSON.stringify(edited)).toMatchObject({ ok: true, value: { kind: 'event', note: '', tags: [] } })
    expect(await mock.api.commands.execute('calendar:edit-fields', { id: event.id, expectedUpdatedAt: 'stale', values: { note: 'Refused' } })).toMatchObject({ ok: false })
    expect(await mock.api.commands.execute('calendar:list-items', {})).toMatchObject({ ok: true, value: [{ id: event.id }] })
    expect(await mock.api.commands.execute('calendar:delete', { id: event.id })).toMatchObject({ ok: true, value: { id: event.id } })
    await mock.busUndo.at(-1)!.undo()
    expect(await mock.api.commands.execute('calendar:get', { id: event.id })).toMatchObject({ ok: true })
    expect(await mock.api.commands.execute('calendar:set-view', { view: 'week' })).toMatchObject({ ok: true, value: { view: 'week' } })
    expect(await mock.api.commands.execute('calendar:today', undefined)).toMatchObject({ ok: true })
    simulatedPane(mock)
    expect(await mock.api.commands.execute('calendar:open-page', undefined)).toMatchObject({ ok: true, value: { tabId: 'calendar-1', opened: 'new' } })
  })

  it('opens the Calendar page in a new tab beside the current one, or shows the open Calendar tab, and names that tab', async () => {
    const mock = setup(), pane = simulatedPane(mock)
    expect(await mock.api.commands.execute('calendar:open-page', undefined)).toEqual({ ok: true, value: { tabId: 'calendar-1', paneId: 'pane-main', opened: 'new', active: true } })
    expect(mock.api.workspace.openMainTab).toHaveBeenLastCalledWith({ newTab: true })
    expect(pane.tabs.map(tab => [tab.id, tab.pluginId ?? tab.folderPath])).toEqual([['note', 'Field notes/moss.md'], ['calendar-1', 'calendar']])
    pane.activeTabId = 'note'
    expect(await mock.api.commands.execute('calendar:open-page', undefined)).toEqual({ ok: true, value: { tabId: 'calendar-1', paneId: 'pane-main', opened: 'existing', active: true } })
    expect(mock.api.workspace.openMainTab).toHaveBeenLastCalledWith(undefined)
    expect(pane.tabs).toHaveLength(2)
    expect(mock.api.commands.describe('calendar:open-page')).toMatchObject({ sideEffect: 'read' })
    vi.mocked(mock.api.workspace.openMainTab).mockImplementation(() => {})
    pane.tabs.pop(); pane.activeTabId = 'note'
    await expect(openCalendarPage(mock.api, 50)).rejects.toThrow('The Calendar page did not open.')
  })

  it('validates contributed source results and actions through the same provider without treating an unavailable owner as success', async () => {
    const mock = setup(), items: CalendarSourceItem[] = [{ id: 'oak', title: 'Oak', date: '2026-06-20', completed: false, tags: [], note: '' }]
    const create = vi.fn(async (date: string, patch: CalendarItemPatch) => { items.push({ id: 'new', date, title: patch.title!, ...patch }); return true })
    const update = vi.fn(async (id: string, patch: CalendarItemPatch) => { Object.assign(items.find(item => item.id === id)!, patch); return true })
    const action = vi.fn(async (_id: string, _action: string) => true)
    const release = mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list: async () => ({ items, revision: 'source:1' }), create, update, remove: async (id: string) => { items.splice(items.findIndex(item => item.id === id), 1); return true }, actions: async () => [{ id: 'mark', label: 'Mark', enabled: false, submenu: [{ id: 'edit', label: 'Edit' }] }], runAction: action }, 'specimens')
    const sourceId = mock.api.interop.services.providers(CALENDAR_ITEM_SOURCE_V2)[0].providerId
    expect(await mock.api.commands.execute('calendar:sources', undefined)).toMatchObject({ ok: true, value: [{ sourceId, owner: 'specimens' }] })
    expect(await mock.api.commands.execute('calendar:source-actions', { sourceId, id: 'oak' })).toMatchObject({ ok: true, value: [{ enabled: false, submenu: [{ id: 'edit' }] }] })
    expect(await mock.api.commands.execute('calendar:get', { sourceId, id: 'oak' })).toMatchObject({ ok: true, value: { kind: 'sourced', completed: false, note: '' } })
    expect(await mock.api.commands.execute('calendar:edit-fields', { sourceId, id: 'oak', values: { completed: false, tags: [], note: '' } })).toMatchObject({ ok: true })
    expect(update).toHaveBeenCalledWith('oak', { completed: false, tags: [], note: '' })
    expect(await mock.api.commands.execute('calendar:source-create', { sourceId, date: '2026-06-21', values: { title: 'Fern' } })).toMatchObject({ ok: true, value: true })
    expect(create).toHaveBeenCalledOnce()
    expect(await mock.api.commands.execute('calendar:source-action', { sourceId, id: 'oak', actionId: 'mark' })).toMatchObject({ ok: true, value: true })
    expect(action).toHaveBeenCalledWith('oak', 'mark')
    release()
    expect(await mock.api.commands.execute('calendar:source-action', { sourceId, id: 'oak', actionId: 'mark' })).toMatchObject({ ok: false })
    expect(action).toHaveBeenCalledOnce()
  })
})

describe('calendar command refusals and yearly sources', () => {
  function setupWithDefinitions(): { mock: MockValleyApi; run: (id: string, raw: unknown) => Promise<unknown> } {
    const mock = createMockValleyApi({
      manifest: { id: 'calendar', datasets: config.datasets as unknown as ValleyPluginManifest['datasets'], noteDocuments: config.noteDocuments },
      datasets: { 'calendar.events': [], 'calendar.event_tags': [], 'calendar.event_links': [], 'calendar.event_attachments': [] }
    })
    const definitions = new Map<string, { run: (input: unknown, context: unknown) => Promise<unknown>; input?: { parse: (raw: unknown) => unknown } }>()
    const original = mock.api.commands.register
    vi.spyOn(mock.api.commands, 'register').mockImplementation(definition => {
      definitions.set(definition.id, definition as never)
      return original(definition)
    })
    initCalendarRuntime(mock.api)
    registerCalendarCommands(mock.api)
    const run = (id: string, raw: unknown) => { const definition = definitions.get(id)!; return definition.run(definition.input ? definition.input.parse(raw) : raw, {}) }
    return { mock, run }
  }

  it('reports refusals that happen before any effect as not applied', async () => {
    const { mock, run } = setupWithDefinitions()
    const created = await mock.api.commands.execute('calendar:add', { title: 'Fern survey', date: '2026-06-20' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const event = created.value as { id: string }
    await expect(run('edit-fields', { id: event.id, expectedUpdatedAt: 'stale', values: { note: 'Refused' } })).rejects.toMatchObject({ outcome: 'not-applied' })
    await expect(run('edit-fields', { id: event.id, values: { completed: true } })).rejects.toMatchObject({ outcome: 'not-applied' })
    await expect(run('delete', { id: 'missing-event' })).rejects.toMatchObject({ outcome: 'not-applied' })
    await expect(run('source-action', { sourceId: 'missing-source', id: 'oak', actionId: 'edit' })).rejects.toMatchObject({ outcome: 'not-applied' })
    expect(await mock.api.commands.execute('calendar:get', { id: event.id })).toMatchObject({ ok: true, value: { note: '' } })
  })

  it('resolves an item of a yearly source without reading ten thousand years', async () => {
    const { mock } = setupWithDefinitions()
    const year = new Date().getFullYear()
    const list = vi.fn(async ({ startDate, endDate, limit, cursor }: { startDate: string; endDate: string; limit: number; cursor?: string }) => {
      const items: CalendarSourceItem[] = []
      for (let y = Number(startDate.slice(0, 4)); y <= Number(endDate.slice(0, 4)); y++) {
        for (const name of ['fern', 'moss']) {
          const date = `${String(y).padStart(4, '0')}-05-12`
          if (date >= startDate && date <= endDate) items.push({ id: `${y}|${name}`, title: `Birthday: ${name}`, date, readOnly: true })
        }
      }
      const offset = Number(cursor ?? 0)
      return { items: items.slice(offset, offset + limit), revision: 'yearly', ...(offset + limit < items.length ? { cursor: String(offset + limit) } : {}) }
    })
    mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, { list }, 'birthdays')
    const sourceId = mock.api.interop.services.providers(CALENDAR_ITEM_SOURCE_V2)[0].providerId
    expect(await mock.api.commands.execute('calendar:get', { sourceId, id: `${year}|fern` })).toMatchObject({ ok: true, value: { kind: 'sourced', id: `${year}|fern`, date: `${year}-05-12` } })
    expect(list.mock.calls.every(([request]) => request.startDate >= `${year - 1}-01-01`)).toBe(true)
  })
})
