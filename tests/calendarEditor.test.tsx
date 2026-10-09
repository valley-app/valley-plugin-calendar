// @vitest-environment jsdom
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MountedPluginView, PluginEditorProvider, PluginVaultApi } from '@valley/plugin-sdk'
import type { FileBaseline, GuardedWriteResult } from '@valley/plugin-sdk/types'
import { createMockValleyApi } from './harness'
import { CalendarFileEditor, useCalendarFileEditor } from '../src/calendarEditor'
import { QuickAdd } from '../src/QuickAdd'
import { parseCalendarFile } from '../src/calendarFiles'
import { initRuntime } from '../src/runtime'

const path = 'plugins/calendar/forest.ics'
const raw = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Valley//Calendar//EN\r\nBEGIN:VEVENT\r\nUID:forest\r\nDTSTART;VALUE=DATE:20260928\r\nSUMMARY:Canopy survey\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
const baseline: FileBaseline = { mtimeMs: 1, size: raw.length, hash: 'original' }
const mountedView: MountedPluginView = { mountId: 'calendar-main', generation: 1, area: 'main', paneId: 'pane', tabId: 'tab', filePath: path, pluginId: 'calendar' }
const disposals: Array<() => void | Promise<void>> = []

afterEach(async () => {
  cleanup()
  for (const dispose of disposals.splice(0).reverse()) await dispose()
})

function setup() {
  const mock = createMockValleyApi()
  mock.api.ui.openPopover = (content, _target, options) => new Promise(resolve => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      queueMicrotask(() => { act(() => root.unmount()); host.remove(); resolve() })
    }
    root.render(<div role="dialog" aria-label={options?.ariaLabel}>{content({ close })}</div>)
    disposals.push(close)
  })
  let disk = raw
  const providers = new Map<string, PluginEditorProvider>()
  const mutations = vi.fn()
  const changed = new Set<Parameters<typeof mock.api.vault.onChanged>[0]>()
  vi.spyOn(mock.api.vault, 'readFileBaseline').mockImplementation(async () => ({ content: disk, baseline }))
  vi.spyOn(mock.api.vault, 'onChanged').mockImplementation(listener => { changed.add(listener); return () => { changed.delete(listener) } })
  const save = async (owner: string, content: string, expected: FileBaseline | null, revision: string): Promise<GuardedWriteResult> => {
    const leases: Awaited<ReturnType<PluginEditorProvider['prepare']>>[] = []
    try {
      for (const [id, provider] of providers) {
        const snapshot = await provider.getSnapshot()
        if (id === owner && snapshot.revision !== revision) return { ok: false, reason: 'error' }
        leases.push(await provider.prepare(snapshot.revision, { operationId: 'save', fenceId: id, deadline: Date.now() + 1000, ownSave: id === owner }))
      }
      for (const lease of leases) await lease.validate()
      mutations(content, expected, revision)
      disk = content
      for (const listener of changed) listener({ full: false, changes: [{ relPath: path, type: 'changed' }] } as never)
      return { ok: true, baseline: { ...baseline, hash: 'saved' } }
    } catch { return { ok: false, reason: 'error' } }
    finally { for (const lease of leases.reverse()) await lease.release() }
  }
  const editors: PluginVaultApi['editors'] = {
    register: vi.fn((view, provider) => { providers.set(view.mountId, provider); return () => { providers.delete(view.mountId) } }),
    registerDocument: vi.fn((_path, instance, provider) => { providers.set(instance, provider); return () => { providers.delete(instance) } }),
    save: vi.fn((view, content, expected, revision) => save(view.mountId, content, expected, revision)),
    saveDocument: vi.fn((_path, instance, content, expected, revision) => save(instance, content, expected, revision))
  }
  Object.assign(mock.api.vault, { editors })
  disposals.push(initRuntime({ ...mock.api, React }))
  return { mock, editors, mutations, providers, disk: () => disk, changeDisk: (content: string) => {
    disk = content
    for (const listener of changed) listener({ full: false, changes: [{ relPath: path, type: 'changed' }] } as never)
  } }
}

describe('Calendar file draft fencing', () => {
  it('registers before loading and refuses unreadable state', async () => {
    const fixture = setup()
    let complete!: (value: Awaited<ReturnType<typeof fixture.mock.api.vault.readFileBaseline>>) => void
    vi.mocked(fixture.mock.api.vault.readFileBaseline).mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const editor = new CalendarFileEditor(path, mountedView)
    disposals.push(editor.start())
    expect(fixture.editors.register).toHaveBeenCalledWith(mountedView, editor.provider)
    expect(editor.getSnapshot().readiness).toBe('loading')
    expect(() => editor.provider.prepare(editor.getSnapshot().revision, { operationId: 'write', fenceId: 'write', deadline: 1, ownSave: false })).toThrow('not ready')
    complete(null)
    await waitFor(() => expect(editor.getSnapshot().readiness).toBe('uncertain'))
    expect(fixture.disk()).toBe(raw)
  })

  it('holds clean preparation through validation and freezes programmatic changes until release', async () => {
    setup()
    const editor = new CalendarFileEditor(path, mountedView)
    disposals.push(editor.start())
    await waitFor(() => expect(editor.getSnapshot().readiness).toBe('ready'))
    const snapshot = editor.getSnapshot()
    const lease = await editor.provider.prepare(snapshot.revision, { operationId: 'write', fenceId: 'write', deadline: 1, ownSave: false })
    expect(editor.change()).toBe(false)
    expect(await lease.validate()).toEqual(snapshot)
    expect(editor.locked).toBe(true)
    await lease.release()
    expect(editor.change()).toBe(true)
    expect(editor.getSnapshot()).toMatchObject({ dirty: true, readiness: 'ready' })
    expect(() => editor.provider.prepare(snapshot.revision, { operationId: 'write', fenceId: 'next', deadline: 1, ownSave: false })).toThrow('not ready')
  })

  it('saves only the exact owner payload and baseline while retaining another dirty copy', async () => {
    const fixture = setup()
    const owner = new CalendarFileEditor(path, mountedView)
    const other = new CalendarFileEditor(path, { ...mountedView, mountId: 'calendar-right', area: 'right' })
    disposals.push(owner.start(), other.start())
    await waitFor(() => expect([owner.getSnapshot().readiness, other.getSnapshot().readiness]).toEqual(['ready', 'ready']))
    owner.change()
    other.change()
    const content = raw.replace('Canopy survey', 'Bäume')
    await expect(owner.save(content, owner.getSnapshot().revision)).rejects.toThrow('draft is preserved')
    expect(fixture.disk()).toBe(raw)
    expect(other.getSnapshot().dirty).toBe(true)
    expect(fixture.mutations).not.toHaveBeenCalled()
  })

  it('rejects stale own saves and updates a successful exact save without discarding its ICS content', async () => {
    const fixture = setup()
    const owner = new CalendarFileEditor(path, mountedView)
    const dispose = owner.start()
    disposals.push(dispose)
    await waitFor(() => expect(owner.getSnapshot().readiness).toBe('ready'))
    const old = owner.getSnapshot().revision
    owner.change()
    await expect(owner.save('stale', old)).rejects.toThrow('draft is preserved')
    const revision = owner.getSnapshot().revision
    const content = raw.replace('Canopy survey', 'Bäume')
    await owner.save(content, revision)
    expect(fixture.editors.save).toHaveBeenCalledWith(mountedView, content, baseline, revision)
    expect(fixture.disk()).toBe(content)
    expect(owner.baseline?.content).toBe(content)
    expect(owner.getSnapshot()).toMatchObject({ dirty: false, readiness: 'ready' })
    dispose()
    const terminal = owner.getSnapshot()
    expect(terminal).toMatchObject({ dirty: false, readiness: 'ready' })
    expect(owner.change()).toBe(false)
    expect(owner.getSnapshot()).toEqual(terminal)
  })

  it('retains drafts across asynchronous external changes and ignores reads completed after disposal', async () => {
    const fixture = setup()
    const owner = new CalendarFileEditor(path, mountedView)
    const dispose = owner.start()
    await waitFor(() => expect(owner.getSnapshot().readiness).toBe('ready'))
    owner.attachDraft()
    owner.change()
    fixture.changeDisk(raw.replace('Canopy survey', 'External'))
    expect(owner.getSnapshot()).toMatchObject({ dirty: true, readiness: 'uncertain' })
    expect(owner.baseline?.content).toBe(raw)
    dispose()
    expect(fixture.providers.size).toBe(0)
    expect(owner.getSnapshot()).toMatchObject({ dirty: true, readiness: 'uncertain' })
    expect(owner.change()).toBe(false)
    expect(() => owner.attachDraft()).toThrow()
    let complete!: (value: Awaited<ReturnType<typeof fixture.mock.api.vault.readFileBaseline>>) => void
    vi.mocked(fixture.mock.api.vault.readFileBaseline).mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const loading = new CalendarFileEditor(path, mountedView)
    const stop = loading.start()
    stop()
    complete({ content: 'late', baseline })
    await Promise.resolve()
    expect(loading.baseline).toBeNull()
    expect(loading.getSnapshot().readiness).toBe('uncertain')
  })

  it('keeps the mounted provider stable when the host republishes the same mount', async () => {
    const fixture = setup()
    function View({ view }: { view: MountedPluginView }) { useCalendarFileEditor(path, view); return null }
    const rendered = render(<View view={mountedView} />)
    await waitFor(() => expect(fixture.editors.register).toHaveBeenCalledOnce())
    rendered.rerender(<View view={{ ...mountedView }} />)
    expect(fixture.editors.register).toHaveBeenCalledOnce()
    rendered.rerender(<View view={{ ...mountedView, generation: 2 }} />)
    expect(fixture.editors.register).toHaveBeenCalledTimes(2)
  })

  it('freezes native and host callback inputs under a lease and saves the QuickAdd draft through its mounted owner', async () => {
    const fixture = setup()
    let changeDate!: (value: string) => void
    const DateField = fixture.mock.api.ui.settings.DateField
    fixture.mock.api.ui.settings.DateField = props => { changeDate = props.onChange; return <DateField {...props} /> }
    const owner = new CalendarFileEditor(path, mountedView)
    disposals.push(owner.start())
    await waitFor(() => expect(owner.getSnapshot().readiness).toBe('ready'))
    const close = vi.fn()
    const file = parseCalendarFile(raw, path, '2026-09-01', '2026-10-31').entries[0]
    const rendered = render(<QuickAdd state={{ date: file.date, editItem: { ...file, kind: 'file', filePath: path, file } }} groups={[]} fileEditor={owner} onClose={close} onAdded={vi.fn()} />)
    const title = await screen.findByLabelText('Title')
    let lease!: Awaited<ReturnType<PluginEditorProvider['prepare']>>
    await act(async () => { lease = await owner.provider.prepare(owner.getSnapshot().revision, { operationId: 'rename', fenceId: 'rename', deadline: 1, ownSave: false }) })
    expect(title).toBeDisabled()
    fireEvent.change(title, { target: { value: 'Ignored' } })
    expect(title).toHaveValue('Canopy survey')
    act(() => changeDate('2026-10-01'))
    expect(await lease.validate()).toMatchObject({ dirty: false })
    expect(owner.change()).toBe(false)
    await act(async () => { await lease.release() })
    fireEvent.change(title, { target: { value: 'Bäume' } })
    expect(owner.getSnapshot().dirty).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(fixture.editors.save).toHaveBeenCalledWith(mountedView, expect.stringContaining('SUMMARY:Bäume'), baseline, expect.any(String))
    expect(fixture.editors.saveDocument).not.toHaveBeenCalled()
    expect(fixture.disk()).toContain('UID:forest')
    expect(fixture.disk()).toContain('SUMMARY:Bäume')
    rendered.unmount()
  })

  it('enrolls a new QuickAdd file draft without a receipt and uses its distinct logical owner to append', async () => {
    const fixture = setup()
    const close = vi.fn()
    render(<QuickAdd state={{ date: '2026-09-28', sourceFilePath: path }} groups={[]} onClose={close} onAdded={vi.fn()} />)
    const title = await screen.findByLabelText('Title')
    const [instance, provider] = [...fixture.providers.entries()][0]
    await waitFor(async () => expect(await provider.getSnapshot()).toMatchObject({ dirty: true, readiness: 'ready' }))
    const snapshot = await provider.getSnapshot()
    await expect(async () => provider.prepare(snapshot.revision, { operationId: 'delete', fenceId: 'delete', deadline: 1, ownSave: false })).rejects.toThrow('not ready')
    fireEvent.change(title, { target: { value: 'Bäume' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(fixture.editors.saveDocument).toHaveBeenCalledWith(path, instance, expect.stringContaining('SUMMARY:Bäume'), baseline, expect.any(String))
    expect(fixture.editors.save).not.toHaveBeenCalled()
    expect(fixture.disk()).toContain('SUMMARY:Canopy survey')
    expect(fixture.disk()).toContain('SUMMARY:Bäume')
  })

  it('participates in the refreshed SDK testkit fence for own saves and direct guarded writes', async () => {
    const mock = createMockValleyApi({ manifest: { id: 'calendar' }, files: { [path]: raw } })
    disposals.push(initRuntime({ ...mock.api, React }))
    const owner = new CalendarFileEditor(path, mountedView)
    const other = new CalendarFileEditor(path, { ...mountedView, mountId: 'calendar-right', area: 'right' })
    disposals.push(owner.start(), other.start())
    await waitFor(() => expect([owner.getSnapshot().readiness, other.getSnapshot().readiness]).toEqual(['ready', 'ready']))
    owner.change()
    const content = raw.replace('Canopy survey', 'Bäume')
    await owner.save(content, owner.getSnapshot().revision)
    expect(await mock.api.vault.readFile(path)).toBe(content)
    await waitFor(() => expect(other.getSnapshot().readiness).toBe('ready'))
    owner.change()
    other.change()
    await expect(owner.save('blocked', owner.getSnapshot().revision)).rejects.toMatchObject({ code: 'DIRTY_EDITOR' })
    await expect(mock.api.vault.writeFileGuarded(path, 'blocked', owner.baseline!.baseline)).rejects.toMatchObject({ code: 'DIRTY_EDITOR' })
    expect(await mock.api.vault.readFile(path)).toBe(content)
    expect(other.getSnapshot().dirty).toBe(true)
  })

  it('publishes an observed clean terminal provider when Cancel explicitly discards a logical file draft', async () => {
    const fixture = setup()
    function Composer() {
      const [open, setOpen] = React.useState(true)
      return open ? <QuickAdd state={{ date: '2026-09-28', sourceFilePath: path }} groups={[]} onClose={() => setOpen(false)} onAdded={vi.fn()} /> : null
    }
    render(<Composer />)
    const title = await screen.findByLabelText('Title')
    const [, provider] = [...fixture.providers.entries()][0]
    await waitFor(async () => expect(await provider.getSnapshot()).toMatchObject({ dirty: true, readiness: 'ready' }))
    fireEvent.change(title, { target: { value: 'Discard this draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(fixture.providers.size).toBe(0))
    expect(await provider.getSnapshot()).toMatchObject({ dirty: false, readiness: 'ready' })
    expect(fixture.mutations).not.toHaveBeenCalled()
    expect(fixture.disk()).toBe(raw)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('retains a dirty logical form and its terminal refusal when it disappears without an explicit discard', async () => {
    const fixture = setup()
    const rendered = render(<QuickAdd state={{ date: '2026-09-28', sourceFilePath: path }} groups={[]} onClose={vi.fn()} onAdded={vi.fn()} />)
    const title = await screen.findByLabelText('Title')
    const [, provider] = [...fixture.providers.entries()][0]
    await waitFor(async () => expect(await provider.getSnapshot()).toMatchObject({ dirty: true, readiness: 'ready' }))
    fireEvent.change(title, { target: { value: 'Retain this draft' } })
    rendered.unmount()
    expect(await provider.getSnapshot()).toMatchObject({ dirty: true, readiness: 'uncertain' })
    const drafts = fixture.mock.api.runtime.getOrCreate('calendar.eventDrafts', () => new Map<string, { fields: Map<string, unknown> }>())
    expect([...drafts.values()].some(draft => draft.fields.get('title') === 'Retain this draft')).toBe(true)
    expect(fixture.disk()).toBe(raw)
  })
})
