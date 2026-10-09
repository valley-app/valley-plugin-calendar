// @vitest-environment jsdom
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Ajv from 'ajv'
import type { MountedPluginView } from '@valley/plugin-sdk'
import type { CommandContext } from '@valley/plugin-sdk/commands'
import { createMockValleyApi } from './harness'
import { initRuntime } from '../src/runtime'
import { Calendar } from '../src/Calendar'
import { registerCalendarFileCommands, type CalendarFileAction, type CalendarFileFormState, type CalendarFileViewState } from '../src/fileViewCommands'
import config from '../config.json'
import { parseCalendarFile } from '../src/calendarFiles'

const path = 'plugins/calendar/forest.ics'
const raw = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Valley//Calendar//EN\r\nBEGIN:VEVENT\r\nUID:forest\r\nDTSTART;VALUE=DATE:20260928\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:Canopy survey\r\nX-CUSTOM:preserve\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
const mountedView: MountedPluginView = { mountId: 'calendar-main', generation: 1, area: 'main', paneId: 'pane', tabId: 'tab', filePath: path, pluginId: 'calendar' }
const target = { mountId: mountedView.mountId, generation: mountedView.generation }
const disposals: Array<() => void | Promise<void>> = []
type Observation = { target: typeof target; filePath: string; revision: string; view: CalendarFileViewState; form: CalendarFileFormState | null }

afterEach(async () => { cleanup(); for (const dispose of disposals.splice(0).reverse()) await dispose(); vi.restoreAllMocks() })

function setup(content = raw) {
  const mock = createMockValleyApi({ manifest: { id: 'calendar', datasets: config.datasets as never }, files: { [path]: content }, timeControl: { view: 'month', cursor: '2026-09-01', selectedDate: null, rangeStart: null, rangeEnd: null }, settings: { mainView: 'month', sidebarView: 'month' } })
  mock.api.ui.openPopover = (content, _target, options) => new Promise(resolve => {
    const host = document.createElement('div'); document.body.appendChild(host)
    const root = createRoot(host); let closed = false
    const close = () => { if (closed) return; closed = true; queueMicrotask(() => { act(() => root.unmount()); host.remove(); resolve() }) }
    root.render(<div role="dialog" aria-label={options?.ariaLabel}>{content({ close })}</div>); disposals.push(close)
  })
  disposals.push(initRuntime({ ...mock.api, React }), registerCalendarFileCommands(mock.api))
  const command = (id: string) => mock.commands.find(command => command.id === id || command.id.endsWith(`:${id}`))!
  const inspect = async (exact = target): Promise<Observation> => {
    const definition = command('file-view-inspect')
    return await definition.run(definition.input!.parse({ target: exact }), { caller: 'agent' }) as Observation
  }
  const invoke = async (action: CalendarFileAction, route = 'control', context: Partial<CommandContext> = {}, exact = target, expectedRevision?: string) => {
    const observation = await inspect(exact), definition = command(`file-view-${route}`)
    let result: unknown
    await act(async () => { result = await definition.run(definition.input!.parse({ target: exact, expectedRevision: expectedRevision ?? observation.revision, action }), { caller: 'agent', validateBeforeRun: async () => true, ...context }) })
    return result
  }
  const ready = async () => { await waitFor(async () => { const value = await inspect(); expect(value.view.editor.readiness).toBe('ready'); expect(value.view.items.length).toBeGreaterThan(0) }) }
  return { mock, command, inspect, invoke, ready }
}

describe('exact Calendar file action owners', () => {
  it('drives existing modes, periods, dates, ranges, history and item selection with exact mount revisions', async () => {
    const fixture = setup()
    const other = { ...mountedView, mountId: 'calendar-right', area: 'right' as const }
    const rendered = render(<><Calendar filePath={path} mountedView={mountedView} /><Calendar variant="right" filePath={path} mountedView={other} /></>)
    await fixture.ready()
    const original = await fixture.inspect()
    for (const view of ['week', 'month', 'year'] as const) { await fixture.invoke({ type: 'view', view }); expect((await fixture.inspect()).view.view).toBe(view); expect(rendered.container.querySelector('.calendar-view-main .calendar-switcher button[aria-selected="true"]')?.textContent?.toLowerCase()).toBe(view) }
    expect((await fixture.inspect({ mountId: other.mountId, generation: 1 })).view.view).toBe('month')
    await fixture.invoke({ type: 'view', view: 'month' })
    const before = (await fixture.inspect()).view.cursor
    await fixture.invoke({ type: 'next' }); expect((await fixture.inspect()).view.cursor).not.toBe(before)
    await fixture.invoke({ type: 'previous' }); expect((await fixture.inspect()).view.cursor).toBe(before)
    await fixture.invoke({ type: 'select-date', date: '2026-09-28' }); expect(fixture.mock.timeControl().selectedDate).toBe('2026-09-28')
    await fixture.invoke({ type: 'select-week', date: '2026-09-29' }); expect((await fixture.inspect()).view.view).toBe('week')
    await fixture.invoke({ type: 'range', start: '2026-09-28', end: '2026-09-30' }); expect(fixture.mock.timeControl()).toMatchObject({ rangeStart: '2026-09-28', rangeEnd: '2026-09-30' })
    const current = await fixture.inspect()
    await fixture.invoke({ type: 'history-back' }); expect((await fixture.inspect()).view.canGoForward).toBe(true)
    await fixture.invoke({ type: 'history-forward' }); expect((await fixture.inspect()).view).toMatchObject({ view: current.view.view, cursor: current.view.cursor, rangeStart: current.view.rangeStart, rangeEnd: current.view.rangeEnd })
    const key = (await fixture.inspect()).view.items[0].key
    await fixture.invoke({ type: 'select-item', key }); expect((await fixture.inspect()).view.selectedItemKey).toBe(key)
    await fixture.invoke({ type: 'today' }); expect(fixture.mock.timeControl().selectedDate).toMatch(/^2026-/)
    await expect(fixture.invoke({ type: 'next' }, 'control', {}, target, original.revision)).rejects.toMatchObject({ code: 'REVISION_CONFLICT', outcome: 'not-applied' })
    expect(await fixture.mock.api.vault.readFile(path)).toBe(raw)
    rendered.unmount(); await expect(fixture.inspect()).rejects.toMatchObject({ code: 'TARGET_REPLACED' })
  })

  it('edits real raw fields, opens exact URLs/attachments, cancels and appends through the mounted save owner', async () => {
    const fixture = setup()
    render(<Calendar filePath={path} mountedView={mountedView} />); await fixture.ready()
    await fixture.invoke({ type: 'open-editor', date: '2026-09-28' }, 'execute')
    await screen.findByRole('dialog')
    await fixture.invoke({ type: 'form-patch', patch: { title: 'Bäume', date: '2026-09-29', endDate: '2026-09-30', start: '11:00', end: '12:00', location: { name: 'Wald', lat: 47, lng: 8 }, tags: ['survey'], note: 'Raw **Markdown**', filePath: 'notes/forest.md', details: true } })
    expect(screen.getByLabelText('Title')).toHaveValue('Bäume')
    expect((await fixture.inspect()).form).toMatchObject({ title: 'Bäume', date: '2026-09-29', endDate: '2026-09-30', start: '11:00', end: '12:00', location: { name: 'Wald', lat: 47, lng: 8 }, tags: ['survey'], note: 'Raw **Markdown**', filePath: 'notes/forest.md', details: true })
    await fixture.invoke({ type: 'form-patch', patch: { allDay: true } }); expect((await fixture.inspect()).form).toMatchObject({ allDay: true, start: '', end: '' })
    await fixture.invoke({ type: 'url-add', value: 'https://example.com/survey' }); await fixture.invoke({ type: 'attachment-add', value: 'assets/map.pdf' })
    const open = vi.spyOn(fixture.mock.api.workspace, 'openFile')
    await fixture.invoke({ type: 'url-open', value: 'https://example.com/survey' }, 'execute'); expect(fixture.mock.externalUrls).toEqual(['https://example.com/survey'])
    await fixture.invoke({ type: 'attachment-open', value: 'assets/map.pdf' }, 'execute'); expect(open).toHaveBeenCalledWith('assets/map.pdf')
    await fixture.invoke({ type: 'url-remove', value: 'https://example.com/survey' }); await fixture.invoke({ type: 'attachment-remove', value: 'assets/map.pdf' }); expect((await fixture.inspect()).form).toMatchObject({ urls: [], attachments: [] })
    await fixture.invoke({ type: 'cancel' }, 'execute'); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(await fixture.mock.api.vault.readFile(path)).toBe(raw)
    await fixture.invoke({ type: 'open-editor', date: '2026-09-30' }, 'execute'); await screen.findByRole('dialog')
    await fixture.invoke({ type: 'form-patch', patch: { title: 'New canopy survey', note: 'Retained note' } })
    const save = vi.spyOn(fixture.mock.api.vault.editors, 'save')
    await fixture.invoke({ type: 'save' }, 'save'); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await act(async () => fixture.mock.emitVaultChanged({ full: false, changes: [{ relPath: path, kind: 'change' }] }))
    expect(save).toHaveBeenCalledWith(mountedView, expect.stringContaining('SUMMARY:New canopy survey'), expect.any(Object), expect.any(String))
    expect(await fixture.mock.api.vault.readFile(path)).toContain('UID:forest'); expect(await fixture.mock.api.vault.readFile(path)).toContain('X-CUSTOM:preserve'); expect(await fixture.mock.api.vault.readFile(path)).toContain('SUMMARY:New canopy survey')
  })

  it('opens a recurring occurrence, retains its scope, saves existing data and deletes the exact file entry', async () => {
    const fixture = setup(); render(<Calendar filePath={path} mountedView={mountedView} />); await fixture.ready()
    const key = (await fixture.inspect()).view.items[0].key
    await fixture.invoke({ type: 'edit-item', key }, 'execute'); await screen.findByRole('dialog')
    await fixture.invoke({ type: 'form-patch', patch: { title: 'Series renamed', recurrenceScope: 'series' } }); expect((await fixture.inspect()).form?.recurrenceScope).toBe('series')
    await fixture.invoke({ type: 'save' }, 'save'); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await act(async () => fixture.mock.emitVaultChanged({ full: false, changes: [{ relPath: path, kind: 'change' }] }))
    await waitFor(async () => expect((await fixture.inspect()).view.items[0].title).toBe('Series renamed'))
    expect(await fixture.mock.api.vault.readFile(path)).toContain('RRULE:FREQ=DAILY;COUNT=3'); expect(await fixture.mock.api.vault.readFile(path)).toContain('X-CUSTOM:preserve')
    await fixture.invoke({ type: 'delete-item', key: (await fixture.inspect()).view.items[0].key }, 'save')
    const saved = await fixture.mock.api.vault.readFile(path)
    expect(saved).toContain('EXDATE'); expect(saved).toContain('UID:forest'); expect(parseCalendarFile(saved, path, '2026-09-01', '2026-10-31').entries.map(entry => entry.date)).not.toContain('2026-09-28')
  })

  it('creates and opens the daily note only after authorizing its actual destination', async () => {
    const fixture = setup(); render(<Calendar filePath={path} mountedView={mountedView} />); await fixture.ready()
    const validateBeforeRun = vi.fn(async () => true), open = vi.spyOn(fixture.mock.api.workspace, 'openFile')
    await fixture.invoke({ type: 'open-daily-note', date: '2026-09-28' }, 'execute', { validateBeforeRun })
    const note = 'plugins/calendar/dailynotes/2026-09-28.md'
    expect(await fixture.mock.api.vault.readFile(note)).toBe('# 2026-09-28\n\n'); expect(open).toHaveBeenCalledWith(note)
    expect(validateBeforeRun).toHaveBeenCalledWith([{ kind: 'file', path: note, fileOperation: 'write' }])
    expect(await fixture.mock.api.vault.readFile(path)).toBe(raw)
  })

  it('refuses denied/stale/replaced effects and retains post-dispatch uncertainty without replay', async () => {
    const fixture = setup(); const rendered = render(<Calendar filePath={path} mountedView={mountedView} />); await fixture.ready()
    await expect(fixture.invoke({ type: 'open-editor', date: '2026-09-28' }, 'execute', { validateBeforeRun: async () => false })).rejects.toMatchObject({ code: 'PERMISSION_DENIED', outcome: 'not-applied' }); expect(screen.queryByRole('dialog')).toBeNull()
    await fixture.invoke({ type: 'open-editor', date: '2026-09-28' }, 'execute'); await screen.findByRole('dialog')
    const old = await fixture.inspect(); fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Native pending draft' } })
    await expect(fixture.invoke({ type: 'save' }, 'save', {}, target, old.revision)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' }); expect(await fixture.mock.api.vault.readFile(path)).toBe(raw)
    await fixture.invoke({ type: 'url-add', value: 'https://example.com/survey' })
    vi.spyOn(fixture.mock.api.files, 'openExternalUrl').mockRejectedValueOnce(new Error('Lost acknowledgement'))
    await expect(fixture.invoke({ type: 'url-open', value: 'https://example.com/survey' }, 'execute')).rejects.toMatchObject({ code: 'EFFECT_UNVERIFIED', outcome: 'unknown', retryable: false })
    expect((await fixture.inspect()).form?.title).toBe('Native pending draft')
    let resume!: (allowed: boolean) => void
    const action = fixture.invoke({ type: 'attachment-add', value: 'assets/map.pdf' }, 'control', { validateBeforeRun: () => new Promise(resolve => { resume = resolve }) })
    await waitFor(() => expect(resume).toBeTypeOf('function'))
    const refused = expect(action).rejects.toMatchObject({ code: 'TARGET_REPLACED', outcome: 'not-applied' })
    rendered.unmount(); await act(async () => resume(true)); await refused
    expect(await fixture.mock.api.vault.readFile(path)).toBe(raw)
  })

  it('validates complete schemas, exact identities, routes and field bounds before dispatch', async () => {
    const fixture = setup(), ajv = new Ajv({ strict: true })
    for (const definition of fixture.mock.commands) { expect(() => ajv.compile(definition.input!.schema!)).not.toThrow(); expect(() => ajv.compile(definition.outputSchema!)).not.toThrow() }
    const control = fixture.command('file-view-control'), execute = fixture.command('file-view-execute')
    for (const action of [{ type: 'view', view: 'list' }, { type: 'select-date', date: '2026-02-30' }, { type: 'form-patch', patch: { bogus: true } }, { type: 'form-patch', patch: { start: '25:00' } }, { type: 'form-patch', patch: { location: { name: 'Bad', lat: 100, lng: 8 } } }, { type: 'save' }, { type: 'next', extra: true }]) expect(() => control.input!.parse({ target, expectedRevision: 'r', action })).toThrow()
    expect(() => execute.input!.parse({ target, expectedRevision: 'r', action: { type: 'form-patch', patch: { title: 'Wrong route' } } })).toThrow()
    expect(() => control.input!.parse({ target: { ...target, path }, expectedRevision: 'r', action: { type: 'next' } })).toThrow()
    expect(fixture.command('file-view-save')).toMatchObject({ sideEffect: 'write', recovery: 'non-replayable', idempotent: false, revisionRequirements: [expect.objectContaining({ argument: 'expectedRevision' })] })
    expect(execute).toMatchObject({ sideEffect: 'execute', recovery: 'non-replayable', idempotent: false })
    expect(fixture.command('file-view-inspect')).toMatchObject({ sideEffect: 'read', recovery: 'observational', idempotent: true })
  })
})
