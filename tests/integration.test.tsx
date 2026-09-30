import { CalendarPreview, PluginGlyph } from '../src/CalendarPreview'
import { createRoot } from 'react-dom/client'
import type { ValleyPluginManifest } from '@valley/plugin-sdk/types'
// @vitest-environment jsdom
import * as React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import type { DataRecord, IndexEntry, TimeControlState, ValleyGroup } from '@valley/plugin-sdk/types'
import { paletteRef } from '@valley/plugin-sdk/palette'
import {
  GEO_NAVIGATOR_V1,
  METADATA_PANEL_SEGMENT_V1,
  PLUGIN_SURFACE_V1,
  CALENDAR_ITEM_SOURCE_V2,
  CALENDAR_PANEL_SELECTION_V1,
  type DatasetRecord,
  type CalendarRevealTarget,
  type UiMenuItem
} from '@valley/plugin-sdk'
import { createMockValleyApi, type MockValleyApi } from './harness'
import { pagedSource } from './harness'
import { initRuntime, revealTargetStore } from '../src/runtime'
import { normalizeEventRecord, newEvent } from '../src/events'
import { resolveItemColor } from '../src/colors'
import { SWIPE_IDLE_MS, calendarSwipeStep, newSwipeGesture, type CalendarSwipeGesture } from '../src/swipe'
import { Calendar } from '../src/Calendar'
import { QuickAdd } from '../src/QuickAdd'
import { Page as CalendarPage } from '../src/Page'
import { AgendaPanel } from '../src/AgendaPanel'
import { registerCalendarCommands } from '../src/commands'
import { registerCalendarSurfaces } from '../src/surfaces'
import { gridHourWindow } from '../src/WeekGrid'
import { presetNoteDateSource } from '../src/noteDates'
import { CalendarAgendaCard, calendarItemMenuItems, eventMenuItems, eventToItem, sourcedToItem, type CalItem } from '../src/items'
import { Settings as CalendarSettings } from '../src/Settings'
import CALENDAR_PLUGIN_CONFIG from '../config.json'
import { rangeDays } from '../src/timeControl'
import { calendarItemColor, deduplicateCalendarItems } from '../src/useCalendarItems'
import { injectStyles as injectCalendarStyles } from '../src/styles'

Element.prototype.scrollIntoView = vi.fn()

let timeApi: ReturnType<typeof createMockValleyApi>['api']['workspace']
const readTimeControl = () => timeApi.getTimeControl()
const patchTimeControl = (patch: Partial<TimeControlState>) => timeApi.patchTimeControl(patch)
const flushTimeControl = async () => {}

function setupCalendarApi(opts: {
  todos?: DataRecord[]
  events?: DataRecord[]
  calendars?: DatasetRecord[]
  indexEntries?: IndexEntry[]
  noteDateSources?: DataRecord[]
  groups?: ValleyGroup[]
  settings?: Record<string, unknown>
  providerOpen?: (itemId: string) => void
  providerEdit?: (itemId: string) => void
  providerUpdate?: () => Promise<boolean>
} = {}): MockValleyApi {
  // `opts.todos` is seeded as a *contributed* `calendar.itemSource`, exactly how
  // the Todo plugin registers itself — Calendar has no access to Todo's datasets and
  // no knowledge that Todo exists. Any plugin offering this shape renders the same.
  const sourceItems = (opts.todos ?? []).map((t) => ({
    id: String(t.id),
    documentRef: { pluginId: 'todo', sourceId: 'tasks', itemId: String(t.id) },
    title: String(t.title ?? ''),
    date: String(t.dueDate ?? '').slice(0, 10),
    startTime: t.startTime as string | undefined,
    endTime: t.endTime as string | undefined,
    completed: t.completed === true,
    filePath: t.filePath as string | undefined,
    attachments: t.attachments as string[] | undefined,
    urls: t.urls as string[] | undefined,
    location: t.location as { name: string; lng?: number; lat?: number } | undefined,
    group: t.group as string | undefined,
    note: t.note as string | undefined,
    color: t.color as string | undefined,
    priority: t.priority as string | undefined,
    icon: 'list-todo',
    payload: t
  }))
  const events = opts.events ?? []
  const datasets = {
    'calendar.calendars': opts.calendars ?? [],
    'calendar.events': events.map(({ tags: _tags, urls: _urls, attachments: _attachments, ...event }) => event),
    'calendar.event_tags': events.flatMap((event) =>
      Array.isArray(event.tags) ? event.tags.map((tag) => ({ eventId: event.id, tag })) : []
    ),
    'calendar.event_links': events.flatMap((event) =>
      Array.isArray(event.urls) ? event.urls.map((url, position) => ({ eventId: event.id, position, url })) : []
    ),
    'calendar.event_attachments': events.flatMap((event) =>
      Array.isArray(event.attachments) ? event.attachments.map((path, position) => ({ eventId: event.id, position, path })) : []
    ),
    'calendar.note_date_sources': (opts.noteDateSources ?? []).map((definition, position) => ({
      id: definition.id,
      position,
      definition
    }))
  } as Record<string, DatasetRecord[]>
  const mock = createMockValleyApi({
    manifest: {
      id: 'calendar',
      indexState: 'scoped',
      noteDocuments: CALENDAR_PLUGIN_CONFIG.noteDocuments,
      datasets: CALENDAR_PLUGIN_CONFIG.datasets as unknown as ValleyPluginManifest['datasets']
    },
    indexEntries: opts.indexEntries ?? [],
    datasets,
    groups: opts.groups ?? [],
    settings: opts.settings ?? {}
  })
  const originalPopover = mock.api.ui.openPopover
  mock.api.ui.pluginIcon = vi.fn(async () => '<svg fill="currentColor" viewBox="0 0 24 24"><path fill="currentColor" d="M3 6a1 1" /></svg>')
  mock.api.ui.openPopover = (content, target, options) => {
    if (options?.className !== 'calendar-editor-popover') return originalPopover(content, target, options)
    return new Promise(resolve => {
      const host = document.createElement('div')
      document.body.appendChild(host)
      const root = createRoot(host)
      root.render(React.createElement('div', { role: 'dialog', 'aria-label': options.ariaLabel }, content({ close: () => { queueMicrotask(() => { act(() => root.unmount()); host.remove(); resolve() }) } })))
    })
  }
  mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, {
    integration: {
      name: 'To-Do',
      version: '2.0.0',
      author: 'Cedar Lab',
      description: 'Structured task manager.'
    },
    list: pagedSource(async () => sourceItems),
    create: async () => true,
    update: async (id: string, patch: { completed?: boolean }) => {
      if (opts.providerUpdate && !await opts.providerUpdate()) return false
      const item = sourceItems.find(item => item.id === id)
      if (!item) return false
      Object.assign(item, patch)
      return true
    },
    remove: async () => true,
    actions: async (itemId: string) => [
      { id: 'edit', label: 'Edit', icon: 'edit' as const },
      ...(sourceItems.find((item) => item.id === itemId)?.filePath ? [{ id: 'open-note', label: 'Open note', icon: 'note' as const }] : []),
      ...(opts.providerOpen ? [{ id: 'open-owner', label: 'Open in To-Do', icon: 'checklist' as const }] : [])
    ],
    runAction: async (itemId: string, actionId: string) => {
      if (actionId === 'edit') {
        opts.providerEdit?.(itemId)
        return true
      }
      if (actionId === 'open-note') {
        const path = sourceItems.find((item) => item.id === itemId)?.filePath
        if (!path) return false
        mock.api.workspace.openFile(path)
        return true
      }
      if (actionId !== 'open-owner' || !opts.providerOpen) return false
      opts.providerOpen(itemId)
      mock.api.workspace.revealOwnPanel('left_sidebar')
      return true
    },
    ...(opts.providerOpen ? {
      open: async (itemId: string) => {
        opts.providerOpen?.(itemId)
        mock.api.workspace.revealOwnPanel('left_sidebar')
      }
    } : {}),
    configure: () => mock.api.workspace.openOwnSettings()
  }, 'todo')
  timeApi = mock.api.workspace
  initRuntime(mock.api)
  registerCalendarSurfaces(mock.api)
  return mock
}

function renderProperties(mock: MockValleyApi) {
  const snapshot = mock.api.interop.extensions.providers(PLUGIN_SURFACE_V1).find((entry) => entry.extension.surface === 'main_workspace')!.extension.getSnapshot()
  const segment = mock.api.interop.extensions.providers(METADATA_PANEL_SEGMENT_V1)[0].extension
  return render(React.createElement(React.Fragment, null, segment.render({ relPath: '', kind: 'unsupported', subject: { pluginId: 'calendar', surface: 'main_workspace', view: snapshot.view, item: snapshot.item } })))
}

afterEach(async () => {
  cleanup()
  await flushTimeControl()
  vi.clearAllMocks()
  vi.useRealTimers()
  // @ts-expect-error restore optional browser API mock
  delete global.ResizeObserver
})

describe('shared Calendar documents', () => {
  it('declares only canonical local notes', () => {
    expect(CALENDAR_PLUGIN_CONFIG.noteDocuments).toEqual([
      expect.objectContaining({ dataset: 'events', bodyColumn: 'note', tags: { dataset: 'event_tags', itemIdColumn: 'eventId', valueColumn: 'tag' } }),
    ])
  })

  it('edits a contributed item through its provider without opening a cross-owner document', async () => {
    const ownerEdit = vi.fn()
    const providerUpdate = vi.fn(async () => true)
    const mock = setupCalendarApi({ providerEdit: ownerEdit, providerUpdate, todos: [{ id: 'owned-task', title: 'Ferns', dueDate: '2026-06-08' }] })
    const [provider] = mock.api.interop.services.providers(CALENDAR_ITEM_SOURCE_V2)
    const read = vi.spyOn(mock.api.documents, 'read')
    const item = sourcedToItem({ sourceId: provider.providerId, sourceOwner: 'todo', labelKey: 'plugin.todo.name', editable: true,
      item: { id: 'owned-task', title: 'Ferns', date: '2026-06-08' } })
    render(React.createElement(QuickAdd, { state: { date: item.date, editItem: item }, groups: [], onClose: vi.fn(), onAdded: vi.fn() }))
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Moss' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(providerUpdate).toHaveBeenCalledTimes(1))
    expect(ownerEdit).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  })

  it('keeps the draft when a provider is unavailable', async () => {
    setupCalendarApi()
    const close = vi.fn()
    const item = sourcedToItem({ sourceId: 'disabled-provider', sourceOwner: 'other', labelKey: 'plugin.other.name', editable: true,
      item: { id: 'missing-task', title: 'Ferns', date: '2026-06-08' } })
    render(React.createElement(QuickAdd, { state: { date: item.date, editItem: item }, groups: [], onClose: close, onAdded: vi.fn() }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Ferns')
    expect(close).not.toHaveBeenCalled()
  })

  it('keeps note and tag drafts local until one guarded Save', async () => {
    const event = { ...newEvent('Canopy survey', '2026-06-08'), id: 'document-event', filePath: 'Notes/Canopy.md', note: '**Draft**', tags: ['flora'] }
    const mock = setupCalendarApi({ events: [event as unknown as DataRecord] })
    const update = vi.spyOn(mock.api.documents, 'update')
    const clear = vi.spyOn(mock.api.documents.drafts, 'clear')
    const read = vi.spyOn(mock.api.documents, 'read')
    const close = vi.fn()
    render(React.createElement(QuickAdd, { state: { date: event.date, editItem: eventToItem(event) }, groups: [], onClose: close, onAdded: vi.fn() }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
    expect(read).toHaveBeenCalledWith({ pluginId: 'calendar', sourceId: 'events', itemId: event.id })
    expect(screen.getByLabelText('Note').tagName).toBe('TEXTAREA')
    expect(screen.getByLabelText('Note')).toHaveValue('**Draft**')
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: '**Changed** [[Ferns]] #wald' } })
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Tags' }), { target: { value: '#Äste/jung' } })
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Tags' }), { key: 'Enter' })
    expect(update).not.toHaveBeenCalled()
    expect(mock.datasets.get('calendar.events')?.[0].note).toBe('**Draft**')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(update).toHaveBeenCalledWith({ pluginId: 'calendar', sourceId: 'events', itemId: event.id }, expect.objectContaining({ body: '**Changed** [[Ferns]] #wald', explicitTags: expect.arrayContaining(['flora', 'äste/jung']), expectedRevision: expect.any(Number), vaultGeneration: expect.any(Number) }))
    expect(clear).toHaveBeenCalledWith({ pluginId: 'calendar', sourceId: 'events', itemId: event.id })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('preserves a failed note save and renders cached events read-only', async () => {
    const event = { ...newEvent('Canopy survey', '2026-06-08'), id: 'failed-event', note: 'Original' }
    const mock = setupCalendarApi({ events: [event as unknown as DataRecord] })
    mock.api.documents.update = vi.fn(async () => { throw new Error('Stale revision') })
    const close = vi.fn()
    const mounted = render(React.createElement(QuickAdd, { state: { date: event.date, editItem: eventToItem(event) }, groups: [], onClose: close, onAdded: vi.fn() }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Unsaved' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByLabelText('Note')).toHaveValue('Unsaved')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(close).not.toHaveBeenCalled()
    await act(async () => mounted.unmount())
    render(React.createElement(QuickAdd, { state: { date: event.date, editItem: { ...eventToItem(event), id: 'cached-event', readOnly: true } }, groups: [], onClose: close, onAdded: vi.fn() }))
    expect(screen.getByLabelText('Note')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Title')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('keeps the edit-start revision after external tags change and clears a canceled draft', async () => {
    const event = { ...newEvent('Ferns', '2026-06-08'), id: 'conflicted-event', note: 'Original' }
    const mock = setupCalendarApi({ events: [event as unknown as DataRecord] })
    const close = vi.fn()
    const clear = vi.spyOn(mock.api.documents.drafts, 'clear')
    render(React.createElement(QuickAdd, { state: { date: event.date, editItem: eventToItem(event) }, groups: [], onClose: close, onAdded: vi.fn() }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Local unsaved Markdown' } })
    await mock.api.data.dataset('calendar.event_tags').insert({ eventId: event.id, tag: 'external' })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Note')).toHaveValue('Local unsaved Markdown')
    expect(mock.datasets.get('calendar.events')?.[0].note).toBe('Original')
    expect(close).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })) })
    expect(clear).toHaveBeenCalledWith({ pluginId: 'calendar', sourceId: 'events', itemId: event.id })
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('normalizeEventRecord', () => {
  it('coerces a sparse record and defaults to all-day', () => {
    const e = normalizeEventRecord({ id: 'e1', title: 'Survey', date: '2026-06-05' })
    expect(e.title).toBe('Survey')
    expect(e.date).toBe('2026-06-05')
    expect(e.allDay).toBe(true)
    expect(e.startTime).toBeUndefined()
    expect(e.tags).toEqual([])
  })

  it('keeps valid times and marks timed events not all-day', () => {
    const e = normalizeEventRecord({
      id: 'e2',
      title: 'Fungal survey',
      date: '2026-06-05',
      startTime: '09:00',
      endTime: '10:30'
    })
    expect(e.startTime).toBe('09:00')
    expect(e.endTime).toBe('10:30')
    expect(e.allDay).toBe(false)
  })

  it('drops invalid times and colors', () => {
    const e = normalizeEventRecord({
      id: 'e3',
      title: 'X',
      date: '2026-06-05',
      startTime: '25:99',
      color: 'red'
    })
    expect(e.startTime).toBeUndefined()
    expect(e.color).toBeUndefined()
  })

  it('newEvent builds a valid record', () => {
    const e = newEvent('Canopy survey', '2026-06-06', { startTime: '18:00' })
    expect(e.title).toBe('Canopy survey')
    expect(e.date).toBe('2026-06-06')
    expect(e.allDay).toBe(false)
    expect(e.id).toMatch(/^event_/)
  })

  it('rejects legacy string locations after database migration', () => {
    const e = normalizeEventRecord({ id: 'e4', title: 'X', date: '2026-06-05', location: ' Room 3 ' })
    expect(e.location).toBeUndefined()
  })

  it('keeps coordinates only as a complete pair — half a fix is no fix', () => {
    const both = normalizeEventRecord({
      id: 'e5', title: 'X', date: '2026-06-05',
      location: { name: 'Woodland edge', lng: 8.54, lat: 47.37 }
    })
    expect(both.location).toEqual({ name: 'Woodland edge', lng: 8.54, lat: 47.37 })
    const half = normalizeEventRecord({
      id: 'e6', title: 'X', date: '2026-06-05', location: { name: 'Woodland edge', lat: 47.37 }
    })
    expect(half.location).toEqual({ name: 'Woodland edge' })
    const nameless = normalizeEventRecord({
      id: 'e7', title: 'X', date: '2026-06-05', location: { lng: 8.54, lat: 47.37 }
    })
    expect(nameless.location).toBeUndefined()
  })

  it('accepts only http(s) links, de-duplicated', () => {
    const e = normalizeEventRecord({
      id: 'e8', title: 'X', date: '2026-06-05',
      urls: ['https://example.org', 'https://example.org', 'javascript:alert(1)', 'file:///etc/passwd', '']
    })
    expect(e.urls).toEqual(['https://example.org'])
  })

  it('normalizes and de-duplicates attachment paths', () => {
    const e = normalizeEventRecord({
      id: 'e9', title: 'X', date: '2026-06-05',
      attachments: ['./Archive/Plan.pdf', 'Archive/Plan.pdf', '', 42]
    })
    expect(e.attachments).toEqual(['Archive/Plan.pdf'])
  })

  it('leaves the new fields absent on a record that carries none', () => {
    const e = normalizeEventRecord({ id: 'e10', title: 'X', date: '2026-06-05' })
    expect(e.urls).toBeUndefined()
    expect(e.attachments).toBeUndefined()
    expect(e.location).toBeUndefined()
    expect(e.group).toBeUndefined()
  })

  it('keeps one attachment and one link in named hover submenus and dispatches each child', async () => {
    const mock = setupCalendarApi()
    const item = eventToItem(normalizeEventRecord({
      id: 'event-menu',
      title: 'Survey references',
      date: '2026-06-05',
      attachments: ['Archive/fern-sheet.pdf'],
      urls: ['https://example.com/fern']
    }))

    const menu = eventMenuItems(item)
    expect(menu).toMatchObject([
      { id: 'open-attachment', label: 'Attachment', submenu: [{ label: 'fern-sheet.pdf' }] },
      { id: 'open-link', label: 'Link', submenu: [{ label: 'https://example.com/fern' }] }
    ])
    await menu[0].submenu?.[0].onSelect?.()
    await menu[1].submenu?.[0].onSelect?.()
    expect(mock.api.workspace.openFile).toHaveBeenCalledWith('Archive/fern-sheet.pdf')
    expect(mock.api.links.open).toHaveBeenCalledWith('https://example.com/fern')
  })
})

describe('resolveItemColor precedence', () => {
  it('falls back to priority, then status, then default', () => {
    expect(resolveItemColor({ priority: 'high' })).toBe(paletteRef('red'))
    expect(resolveItemColor({ status: 'active' })).toBe(paletteRef('primary-blue'))
    expect(resolveItemColor({})).toBe(paletteRef('gray'))
  })

  it('uses explicit color, shared group, priority, status, then gray in that order', () => {
    const base: CalItem = { kind: 'event', id: 'i', title: 'Survey', date: '2026-06-05' }
    const groups = [{ id: 'fungi', name: 'Fungi', color: 'palette:green' }]
    expect(calendarItemColor({ ...base, color: '#abcdef', groupId: 'fungi', priority: 'high' }, groups)).toBe('#abcdef')
    expect(calendarItemColor({ ...base, groupId: 'fungi', priority: 'high' }, groups)).toBe('palette:green')
    expect(calendarItemColor({ ...base, priority: 'high', status: 'active' }, groups)).toBe('palette:red')
    expect(calendarItemColor({ ...base, status: 'active' }, groups)).toBe('palette:primary-blue')
    expect(calendarItemColor(base, groups)).toBe('palette:gray')
  })
})

describe('rangeDays', () => {
  it('lists inclusive days regardless of order', () => {
    expect(rangeDays('2026-06-03', '2026-06-05')).toEqual([
      '2026-06-03',
      '2026-06-04',
      '2026-06-05'
    ])
    expect(rangeDays('2026-06-05', '2026-06-03')).toHaveLength(3)
  })
})

describe('calendarSwipeStep', () => {
  it('allows one navigation per horizontal wheel gesture', () => {
    let gesture: CalendarSwipeGesture = newSwipeGesture()

    let result = calendarSwipeStep(gesture, -35, 0)
    expect(result.step).toBe(0)
    expect(result.gesture).toMatchObject({ acc: -35, fired: false })

    result = calendarSwipeStep(result.gesture, -35, 0)
    expect(result.step).toBe(-1)
    expect(result.gesture).toMatchObject({ acc: 0, fired: true })

    // Still rising after the fire: same fling cresting, swallowed (not yet decaying).
    result = calendarSwipeStep(result.gesture, -120, 0)
    expect(result.step).toBe(0)
    expect(result.gesture).toMatchObject({ acc: 0, fired: true })

    gesture = newSwipeGesture()
    result = calendarSwipeStep(gesture, -61, 0)
    expect(result.step).toBe(-1)
  })

  it('ignores vertical wheel input and resets accumulation on direction change', () => {
    const idle = newSwipeGesture()
    const vertical = calendarSwipeStep(idle, -100, 120)
    expect(vertical.step).toBe(0)
    expect(vertical.gesture).toBe(idle) // untouched — incidental vertical frame

    const reversed = calendarSwipeStep({ ...newSwipeGesture(), acc: -40 }, 30, 0)
    expect(reversed.step).toBe(0)
    expect(reversed.gesture).toMatchObject({ acc: 30, fired: false })
  })

  it('collapses a fling plus its decaying inertia tail into a single step', () => {
    let r = calendarSwipeStep(newSwipeGesture(), -90, 0)
    expect(r.step).toBe(-1)
    for (const d of [-70, -55, -40, -28, -18, -10, -4]) {
      r = calendarSwipeStep(r.gesture, d, 0)
      expect(r.step).toBe(0)
    }
    expect(r.gesture.fired).toBe(true)
  })

  it('requires two growing frames to distinguish a fast reswipe from one momentum spike', () => {
    let r = calendarSwipeStep(newSwipeGesture(), -90, 0)
    expect(r.step).toBe(-1)
    for (const d of [-60, -32, -14]) r = calendarSwipeStep(r.gesture, d, 0)
    expect(r.step).toBe(0)
    r = calendarSwipeStep(r.gesture, -20, 0)
    expect(r.step).toBe(0)
    r = calendarSwipeStep(r.gesture, -50, 0)
    expect(r.step).toBe(-1)
    expect(r.gesture.fired).toBe(true)
  })
})

describe('Calendar shell chrome', () => {
  beforeEach(async () => {
    setupCalendarApi()
    await readTimeControl()
    patchTimeControl({
      view: 'week',
      cursor: '2026-06-01',
      selectedDate: '2026-06-04',
      rangeStart: null,
      rangeEnd: null,
      selectedTime: null
    })
    await flushTimeControl()
  })

  it('keeps the main workspace topbar as the first full-bleed child', async () => {
    const { container } = render(React.createElement(CalendarPage))
    await screen.findByRole('heading', { name: /W23\s+2026/i })

    const root = container.querySelector('.calendar-view')
    expect(container.firstElementChild).toBe(root)
    expect(root).toHaveClass('calendar-view-main')
    expect(root).not.toHaveClass('calendar-view-sidebar')
    expect(root?.firstElementChild).toHaveClass('calendar-topbar')
    const leading = root?.querySelector('.calendar-topbar-leading')
    expect(leading?.firstElementChild).toBe(screen.getByRole('heading', { name: /W23\s+2026/i }))
    expect(container.querySelector('.calendar-history-actions')).not.toBeInTheDocument()
    expect(container.querySelector('.calendar-header')).not.toBeInTheDocument()
  })

  it('does not turn a narrow main workspace calendar into the sidebar variant', async () => {
    class NarrowResizeObserver {
      constructor(private readonly cb: ResizeObserverCallback) {}
      observe(): void {
        this.cb([{ contentRect: { width: 300 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
      }
      disconnect(): void {}
      unobserve(): void {}
    }
    global.ResizeObserver = NarrowResizeObserver as unknown as typeof ResizeObserver

    const { container } = render(React.createElement(Calendar, { variant: 'main' }))
    await waitFor(() => expect(container.querySelector('.calendar-view')).toHaveClass('calendar-view-compact'))

    const root = container.querySelector('.calendar-view')
    expect(root).toHaveClass('calendar-view-main')
    expect(root).not.toHaveClass('calendar-view-sidebar')
    expect(root?.firstElementChild).toHaveClass('calendar-topbar')
  })

  it('measures both the calendar shell and week grid using the visible iframe observer', async () => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const container = frame.contentDocument!.body.appendChild(frame.contentDocument!.createElement('div'))
    const observed: Element[] = []
    const disconnect = vi.fn()
    class FrameObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element): void {
        expect(target.ownerDocument === frame.contentDocument).toBe(true)
        observed.push(target)
        this.callback([{ contentRect: { width: 300 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
      }
      disconnect = disconnect
      unobserve(): void {}
    }
    Object.defineProperty(frame.contentWindow, 'ResizeObserver', { value: FrameObserver })
    const mounted = render(React.createElement(Calendar, { variant: 'main' }), { container })
    try {
      await waitFor(() => expect(container.querySelector('.calendar-view')?.classList.contains('calendar-view-compact')).toBe(true))
      expect(observed.some((element) => element === container.querySelector('.calendar-view'))).toBe(true)
      await waitFor(() => expect(observed.some((element) => element === container.querySelector('.calendar-weekgrid-body'))).toBe(true))
      mounted.unmount()
      expect(disconnect).toHaveBeenCalledTimes(observed.length)
    } finally { mounted.unmount(); frame.remove() }
  })

  it('keeps the right-sidebar calendar on the compact topbar path', async () => {
    const { container } = render(React.createElement(Calendar, { variant: 'right' }))
    await screen.findByRole('heading', { name: /W23\s+2026/i })

    const root = container.querySelector('.calendar-view')
    expect(root).toHaveClass('calendar-view-sidebar')
    expect(root).toHaveClass('calendar-view-compact')
    expect(root?.firstElementChild).toHaveClass('calendar-topbar')
    expect(root?.querySelector('.calendar-header')).not.toBeInTheDocument()
    expect(root?.querySelector('.calendar-topbar .calendar-switcher')).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Week', 'Month', 'Year'])
  })

  it('keeps every right-sidebar period tab, chevron and Today control active', async () => {
    const { container } = render(React.createElement(Calendar, { variant: 'right' }))
    await screen.findByRole('heading', { name: /W23\s+2026/i })

    for (const [mode, label, before, after] of [
      ['month', 'Month', /Jun\s+2026/i, /Jul\s+2026/i],
      ['year', 'Year', /^2026$/, /^2027$/],
      ['week', 'Week', /W23\s+2026/i, /W24\s+2026/i]
    ] as const) {
      await act(async () => { fireEvent.click(screen.getByRole('tab', { name: label })) })
      expect(screen.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true')
      expect(container.querySelector('.calendar-scroll-area')).toHaveAttribute('data-view', mode)
      expect(screen.getByRole('heading', { name: before })).toBeInTheDocument()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Next' })) })
      expect(screen.getByRole('heading', { name: after })).toBeInTheDocument()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Previous' })) })
      expect(screen.getByRole('heading', { name: before })).toBeInTheDocument()
    }
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Today' })) })
    const today = new Date()
    const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    await act(async () => { expect((await readTimeControl()).selectedDate).toBe(expectedDate) })
    expect(container.querySelectorAll('.calendar-topbar')).toHaveLength(1)
  })

  it('keeps period facts in Markdown rows and source controls in their own inspector tab', async () => {
    const mock = setupCalendarApi({
      calendars: [{ id: 'field-calendar', name: 'Field observations', accountId: 'field-account', provider: 'test-calendar', timezone: 'Europe/Berlin', readOnly: true }],
      settings: { hiddenSources: ['calendar:noteDates'], disabledCalendarAccounts: ['field-account'] }
    })
    const executeOwn = vi.spyOn(mock.api.commands, 'executeOwn')
    const segment = mock.api.interop.extensions.providers(METADATA_PANEL_SEGMENT_V1)[0].extension
    const context = { relPath: '', kind: 'unsupported' as const, subject: { pluginId: 'calendar', surface: 'main_workspace' as const, view: { v: 1, view: 'week', cursor: '2026-06-01', selectedDate: '2026-06-04', rangeStart: '2026-06-03', rangeEnd: '2026-06-05', selectedTime: '09:00' } } }
    const fields = await segment.inspect!(context)
    expect(fields.every((field) => field.readOnly)).toBe(true)
    expect(Object.fromEntries(fields.map((field) => [field.id, field.value]))).toMatchObject({
      plugin: 'calendar', view: 'week', selectedDate: '2026-06-04', month: '2026-06', week: { number: 23, start: '2026-06-01', end: '2026-06-07' }, year: 2026, range: ['2026-06-03', '2026-06-05'], selectedTime: '09:00'
    })
    const segments = mock.api.interop.extensions.providers(METADATA_PANEL_SEGMENT_V1).map((entry) => entry.extension)
    expect(segments.map(({ id, icon }) => ({ id, icon }))).toEqual([
      { id: 'calendar.properties', icon: 'calendar' }, { id: 'calendar.groups', icon: 'group' }, { id: 'calendar.sources', icon: 'layers' }, { id: 'calendar.noteDates', icon: 'push-pin' }
    ])
    const sources = segments.find((entry) => entry.id === 'calendar.sources')!
    expect(Object.fromEntries((await sources.inspect!(context)).map((field) => [field.id, field.value]))).toMatchObject({
      sources: [{ id: 'calendar:events', name: 'Events' }, { id: 'calendar:plugin:todo', name: 'To-Do' }],
    })
    const rendered = render(React.createElement(React.Fragment, null, segment.render(context)))
    expect(rendered.container.querySelector('dl.props-info-table')).toBeInTheDocument()
    expect(screen.queryByText('Field team')).not.toBeInTheDocument()
    expect(screen.getByText('Active plugin').nextElementSibling).toHaveTextContent('Calendar')
    expect(screen.getByText('Selected date').nextElementSibling).toHaveTextContent('2026-06-04')
    expect(screen.getByText('Month').nextElementSibling).toHaveTextContent('Jun 2026')
    expect(rendered.container.querySelector('input, select, button')).not.toBeInTheDocument()
    expect(executeOwn).not.toHaveBeenCalled()
    rendered.rerender(React.createElement(React.Fragment, null, segment.render({ ...context, subject: { ...context.subject, view: { ...context.subject.view, view: 'year', cursor: '2027-07-01' } } })))
    expect(screen.getByText('Year', { selector: 'dt' }).nextElementSibling).toHaveTextContent('2027')
    expect(screen.getByText('Month').nextElementSibling).toHaveTextContent('Jul 2027')
    rendered.rerender(React.createElement(React.Fragment, null, sources.render(context)))
    expect(screen.queryByText('Field team')).not.toBeInTheDocument()
    expect(screen.queryByText(/Sync disabled/)).not.toBeInTheDocument()
    expect(screen.queryByText('Mail only')).not.toBeInTheDocument()
    expect(screen.queryByText('Selected date')).not.toBeInTheDocument()
    const todoSwitch = screen.getByRole('switch', { name: 'To-Do' })
    expect(todoSwitch).toBeChecked()
    expect(todoSwitch.closest('.calendar-filter-property-row')).toHaveClass('calendar-filter-property-row')
    expect(todoSwitch.parentElement).toHaveClass('calendar-filter-property-value')
    await act(async () => fireEvent.click(screen.getByRole('switch', { name: 'To-Do' })))
    expect(mock.api.settings.get().hiddenSources).toEqual(['calendar:noteDates', 'calendar:plugin:todo'])
    expect(screen.getByRole('switch', { name: 'To-Do' })).not.toBeChecked()
    await act(async () => { await mock.api.settings.set('hiddenSources', []) })
    expect(screen.getByRole('switch', { name: 'To-Do' })).toBeChecked()
  })

  it('uses shared groups and the existing visibility filter in a separate Groups tab', async () => {
    const mock = setupCalendarApi({ groups: [{ id: 'field', name: 'Field work', color: paletteRef('green') }] })
    const segment = mock.api.interop.extensions.providers(METADATA_PANEL_SEGMENT_V1).find((entry) => entry.extension.id === 'calendar.groups')!.extension
    const { container } = render(React.createElement(React.Fragment, null, segment.render({ relPath: '', kind: 'unsupported' })))
    expect(container.querySelector('.props-info-row dt')).toHaveTextContent('Field work')
    const groupSwitch = screen.getByRole('switch', { name: 'Field work' })
    expect(groupSwitch.closest('.calendar-filter-property-row')).toHaveClass('calendar-filter-property-row')
    await act(async () => fireEvent.click(groupSwitch))
    expect(mock.api.settings.get().hiddenGroups).toEqual(['field'])
    expect(screen.getByRole('switch', { name: 'Field work' })).not.toBeChecked()
    await act(async () => { await mock.api.settings.set('hiddenGroups', []) })
    expect(screen.getByRole('switch', { name: 'Field work' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Manage groups' }))
    expect(mock.api.workspace.openOwnSettings).toHaveBeenCalledWith()
    expect(mock.api.workspace.setGroups).not.toHaveBeenCalled()
  })

  it('shows persisted note-date source state in a separate Pin tab', async () => {
    const mock = setupCalendarApi({
      indexEntries: [
        { relPath: 'Contacts/Fern.md', title: 'Fern', kind: 'note', frontmatter: { type: 'contact', birthdate: '1990-05-04' }, mtimeMs: 0 },
        { relPath: 'Projects/Canopy.md', title: 'Canopy', kind: 'note', frontmatter: { type: 'project', due: '2026-06-08' }, mtimeMs: 0 }
      ],
      noteDateSources: [
        { id: 'birthdays', title: 'Birthdays', matchKey: 'type', matchValue: 'contact', dateField: 'birthdate', match: 'day-month', showCount: true, labelMode: 'filename', showFields: [], color: 'palette:blue', icon: 'cake', visible: true, hidden: false },
        { id: 'deadlines', title: 'Deadlines', matchKey: 'type', matchValue: 'project', dateField: 'due', match: 'exact', showCount: false, labelMode: 'filename', showFields: [], color: 'palette:orange', icon: 'flag', visible: false, hidden: false }
      ]
    })
    const segment = mock.api.interop.extensions.providers(METADATA_PANEL_SEGMENT_V1).find((entry) => entry.extension.id === 'calendar.noteDates')!.extension
    expect(await segment.inspect!({ relPath: '', kind: 'unsupported' })).toEqual([
      expect.objectContaining({ id: 'birthdays', label: 'Birthdays', value: true, type: 'boolean' }),
      expect.objectContaining({ id: 'deadlines', label: 'Deadlines', value: false, type: 'boolean' })
    ])

    const { container } = render(React.createElement(React.Fragment, null, segment.render({ relPath: '', kind: 'unsupported' })))
    const birthdays = await screen.findByRole('switch', { name: 'Birthdays' })
    const deadlines = screen.getByRole('switch', { name: 'Deadlines' })
    expect(birthdays).toBeChecked()
    await waitFor(() => expect(deadlines).not.toBeChecked())
    await waitFor(() => expect([...container.querySelectorAll('.calendar-filter-option-count')].map((node) => node.textContent)).toEqual(['1', '1']))

    await act(async () => fireEvent.click(deadlines))
    await waitFor(() => expect(mock.datasets.get('calendar.note_date_sources')?.find((row) => row.id === 'deadlines')?.definition).toMatchObject({ visible: true }))
    expect(screen.getByRole('switch', { name: 'Deadlines' })).toBeChecked()
  })

  it('shows an icon beside every day-menu action', async () => {
    const mock = setupCalendarApi()
    patchTimeControl({
      view: 'month',
      cursor: '2026-06-01',
      selectedDate: '2026-06-05',
      rangeStart: null,
      rangeEnd: null,
      selectedTime: null
    })
    flushTimeControl()
    const { container } = render(React.createElement(Calendar, { variant: 'right' }))
    await screen.findByRole('heading', { name: /Jun\s+2026/i })

    const day = [...container.querySelectorAll('.calendar-day-cell')].find((cell) =>
      !cell.classList.contains('outside') && cell.querySelector('.calendar-day-num')?.textContent === '5'
    )
    expect(day).toBeDefined()
    fireEvent.contextMenu(day as Element)

    const actions = (mock.menus.at(-1) ?? []).filter((entry) => entry.type !== 'separator')
    expect(actions.map((entry) => entry.label)).toEqual(['Open / create daily note', 'Add todo', 'Add event', 'Go to today', 'Open week'])
    expect(actions.every((entry) => React.isValidElement(entry.icon))).toBe(true)
  })

  it('publishes only right-panel date selections and clears them on unmount', async () => {
    const mock = setupCalendarApi()
    patchTimeControl({
      view: 'month',
      cursor: '2026-06-01',
      selectedDate: null,
      rangeStart: null,
      rangeEnd: null,
      selectedTime: null
    })
    flushTimeControl()
    const { container, unmount } = render(React.createElement(Calendar, { variant: 'right' }))
    await screen.findByRole('heading', { name: /Jun\s+2026/i })

    const day = [...container.querySelectorAll('.calendar-day-cell')].find((cell) =>
      !cell.classList.contains('outside') && cell.querySelector('.calendar-day-num')?.textContent === '5'
    )
    expect(day).toBeDefined()
    fireEvent.click(day as Element)

    await waitFor(() => expect(mock.api.interop.state.get(CALENDAR_PANEL_SELECTION_V1)).toEqual({
      selectedDate: '2026-06-05',
      rangeStart: null,
      rangeEnd: null
    }))
    unmount()
    expect(mock.api.interop.state.get(CALENDAR_PANEL_SELECTION_V1)).toBeNull()
  })

  it('publishes the persisted range when the right Calendar becomes active', async () => {
    const mock = setupCalendarApi()
    patchTimeControl({
      view: 'month',
      cursor: '2026-06-01',
      selectedDate: '2026-06-03',
      rangeStart: '2026-06-03',
      rangeEnd: '2026-06-07',
      selectedTime: '11:30'
    })
    flushTimeControl()

    const { unmount } = render(React.createElement(Calendar, { variant: 'right' }))

    await waitFor(() => expect(mock.api.interop.state.get(CALENDAR_PANEL_SELECTION_V1)).toEqual({
      selectedDate: '2026-06-03',
      rangeStart: '2026-06-03',
      rangeEnd: '2026-06-07'
    }))
    unmount()
    expect(mock.api.interop.state.get(CALENDAR_PANEL_SELECTION_V1)).toBeNull()
  })
})

describe('Calendar period transitions', () => {
  const cancel = vi.fn()
  const animate = vi.fn(() => ({ cancel }))
  const useAsyncTimeUpdates = () => {
    const patch = timeApi.patchTimeControl.bind(timeApi)
    vi.spyOn(timeApi, 'patchTimeControl').mockImplementation((value) =>
      Promise.resolve().then(() => patch(value)) as unknown as TimeControlState)
  }

  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
    setupCalendarApi()
  })

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'animate')
    vi.restoreAllMocks()
  })

  it('keeps repeated month selections mounted and only animates a different month', async () => {
    patchTimeControl({ view: 'month', cursor: '2026-10-01', selectedDate: '2026-10-15' })
    const { container } = render(<Calendar />)
    await screen.findByRole('heading', { name: /Oct\s+2026/i })
    animate.mockClear()
    useAsyncTimeUpdates()
    const grid = container.querySelector('.calendar-grid-wrap')
    const day = [...container.querySelectorAll('.calendar-day-cell:not(.outside)')]
      .find(node => node.querySelector('.calendar-day-num')?.textContent === '15')!
    fireEvent.click(day)
    fireEvent.click(day)
    await act(async () => {})
    expect(container.querySelector('.calendar-grid-wrap')).toBe(grid)
    expect((await readTimeControl()).selectedDate).toBe('2026-10-15')
    expect(animate).not.toHaveBeenCalled()

    fireEvent.click(container.querySelector('.calendar-actions button:last-child')!)
    await waitFor(() => expect(animate).toHaveBeenCalledTimes(1))
    expect(animate).toHaveBeenLastCalledWith([
      { transform: 'translateX(35%)', opacity: 0 },
      { transform: 'translateX(0)', opacity: 1 }
    ], expect.objectContaining({ duration: 260 }))
  })

  it('keeps weekday selections across a month boundary static and preserves grid scroll', async () => {
    patchTimeControl({ view: 'week', cursor: '2026-09-01', selectedDate: '2026-09-28' })
    const { container } = render(<Calendar />)
    await screen.findByRole('heading', { name: /W40\s+2026/i })
    animate.mockClear()
    useAsyncTimeUpdates()
    const grid = container.querySelector('.calendar-grid-wrap')!
    const scroll = container.querySelector('.calendar-weekgrid-body')!
    scroll.scrollTop = 240
    const days = container.querySelectorAll('.calendar-weekgrid-dayhead')
    for (const index of [1, 2, 3, 3, 0]) {
      fireEvent.click(days[index])
      await act(async () => {})
    }
    expect((await readTimeControl()).selectedDate).toBe('2026-09-28')
    expect(container.querySelector('.calendar-grid-wrap')).toBe(grid)
    expect(scroll.scrollTop).toBe(240)
    expect(animate).not.toHaveBeenCalled()

    fireEvent.click(container.querySelector('.calendar-actions button:last-child')!)
    await waitFor(() => expect(animate).toHaveBeenCalledTimes(1))
  })

  it('respects reduced motion when changing periods', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    patchTimeControl({ view: 'month', cursor: '2026-10-01', selectedDate: '2026-10-15' })
    const { container } = render(<Calendar />)
    fireEvent.click(container.querySelector('.calendar-actions button:last-child')!)
    await act(async () => {})
    expect(animate).not.toHaveBeenCalled()
  })
})

describe('independent Calendar views', () => {
  it('keeps main and sidebar modes separate across selection, bookmarks and remounting', async () => {
    const mock = setupCalendarApi({ settings: { mainView: 'week', sidebarView: 'month' } })
    patchTimeControl({ view: 'month', cursor: '2026-09-01', selectedDate: '2026-09-29' })
    const pair = <><section data-testid="main"><Calendar /></section><section data-testid="sidebar"><Calendar variant="right" /></section></>
    const first = render(pair)
    const main = within(screen.getByTestId('main'))
    const sidebar = within(screen.getByTestId('sidebar'))
    await waitFor(() => expect(main.getByRole('tab', { name: 'Week' })).toHaveClass('active'))
    expect(sidebar.getByRole('tab', { name: 'Month' })).toHaveClass('active')
    await act(async () => fireEvent.click(main.getByRole('tab', { name: 'Year' })))
    expect(sidebar.getByRole('tab', { name: 'Month' })).toHaveClass('active')
    await act(async () => fireEvent.click(sidebar.getByRole('tab', { name: 'Week' })))
    expect(main.getByRole('tab', { name: 'Year' })).toHaveClass('active')
    await act(async () => { await patchTimeControl({ selectedDate: '2026-10-01', cursor: '2026-10-01' }) })
    const surfaces = mock.api.interop.extensions.providers(PLUGIN_SURFACE_V1)
    expect(surfaces.find(p => p.extension.surface === 'main_workspace')!.extension.getSnapshot().view.view).toBe('year')
    expect(surfaces.find(p => p.extension.surface === 'right_sidebar')!.extension.getSnapshot().view.view).toBe('week')
    first.unmount()
    await act(async () => render(pair))
    expect(within(screen.getByTestId('main')).getByRole('tab', { name: 'Year' })).toHaveClass('active')
    expect(within(screen.getByTestId('sidebar')).getByRole('tab', { name: 'Week' })).toHaveClass('active')
  })
})

describe('strict agenda rows', () => {
  it('uses exactly one control or icon with aligned optional details', async () => {
    const mock = setupCalendarApi()
    const note = '**Bring labels.**\n\nFull description after the first paragraph.'
    const birthday: CalItem = { kind: 'sourced', sourceOwner: 'contacts', sourceId: 'contacts', id: 'birthday', title: 'Birthday: Fern', date: '2026-09-29', icon: 'cake', fields: [{ key: 'Age', value: '36' }], note: 'Age 52' }
    const event: CalItem = { kind: 'event', id: 'event', title: 'Survey', date: '2026-09-29' }
    const task: CalItem = { kind: 'sourced', sourceOwner: 'todo', sourceId: 'todo', id: 'task', title: 'Pack kit', date: '2026-09-29', startTime: '09:00', endTime: '10:00', completed: false, priority: 'high', attachments: ['kit.pdf'], note }
    await act(async () => render(<>{[birthday, event, task].map(item => <CalendarAgendaCard key={item.id} item={item} sourceId={item.sourceId ?? 'calendar'} color="palette:green" onClick={() => {}} onDoubleClick={() => {}} onContextMenu={() => {}} />)}</>))
    const rows = [...document.querySelectorAll('.agenda-card')]
    expect(rows[0].querySelector('.agenda-card-time')).toBeNull()
    expect(rows[0]).not.toHaveTextContent('36')
    await waitFor(() => expect(rows[0].querySelector('.agenda-card-note')).toHaveTextContent('Age 52'))
    expect(rows[1].querySelector('.agenda-card-time')).toBeNull()
    expect(rows[2].querySelector('.agenda-card-time')).toHaveTextContent('09:00–10:00')
    expect(rows[2].querySelector('input[type="checkbox"]')).toBeInTheDocument()
    for (const row of rows) {
      expect(row.querySelector('.agenda-card-leading')).toHaveStyle({ color: 'var(--color-green)' })
      expect(row.querySelectorAll('.agenda-card-leading > *')).toHaveLength(1)
      expect(row.querySelector('.agenda-card-dot, .agenda-card-fields, .calendar-item-badges, .markdown-body')).toBeNull()
    }
    expect(rows[2].querySelector('.agenda-card-icon')).toBeNull()
    expect(rows[2].querySelector('.agenda-card-note')).toHaveTextContent('Full description after the first paragraph.')
    expect(mock.popovers).toHaveLength(0)
  })
})

describe('Calendar action menu schema', () => {
  it.each(['contacts', 'field-journal'])('omits metadata and supplies icons for every %s action and submenu', async owner => {
    const mock = setupCalendarApi()
    const runAction = vi.fn(async () => true)
    mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, {
      integration: { name: 'Field source', version: '1.0.0' },
      list: pagedSource(async () => []),
      open: async () => {},
      actions: async () => [
        { id: 'edit', label: 'Edit' },
        { id: 'details', label: 'Details', submenu: [{ id: 'inspect', label: 'Inspect' }] }
      ],
      runAction
    }, owner)
    const sourceId = mock.api.interop.services.providers(CALENDAR_ITEM_SOURCE_V2).find(source => source.owner === owner)!.providerId
    const item: CalItem = { kind: 'sourced', sourceId, sourceOwner: owner, id: 'birthday', title: 'Birthday: Fern', date: '2026-09-29', note: 'Age 52', fields: [{ key: 'Age', value: '52' }], readOnly: true }
    const menu = await calendarItemMenuItems(item, vi.fn())
    expect(menu.map(action => action.label)).toEqual(['Edit', 'Open in Calendar', 'Open in Field source', 'Details'])
    const nested = menu.find(action => action.id === 'details')!.submenu!
    const entries = [...menu, ...nested]
    expect(entries.every(action => !!action.icon)).toBe(true)
    let view!: ReturnType<typeof render>
    await act(async () => { view = render(<>{entries.map((action, index) => <span key={index}>{action.icon}</span>)}</>) })
    expect(view.container.querySelectorAll('svg')).toHaveLength(entries.length)
    await act(async () => { nested[0].onSelect?.() })
    expect(runAction).toHaveBeenCalledWith('birthday', 'inspect')
  })

  it.each(['event', 'noteDate', 'file'] as const)('omits metadata from %s action menus', async kind => {
    setupCalendarApi()
    const menu = await calendarItemMenuItems({ kind, id: 'fern', title: 'Fern', date: '2026-09-29', fields: [{ key: 'Age', value: '52' }] }, vi.fn())
    expect(menu.some(action => action.id?.startsWith('field:'))).toBe(false)
    expect(menu.every(action => !!action.icon)).toBe(true)
  })

  it.each(['missing', 'failed'])('keeps a visible glyph when the plugin icon is %s', async state => {
    const mock = setupCalendarApi()
    const icon = vi.mocked(mock.api.ui.pluginIcon)
    if (state === 'missing') icon.mockResolvedValue(null)
    else icon.mockRejectedValue(new Error('Icon unavailable'))
    let view!: ReturnType<typeof render>
    await act(async () => { view = render(<PluginGlyph owner="field-journal" />) })
    expect(view.container.querySelector('.calendar-chip-glyph > svg')).toBeInTheDocument()
  })
})

it('keeps location in the details column and opens its map without opening Calendar', async () => {
  const mock = setupCalendarApi()
  const onClick = vi.fn()
  const open = vi.fn()
  const item: CalItem = { kind: 'event', id: 'survey', title: 'Forest survey', date: '2026-09-29', location: { name: 'Forest station', lat: 12, lng: 34 } }
  const props = { item, sourceId: '', color: 'palette:green', onClick, onDoubleClick: vi.fn(), onContextMenu: vi.fn() }
  const mounted = render(<CalendarAgendaCard {...props} />)
  expect(mounted.container.querySelector('.agenda-card-body > .agenda-card-location')).toHaveTextContent('Forest station')
  expect(screen.getByRole('button', { name: 'Forest station' })).toBeInTheDocument()
  mock.provideInterop(GEO_NAVIGATOR_V1, { open }, 'map')
  mounted.rerender(<CalendarAgendaCard {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Forest station' }))
  await waitFor(() => expect(mock.api.links.open).toHaveBeenCalledWith({ category: 'location', value: '12,34' }))
  expect(onClick).not.toHaveBeenCalled()
})

describe('week drag creation', () => {
  it('keeps the selected time block while the compact editor is open and clears it on Cancel', async () => {
    const mock = setupCalendarApi()
    const openPopover = mock.api.ui.openPopover
    vi.spyOn(mock.api.ui, 'openPopover').mockImplementation((...args) => {
      void openPopover(...args)
      return new Promise(() => {})
    })
    patchTimeControl({ view: 'week', cursor: '2026-09-01', selectedDate: '2026-09-29' })
    const originalPointerEvent = window.PointerEvent
    window.PointerEvent = MouseEvent as typeof PointerEvent
    try {
      const { container } = render(<Calendar />)
      await screen.findByRole('heading', { name: /W40/ })
      const column = container.querySelector('.calendar-weekgrid-col')!
      fireEvent.pointerDown(column, { clientX: 20, clientY: 132, pointerId: 1 })
      fireEvent.pointerMove(column, { clientX: 20, clientY: 198, pointerId: 1 })
      const selection = container.querySelector('.calendar-weekgrid-block--create')!
      expect(selection).toBeInTheDocument()
      const bounds = (selection as HTMLElement).style.cssText
      const time = selection.textContent
      fireEvent.pointerUp(column, { clientX: 20, clientY: 198, pointerId: 1 })
      await screen.findByRole('dialog', { name: 'What to add' })
      const draft = container.querySelector('.calendar-weekgrid-block--create')!
      expect(draft).toHaveTextContent(time!)
      expect((draft as HTMLElement).style.cssText).toBe(bounds)
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(container.querySelector('.calendar-weekgrid-block--create')).toBeNull()
    } finally { window.PointerEvent = originalPointerEvent }
  })
})

describe('compact month selected-day entries', () => {
  it('shows local events, note dates, and contributed plugin items together', async () => {
    setupCalendarApi({
      events: [{ id: 'event-one', title: 'Canopy survey', date: '2026-05-04' }],
      todos: [{ id: 'todo-one', title: 'Pack field kit', dueDate: '2026-05-04', completed: false, group: 'Field work', color: 'palette:green', startTime: '08:00', endTime: '09:00', note: 'Bring specimen labels.', filePath: 'Tasks/Pack.md', attachments: ['Files/List.pdf'] }],
      indexEntries: [{
        relPath: 'Contacts/Fern.md',
        title: 'Fern birthday',
        kind: 'note',
        frontmatter: { type: 'contact', birthdate: '1990-05-04' },
        mtimeMs: 0
      }],
      noteDateSources: [{
          id: 'birthdays',
          title: 'Birthdays',
          matchKey: 'type',
          matchValue: 'contact',
          dateField: 'birthdate',
          match: 'day-month',
          showCount: true,
          labelMode: 'filename',
          showFields: [],
          visible: true,
          hidden: false
        }]
    })
    patchTimeControl({
      view: 'month',
      cursor: '2026-05-01',
      selectedDate: '2026-05-04',
      rangeStart: null,
      rangeEnd: null,
      selectedTime: null
    })
    flushTimeControl()

    const { container } = render(React.createElement(Calendar, { variant: 'right' }))
    await waitFor(() => expect(container.querySelectorAll('.calendar-todos .agenda-card')).toHaveLength(3))
    expect(container.querySelector('.calendar-todos .agenda-day-header')).not.toBeInTheDocument()
    const titles = [...container.querySelectorAll('.calendar-todos .agenda-card-title')].map((node) => node.textContent)
    expect(titles).toEqual(expect.arrayContaining(['Canopy survey', 'Pack field kit', 'Fern birthday (36)']))
    const todoRow = container.querySelector('[data-calendar-item-id="todo-one"]')
    expect(todoRow).toHaveTextContent('08:00–09:00')
    expect(todoRow).toHaveTextContent('Bring specimen labels.')
    expect(todoRow?.querySelector('.agenda-card-leading')).toHaveStyle({ color: 'var(--color-green)' })
    expect(todoRow?.querySelector('.agenda-card-dot, .calendar-item-badges, .agenda-card-fields')).toBeNull()
    expect(todoRow?.querySelector('.calendar-chip-glyph')).toBeNull()
    expect(todoRow?.querySelector('input[type=checkbox]')).toBeInTheDocument()
    expect(todoRow?.querySelector('.calendar-source-card-check')).not.toBeInTheDocument()
    expect(todoRow?.querySelector('.calendar-source-card-menu')).not.toBeInTheDocument()
  })
})

describe('calendar item deduplication', () => {
  it('keeps the contributed item when a local event mirrors its linked slot', () => {
    const task: CalItem = {
      kind: 'sourced',
      id: 'task',
      title: 'Grade last week before writing next week',
      date: '2026-08-24',
      startTime: '08:00',
      endTime: '08:30',
      filePath: 'Focus/The Week Ahead.md',
      sourceId: 'provider-todo'
    }
    const event = eventToItem(normalizeEventRecord({
      id: 'event',
      title: 'Week-ahead review',
      date: '2026-08-24',
      startTime: '08:00',
      endTime: '08:30',
      filePath: 'Focus/The Week Ahead.md'
    }))

    expect(deduplicateCalendarItems([task, event])).toEqual([task])
  })

  it('keeps events with a different slot, remote events, and multi-day events', () => {
    const task: CalItem = {
      kind: 'sourced',
      id: 'task',
      title: 'Inspect the wetland',
      date: '2026-06-08',
      startTime: '08:00',
      endTime: '09:00',
      filePath: 'Field/Wetland.md'
    }
    const later = eventToItem(normalizeEventRecord({
      id: 'later',
      title: 'Wetland review',
      date: '2026-06-08',
      startTime: '10:00',
      endTime: '11:00',
      filePath: 'Field/Wetland.md'
    }))
    const remote = eventToItem({
      ...normalizeEventRecord({
        id: 'google:wetland',
        title: 'Inspect the wetland',
        date: '2026-06-08',
        startTime: '08:00',
        endTime: '09:00',
        filePath: 'Field/Wetland.md'
      }),
      source: 'google'
    })
    const span = eventToItem(normalizeEventRecord({
      id: 'span',
      title: 'Wetland survey window',
      date: '2026-06-07',
      endDate: '2026-06-08',
      startTime: '08:00',
      endTime: '09:00',
      filePath: 'Field/Wetland.md'
    }))

    expect(deduplicateCalendarItems([task, later, remote, { ...span, date: '2026-06-08' }]))
      .toEqual([task, later, remote, { ...span, date: '2026-06-08' }])
  })
})

describe('Calendar item clicks', () => {
  let mock: MockValleyApi
  let ownerEdit: ReturnType<typeof vi.fn>
  beforeEach(() => {
    ownerEdit = vi.fn()
    mock = setupCalendarApi({
      providerEdit: ownerEdit,
      todos: [
        {
          id: 't1',
          title: 'Open field survey',
          completed: false,
          dueDate: '2026-06-08',
          startTime: '08:00',
          endTime: '09:00',
          filePath: 'Notes/Field Survey.md',
          note: 'Task note [[Ferns]]'
        } as DataRecord,
        {
          id: 't2',
          title: 'All-day deadline',
          completed: false,
          dueDate: '2026-06-08'
        } as DataRecord
      ]
    })
    patchTimeControl({
      view: 'week',
      cursor: '2026-06-01',
      selectedDate: '2026-06-08',
      rangeStart: null,
      rangeEnd: null,
      selectedTime: null
    })
    flushTimeControl()
  })

  it('selects on click, edits on double click, and opens related content only from the context menu', async () => {
    render(React.createElement(Calendar))

    // Wait for the async time-control to settle into the seeded week view (W24
    // contains 2026-06-08) before interacting — the right-click menu is week-only.
    await screen.findByRole('heading', { name: /W24\s+2026/i })
    const title = screen.getByText('Open field survey')
    fireEvent.click(title)

    const block = title.closest('.calendar-weekgrid-block')
    expect(block).toHaveClass('selected')
    expect(block?.querySelector('.calendar-chip-glyph')).toBeNull()
    expect(block).toHaveStyle({ zIndex: '7' })
    expect(mock.api.workspace.openFile).not.toHaveBeenCalled()

    const properties = renderProperties(mock)
    await waitFor(() => expect(properties.container).toHaveTextContent('Open field survey'))
    expect(properties.container.querySelector('input, textarea, select, button')).not.toBeInTheDocument()
    const segment = mock.api.interop.extensions.providers(METADATA_PANEL_SEGMENT_V1)[0].extension
    expect(segment.editCommand).toBeUndefined()
    properties.unmount()

    await act(async () => { fireEvent.doubleClick(title) })
    expect(ownerEdit).toHaveBeenCalledWith('t1')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mock.api.workspace.showProperties).not.toHaveBeenCalled()

    if (screen.queryByRole('dialog')) await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })))
    fireEvent.contextMenu(title)

    await waitFor(() => expect(mock.menus.at(-1)?.map((item) => item.label)).toContain('Edit'))
    expect(mock.menus.at(-1)?.map((item) => item.label)).toContain('Delete')
    expect(mock.menus.at(-1)?.find((item) => item.label === 'Edit')?.icon).toBeTruthy()
    expect(mock.menus.at(-1)?.find((item) => item.label === 'Delete')?.icon).toBeTruthy()
    expect(mock.api.workspace.openFile).not.toHaveBeenCalled()
    await act(async () => { await mock.menus.at(-1)?.find((item) => item.label === 'Edit')?.onSelect?.(); await new Promise(resolve => setTimeout(resolve, 10)) })
    expect(ownerEdit).toHaveBeenCalledWith('t1')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const openNote = mock.menus.at(-1)?.find((item) => item.label === 'Open note')
    expect(openNote).toBeTruthy()
    await act(async () => { await openNote?.onSelect?.() })
    expect(mock.api.workspace.openFile).toHaveBeenCalledWith('Notes/Field Survey.md')
  })

  it.each(['main', 'right', 'agenda'] as const)('opens the owning plugin editor for a contributed item from %s', async (surface) => {
    const contexts: unknown[] = []
    const MarkdownView = mock.api.ui.MarkdownView
    mock.api.ui.MarkdownView = (props) => { contexts.push(props.context); return React.createElement(MarkdownView, props) }
    const { container } = render(surface === 'agenda' ? React.createElement(AgendaPanel) : React.createElement(Calendar, { variant: surface }))
    const selector = surface === 'agenda' ? '.agenda-card[data-calendar-item-id="t1"]' : '.calendar-weekgrid-block[data-calendar-item-id="t1"]'
    await waitFor(() => expect(container.querySelector(selector)).toBeInTheDocument())
    await act(async () => { fireEvent.doubleClick(container.querySelector(selector)!) })
    expect(ownerEdit).toHaveBeenCalledWith('t1')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mock.api.workspace.showProperties).not.toHaveBeenCalled()
    if (surface === 'agenda') expect(contexts).toEqual([])
  })

  it.each(['main', 'right'] as const)('opens event editing from the %s Calendar menu in a compact popover', async (variant) => {
    mock = setupCalendarApi({ events: [{ id: 'event-modal', title: 'Canopy survey', date: '2026-06-08' } as DataRecord] })
    patchTimeControl({ view: 'week', cursor: '2026-06-01', selectedDate: '2026-06-08' })
    await flushTimeControl()
    render(React.createElement(Calendar, { variant }))
    await screen.findByRole('heading', { name: /W24\s+2026/i })
    const title = await screen.findByText('Canopy survey')
    fireEvent.contextMenu(title)
    await waitFor(() => expect(mock.menus.at(-1)?.some((item) => item.label === 'Edit')).toBe(true))
    await act(async () => { await mock.menus.at(-1)?.find((item) => item.label === 'Edit')?.onSelect?.(); await new Promise(resolve => setTimeout(resolve, 10)) })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(screen.getByLabelText('Title')).toHaveValue('Canopy survey')
    expect(mock.api.workspace.showProperties).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Discarded survey draft' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => { fireEvent.doubleClick(screen.getByText('Canopy survey')); await new Promise(resolve => setTimeout(resolve, 10)) })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(screen.getByLabelText('Title')).toHaveValue('Canopy survey')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('flashes the exact timed and all-day contributed items', async () => {
    const { container } = render(React.createElement(Calendar))
    await screen.findByRole('heading', { name: /W24\s+2026/i })
    const sourceId = mock.api.interop.services.providers(CALENDAR_ITEM_SOURCE_V2)[0].providerId

    const reveal = (itemId: string, nonce: number): void => {
      const target: CalendarRevealTarget = {
        surface: 'main',
        sourceId,
        itemId,
        date: '2026-06-08',
        nonce
      }
      act(() => revealTargetStore().publish(target))
    }

    reveal('t1', 1)
    await waitFor(() => {
      const timed = container.querySelector(
        `.calendar-weekgrid-block[data-calendar-source-id="${sourceId}"][data-calendar-item-id="t1"]`
      )
      expect(timed).toHaveClass('calendar-reveal-target')
    })

    reveal('t2', 2)
    await waitFor(() => {
      const allDay = container.querySelector(
        `.calendar-chip[data-calendar-source-id="${sourceId}"][data-calendar-item-id="t2"]`
      )
      expect(allDay).toHaveClass('calendar-reveal-target')
    })
  })

  it('uses the same item interactions for month chips', async () => {
    patchTimeControl({ view: 'month', cursor: '2026-06-01', selectedDate: null })
    flushTimeControl()
    render(React.createElement(Calendar))

    await screen.findByRole('heading', { name: /Jun\s+2026/i })
    const chip = screen.getByRole('button', { name: /Open field survey/ })
    fireEvent.click(chip)
    expect(chip).toHaveClass('selected')
    expect(chip.querySelector('.calendar-chip-glyph')).toBeNull()
    expect(mock.api.workspace.openFile).not.toHaveBeenCalled()

    await act(async () => { fireEvent.doubleClick(chip) })
    expect(ownerEdit).toHaveBeenCalledWith('t1')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mock.api.workspace.showProperties).not.toHaveBeenCalled()

    fireEvent.contextMenu(chip)
    await waitFor(() => expect(mock.menus.at(-1)?.map((item) => item.label)).toContain('Edit'))
    expect(mock.menus.at(-1)?.map((item) => item.label)).toContain('Open note')
  })

  it('renders a mirrored local event and contributed item once and keeps owner navigation', async () => {
    const opened = vi.fn()
    mock = setupCalendarApi({
      todos: [{
        id: 'week-task',
        title: 'Grade last week before writing next week',
        dueDate: '2026-08-24',
        startTime: '08:00',
        endTime: '08:30',
        filePath: 'Focus/The Week Ahead.md'
      }],
      events: [{
        id: 'week-event',
        title: 'Week-ahead review',
        date: '2026-08-24',
        startTime: '08:00',
        endTime: '08:30',
        filePath: 'Focus/The Week Ahead.md'
      }],
      providerOpen: opened
    })
    patchTimeControl({ view: 'month', cursor: '2026-08-01', selectedDate: null })
    flushTimeControl()
    render(React.createElement(Calendar))

    const task = await screen.findByRole('button', { name: /Grade last week before writing next week/ })
    expect(screen.queryByText('Week-ahead review')).not.toBeInTheDocument()
    fireEvent.click(task)
    await waitFor(() => expect(opened).toHaveBeenCalledWith('week-task'))
  })

  it('reveals the local event instead when the matching contributed source is hidden', async () => {
    mock = setupCalendarApi({
      todos: [{
        id: 'week-task',
        title: 'Grade last week before writing next week',
        dueDate: '2026-08-24',
        startTime: '08:00',
        endTime: '08:30',
        filePath: 'Focus/The Week Ahead.md'
      }],
      events: [{
        id: 'week-event',
        title: 'Week-ahead review',
        date: '2026-08-24',
        startTime: '08:00',
        endTime: '08:30',
        filePath: 'Focus/The Week Ahead.md'
      }],
      settings: { hiddenSources: ['calendar:plugin:todo'] }
    })
    patchTimeControl({ view: 'month', cursor: '2026-08-01', selectedDate: null })
    flushTimeControl()
    render(React.createElement(Calendar))

    expect(await screen.findByRole('button', { name: /Week-ahead review/ })).toBeInTheDocument()
    expect(screen.queryByText('Grade last week before writing next week')).not.toBeInTheDocument()
  })

  it('opens a normal sourced-item click in Calendar Agenda when configured', async () => {
    const opened = vi.fn()
    mock = setupCalendarApi({
      todos: [{ id: 'owned', title: 'Owned task', dueDate: '2026-06-08' }],
      providerOpen: opened,
      settings: { itemClickTarget: 'agenda' }
    })
    patchTimeControl({ view: 'month', cursor: '2026-06-01', selectedDate: '2026-06-08' })
    flushTimeControl()
    const { container } = render(React.createElement(React.Fragment, null,
      React.createElement(Calendar),
      React.createElement(AgendaPanel)
    ))

    await waitFor(() => expect(container.querySelector('.calendar-chip[data-calendar-item-id="owned"]')).toBeTruthy())
    const chip = container.querySelector<HTMLElement>('.calendar-chip[data-calendar-item-id="owned"]')!
    fireEvent.click(chip)
    await waitFor(() => expect(mock.api.workspace.revealOwnPanel).toHaveBeenCalledWith('left_sidebar'))
    expect(opened).not.toHaveBeenCalled()
    expect((await readTimeControl()).selectedDate).toBe('2026-06-08')
    expect(chip).not.toHaveClass('calendar-reveal-target')
    await waitFor(() => expect(
      container.querySelector('.agenda-card[data-calendar-item-id="owned"]')
    ).toHaveClass('calendar-reveal-target'))
  })

  it('opens a sourced item in its owning plugin by default', async () => {
    const opened = vi.fn()
    mock = setupCalendarApi({
      todos: [{ id: 'owned', title: 'Owned task', dueDate: '2026-06-08' }],
      providerOpen: opened
    })
    patchTimeControl({ view: 'month', cursor: '2026-06-01', selectedDate: null })
    flushTimeControl()
    render(React.createElement(Calendar))

    fireEvent.click(await screen.findByRole('button', { name: /Owned task/ }))
    await waitFor(() => expect(opened).toHaveBeenCalledWith('owned'))
    expect(revealTargetStore().get()).toBeNull()
    expect(mock.api.workspace.revealOwnPanel).toHaveBeenCalledWith('left_sidebar')
  })

  it('falls back to Calendar Agenda when the owning provider cannot open', async () => {
    mock = setupCalendarApi({
      todos: [{ id: 'owned', title: 'Owned task', dueDate: '2026-06-08' }]
    })
    patchTimeControl({ view: 'month', cursor: '2026-06-01', selectedDate: null })
    flushTimeControl()
    const { container } = render(React.createElement(React.Fragment, null,
      React.createElement(Calendar),
      React.createElement(AgendaPanel)
    ))

    await waitFor(() => expect(container.querySelector('.calendar-chip[data-calendar-item-id="owned"]')).toBeTruthy())
    const chip = container.querySelector<HTMLElement>('.calendar-chip[data-calendar-item-id="owned"]')!
    fireEvent.click(chip)
    await waitFor(() => expect(mock.api.workspace.revealOwnPanel).toHaveBeenCalledWith('left_sidebar'))
    expect(chip).not.toHaveClass('calendar-reveal-target')
    await waitFor(() => expect(
      container.querySelector('.agenda-card[data-calendar-item-id="owned"]')
    ).toHaveClass('calendar-reveal-target'))
  })

  it('keeps the explicit Open in To-Do context-menu action', async () => {
    const opened = vi.fn()
    mock = setupCalendarApi({
      todos: [{ id: 'owned', title: 'Owned task', dueDate: '2026-06-08' }],
      providerOpen: opened
    })
    patchTimeControl({ view: 'month', cursor: '2026-06-01', selectedDate: '2026-06-08' })
    flushTimeControl()
    render(React.createElement(Calendar))

    fireEvent.contextMenu(await screen.findByRole('button', { name: /Owned task/ }))
    await waitFor(() => expect(mock.menus.at(-1)?.map((item) => item.label)).toContain('Open in To-Do'))
    const openInTodo = mock.menus.at(-1)?.find((item) => item.label === 'Open in To-Do')
    expect(openInTodo?.icon).toBeTruthy()
    await act(async () => { await openInTodo?.onSelect?.() })

    expect(opened).toHaveBeenCalledWith('owned')
    expect(mock.api.workspace.revealOwnPanel).toHaveBeenCalledWith('left_sidebar')
  })
})

describe('AgendaPanel item clicks', () => {
  let mock: MockValleyApi
  let providerOpen: ReturnType<typeof vi.fn>
  beforeEach(() => {
    providerOpen = vi.fn()
    mock = setupCalendarApi({
      todos: [
        {
          id: 'todo-agenda',
          title: 'Agenda todo',
          completed: false,
          dueDate: '2026-06-08',
          startTime: '09:00',
          endTime: '10:00',
          filePath: 'Notes/Todo.md'
        } as DataRecord
      ],
      events: [
        {
          id: 'event-agenda',
          title: 'Agenda event',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
          date: '2026-07-12',
          startTime: '14:30',
          endTime: '15:15',
          filePath: 'Notes/Event.md'
        } as DataRecord
      ],
      providerOpen
    })
    patchTimeControl({
      view: 'month',
      cursor: '2026-06-01',
      selectedDate: null,
      rangeStart: null,
      rangeEnd: null,
      selectedTime: null
    })
    flushTimeControl()
  })

  it('keeps source, group, and note-date header filters icon-only', async () => {
    await act(async () => render(React.createElement(AgendaPanel)))

    const sources = await screen.findByRole('button', { name: 'Sources' })
    for (const label of ['Sources', 'Groups', 'Note dates']) {
      const button = screen.getByRole('button', { name: label })
      expect(button.textContent).toBe('')
      expect(button.querySelector('svg')).toBeInTheDocument()
      expect(button).toHaveAttribute('title', label)
    }
    expect(sources).not.toHaveClass('active')
    await act(async () => fireEvent.click(sources))
    expect(mock.popovers).toHaveLength(1)
    let popover: ReturnType<typeof render>
    await act(async () => { popover = render(React.createElement(React.Fragment, null, mock.popovers[0].node)) })
    const sourceRows = [...popover!.container.querySelectorAll<HTMLButtonElement>('.calendar-filter-option')]
    expect(sourceRows.map((row) => row.querySelector('.calendar-filter-option-label')?.textContent)).toEqual(['Events', 'Note dates', 'To-Do'])
    expect(sourceRows.map((row) => row.querySelector('.calendar-filter-option-count')?.textContent)).toEqual(['1', '0', '1'])
    expect(screen.getByRole('button', { name: /Deselect all/ })).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /To-Do/ })))
    expect(mock.driverCalls).toContainEqual({
      driver: 'settings',
      method: 'updatePluginSettings',
      payload: { pluginId: 'calendar', key: 'hiddenSources', value: ['calendar:plugin:todo'] }
    })
    await waitFor(() => expect(sources).toHaveClass('active'))
    expect(sources.textContent).toBe('')
  })

  it('filters individual note-date sources from the Agenda header', async () => {
    mock = setupCalendarApi({
      indexEntries: [
        { relPath: 'Contacts/Fern.md', title: 'Fern', kind: 'note', frontmatter: { type: 'contact', birthdate: '1990-05-04' }, mtimeMs: 0 },
        { relPath: 'Projects/Canopy.md', title: 'Canopy', kind: 'note', frontmatter: { type: 'project', due: '2026-06-08' }, mtimeMs: 0 }
      ],
      noteDateSources: [
        { id: 'birthdays', title: 'Birthdays', matchKey: 'type', matchValue: 'contact', dateField: 'birthdate', match: 'day-month', showCount: true, labelMode: 'filename', showFields: [], color: 'palette:blue', icon: 'cake', visible: true, hidden: false },
        { id: 'deadlines', title: 'Deadlines', matchKey: 'type', matchValue: 'project', dateField: 'due', match: 'exact', showCount: false, labelMode: 'filename', showFields: [], color: 'palette:orange', icon: 'flag', visible: false, hidden: false }
      ]
    })
    await act(async () => render(React.createElement(AgendaPanel)))

    const button = await screen.findByRole('button', { name: 'Note dates' })
    expect(button.textContent).toBe('')
    expect(button).toHaveClass('active')
    expect(button.querySelector('.calendar-filter-icon path')).toHaveAttribute('d', 'M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4zm3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1')
    await act(async () => fireEvent.click(button))
    let popover: ReturnType<typeof render>
    await act(async () => { popover = render(React.createElement(React.Fragment, null, mock.popovers.at(-1)?.node)) })
    const rows = [...popover!.container.querySelectorAll<HTMLButtonElement>('.calendar-filter-option')]
    expect(rows.map((row) => row.querySelector('.calendar-filter-option-label')?.textContent)).toEqual(['Birthdays', 'Deadlines'])
    expect(rows.map((row) => row.querySelector('.calendar-filter-option-count')?.textContent)).toEqual(['1', '1'])
    expect(rows.map((row) => row.getAttribute('aria-pressed'))).toEqual(['true', 'false'])

    await act(async () => fireEvent.click(rows[1]))
    await waitFor(() => expect(mock.datasets.get('calendar.note_date_sources')?.find((row) => row.id === 'deadlines')?.definition).toMatchObject({ visible: true }))
    expect(button.textContent).toBe('')
    expect(button).not.toHaveClass('active')
  })

  it('uses only the completion control for contributed tasks in Agenda', async () => {
    const { container } = render(<AgendaPanel />)
    await screen.findByText('Agenda todo')
    const row = container.querySelector('.agenda-card[data-calendar-item-id="todo-agenda"]')!
    expect(row.querySelector('.agenda-card-icon')).toBeNull()
    expect(row.querySelector('.agenda-card-leading input[type=checkbox]')).toBeInTheDocument()
    expect(row.querySelector('.agenda-card-body > .agenda-card-title')).toHaveTextContent('Agenda todo')
  })

  it('searches Agenda titles and clears with Escape', async () => {
    render(React.createElement(AgendaPanel))
    await screen.findByText('Agenda todo')
    const search = screen.getByRole('textbox', { name: 'Search agenda' })

    fireEvent.change(search, { target: { value: 'todo' } })
    expect(screen.getByText('Agenda todo')).toBeInTheDocument()
    expect(screen.queryByText('Agenda event')).not.toBeInTheDocument()

    await act(async () => fireEvent.keyDown(search, { key: 'Escape' }))
    expect(screen.getByText('Agenda event')).toBeInTheDocument()
  })

  it('merges adjacent Calendar group selections into independent rounded runs', async () => {
    mock = setupCalendarApi({
      groups: [
        { id: 'apple', name: 'Apple', color: 'palette:gray' },
        { id: 'next', name: 'Next', color: 'palette:purple' },
        { id: 'pixar', name: 'Pixar', color: 'palette:orange' },
        { id: 'design', name: 'Design', color: 'palette:cyan' },
        { id: 'focus', name: 'Focus', color: 'palette:green' }
      ]
    })
    await act(async () => render(React.createElement(AgendaPanel)))

    await act(async () => fireEvent.click(await screen.findByRole('button', { name: /Groups/ })))
    await act(async () => render(React.createElement(React.Fragment, null, mock.popovers.at(-1)?.node)))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Pixar/ })))

    const apple = screen.getByRole('button', { name: /^Apple/ })
    const next = screen.getByRole('button', { name: /^Next/ })
    const pixar = screen.getByRole('button', { name: /^Pixar/ })
    const design = screen.getByRole('button', { name: /^Design/ })
    const focus = screen.getByRole('button', { name: /^Focus/ })
    expect(apple).toHaveClass('active', 'selection-run-start')
    expect(apple).not.toHaveClass('selection-run-end')
    expect(next).toHaveClass('active', 'selection-run-end')
    expect(next).not.toHaveClass('selection-run-start')
    expect(pixar).not.toHaveClass('active', 'selection-run-start', 'selection-run-end')
    expect(design).toHaveClass('active', 'selection-run-start')
    expect(design).not.toHaveClass('selection-run-end')
    expect(focus).toHaveClass('active', 'selection-run-end')
    expect(focus).not.toHaveClass('selection-run-start')

    const disposeStyles = injectCalendarStyles()
    const css = document.getElementById('notes-calendar-styles')?.textContent ?? ''
    expect(css).toContain('.calendar-filter-option.active:hover {\n  background: color-mix(in srgb, var(--title-color) 14%, transparent);')
    expect(css).toContain('.calendar-filter-option.active:has(+ .calendar-filter-option:hover)')
    expect(css).toContain('.calendar-filter-option:hover + .calendar-filter-option.active')
    disposeStyles()
  })

  it('orders dated sections newest to oldest', async () => {
    const { container } = render(React.createElement(AgendaPanel))
    await screen.findByText('Agenda event')
    expect([...container.querySelectorAll('.agenda-card-title')].map((node) => node.textContent)).toEqual([
      'Agenda event',
      'Agenda todo'
    ])
  })

  it('reveals a sourced item in Calendar with its date and time through asynchronous host updates', async () => {
    const patch = timeApi.patchTimeControl.bind(timeApi)
    vi.spyOn(timeApi, 'patchTimeControl').mockImplementation(value => Promise.resolve().then(() => patch(value)) as unknown as TimeControlState)
    const { container } = render(<AgendaPanel />)
    const title = await screen.findByText('Agenda todo')
    fireEvent.click(title.closest('.agenda-card')!)
    await waitFor(() => expect(mock.api.workspace.openMainTab).toHaveBeenCalled())
    expect(await readTimeControl()).toMatchObject({ selectedDate: '2026-06-08', selectedTime: '09:00' })
    expect(revealTargetStore().get()).toMatchObject({ surface: 'main', itemId: 'todo-agenda', date: '2026-06-08' })
    expect(mock.popovers).toHaveLength(0)
    expect(providerOpen).not.toHaveBeenCalled()
    expect(container.querySelector('.calendar-reveal-target')).toBeNull()
  })

  it('reveals an event from its whole row with the keyboard', async () => {
    render(<AgendaPanel />)
    const title = await screen.findByText('Agenda event')
    fireEvent.keyDown(title.closest('.agenda-card')!, { key: 'Enter' })
    await waitFor(() => expect(mock.api.workspace.openMainTab).toHaveBeenCalled())
    expect((await readTimeControl()).selectedDate).toBe('2026-07-12')
    expect(revealTargetStore().get()).toMatchObject({ surface: 'main', itemId: 'event-agenda' })
    expect(mock.popovers).toHaveLength(0)
  })

  it('routes Edit to the owning plugin and offers both explicit destinations', async () => {
    const edit = vi.fn()
    mock = setupCalendarApi({ todos: [{ id: 'owned', title: 'Fern task', dueDate: '2026-06-08' }], providerEdit: edit, providerOpen })
    render(<AgendaPanel />)
    fireEvent.contextMenu(await screen.findByText('Fern task'))
    await waitFor(() => expect(mock.menus.at(-1)?.map(entry => entry.label)).toEqual(['Edit', 'Open in Calendar', 'Open in To-Do']))
    const menu = mock.menus.at(-1)!
    await act(async () => { await menu[0].onSelect?.() })
    expect(edit).toHaveBeenCalledWith('owned')
    expect(mock.popovers).toHaveLength(0)
    await act(async () => { await menu[1].onSelect?.() })
    expect(revealTargetStore().get()).toMatchObject({ surface: 'main', itemId: 'owned' })
    await act(async () => { await menu[2].onSelect?.() })
    expect(providerOpen).toHaveBeenCalledWith('owned')
  })

  it('edits Agenda events in a compact popover without opening a main tab or Properties', async () => {
    render(React.createElement(AgendaPanel))

    const title = await screen.findByText('Agenda event')
    fireEvent.click(title)
    fireEvent.doubleClick(title)

    expect(screen.getByRole('dialog', { name: 'What to add' })).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Agenda event')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveAttribute('data-modal-initial-focus', 'true')
    expect(mock.api.workspace.showProperties).not.toHaveBeenCalled()
    expect(mock.api.workspace.openMainTab).not.toHaveBeenCalled()
    expect(mock.api.workspace.revealOwnPanel).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Updated agenda event' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Updated agenda event')).toBeInTheDocument()
  })

  it('offers the note behind a right-click instead', async () => {
    render(React.createElement(AgendaPanel))

    fireEvent.contextMenu(await screen.findByText('Agenda event'))

    await waitFor(() => expect(mock.menus).not.toHaveLength(0))
    const openNote = mock.menus.at(-1)?.find((entry) => entry.id === 'open-note')
    expect(openNote).toBeTruthy()
    await act(async () => {
      await openNote?.onSelect?.()
    })
    expect(mock.api.workspace.openFile).toHaveBeenCalledWith('Notes/Event.md')
  })
})

describe('Calendar wheel navigation', () => {
  beforeEach(() => {
    setupCalendarApi()
    patchTimeControl({
      view: 'week',
      cursor: '2026-07-01',
      selectedDate: '2026-07-20',
      rangeStart: null,
      rangeEnd: null,
      selectedTime: null
    })
    flushTimeControl()
  })

  it('keeps one trackpad swipe burst to one week step', async () => {
    vi.useFakeTimers()
    const { container } = render(React.createElement(Calendar))
    await act(async () => {})
    const stage = container.querySelector('.calendar-stage') as HTMLElement

    expect(screen.getByRole('heading', { name: /W30\s+2026/i })).toBeInTheDocument()

    fireEvent.wheel(stage, { deltaX: -70, deltaY: 0 })
    expect(screen.getByRole('heading', { name: /W29\s+2026/i })).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(20) })
    fireEvent.wheel(stage, { deltaX: -20, deltaY: 40 })
    act(() => { vi.advanceTimersByTime(20) })
    fireEvent.wheel(stage, { deltaX: -80, deltaY: 0 })

    expect(screen.getByRole('heading', { name: /W29\s+2026/i })).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(SWIPE_IDLE_MS + 10) })
    fireEvent.wheel(stage, { deltaX: -70, deltaY: 0 })

    expect(screen.getByRole('heading', { name: /W28\s+2026/i })).toBeInTheDocument()
  })

  it('accepts a fast second month swipe without waiting for the first momentum tail to end', async () => {
    vi.useFakeTimers()
    patchTimeControl({
      view: 'month',
      cursor: '2026-07-01',
      selectedDate: '2026-07-20',
      rangeStart: null,
      rangeEnd: null,
      selectedTime: null
    })
    flushTimeControl()
    const { container } = render(React.createElement(Calendar))
    await act(async () => {})
    const stage = container.querySelector('.calendar-stage') as HTMLElement

    expect(screen.getByRole('heading', { name: /Jul\s+2026/i })).toBeInTheDocument()

    fireEvent.wheel(stage, { deltaX: -90, deltaY: 0 })
    expect(screen.getByRole('heading', { name: /Jun\s+2026/i })).toBeInTheDocument()

    for (const d of [-60, -32, -14]) fireEvent.wheel(stage, { deltaX: d, deltaY: 0 })
    fireEvent.wheel(stage, { deltaX: -20, deltaY: 0 })
    expect(screen.getByRole('heading', { name: /Jun\s+2026/i })).toBeInTheDocument()

    fireEvent.wheel(stage, { deltaX: -50, deltaY: 0 })
    expect(screen.getByRole('heading', { name: /May\s+2026/i })).toBeInTheDocument()
  })
})

describe('Note dates on the calendar', () => {
  const specimen = (relPath: string, frontmatter: Record<string, unknown>): IndexEntry => ({
    relPath,
    title: relPath.replace(/^.*\//, '').replace(/\.md$/, ''),
    kind: 'note',
    frontmatter,
    mtimeMs: 0
  })

  const setup = (source: Partial<DataRecord> = {}, view: 'month' | 'week' = 'month'): MockValleyApi => {
    const mock = setupCalendarApi({
      indexEntries: [
        specimen('Biodiversity/Fern.md', {
          type: 'species',
          observed: '1990-05-04',
          reading: 'forest-radio'
        })
      ],
      noteDateSources: [
          {
            id: 'b1',
            title: 'Emergence dates',
            matchKey: 'type',
            matchValue: 'species',
            dateField: 'observed',
            match: 'day-month',
            showCount: true,
            showFields: ['reading'],
            icon: 'cake',
            ...source
          } as DataRecord
        ]
    })
    patchTimeControl({
      view,
      cursor: '2026-05-01',
      selectedDate: '2026-05-04',
      rangeStart: null,
      rangeEnd: null,
      selectedTime: null
    })
    flushTimeControl()
    return mock
  }

  it('renders a yearly note date as a read-only chip and selects it without opening its note', async () => {
    const mock = setup()
    const { container } = render(React.createElement(CalendarPage))
    const chip = await screen.findByRole('button', { name: /Fern \(36\)/ })

    expect(chip).toHaveClass('calendar-chip')
    expect(chip.getAttribute('title')).toContain('reading: forest-radio')
    expect(container.querySelector('.calendar-chip-glyph')).toBeInTheDocument()

    fireEvent.click(chip)
    expect(chip).toHaveClass('selected')
    expect(mock.api.workspace.openFile).not.toHaveBeenCalled()
  })

  it('paints the source colour, and falls back to the neutral precedence without one', async () => {
    setup({ color: '#ec4899' })
    const { container } = render(React.createElement(CalendarPage))
    await screen.findByRole('button', { name: /Fern \(36\)/ })
    const chip = container.querySelector('.calendar-chip') as HTMLElement
    expect(chip.style.getPropertyValue('--chip-color')).toBe('#ec4899')

    cleanup()
    setup({ color: undefined })
    const bare = render(React.createElement(CalendarPage))
    await screen.findByRole('button', { name: /Fern \(36\)/ })
    const plain = bare.container.querySelector('.calendar-chip') as HTMLElement
    expect(plain.style.getPropertyValue('--chip-color')).not.toBe('#ec4899')
  })

  // The month grid routes right-click to the day cell; the week all-day strip is
  // where an item's own menu opens. The mock's openMenu is a plain function, so
  // capture the items it is handed.
  it('keeps metadata out of the note-date action menu', async () => {
    const mock = setup({}, 'week')
    const menus: UiMenuItem[][] = []
    mock.api.ui.openMenu = (async (items: UiMenuItem[]) => {
      menus.push(items)
      return null
    }) as unknown as typeof mock.api.ui.openMenu
    render(React.createElement(CalendarPage))
    const chip = await screen.findByRole('button', { name: /Fern \(36\)/ })

    fireEvent.contextMenu(chip)
    await waitFor(() => expect(menus.length).toBe(1))
    const menu = menus[0]
    expect(menu.some((m) => m.onSelect && /delete/i.test(m.label ?? ''))).toBe(false)
    expect(menu.some((m) => m.label === 'reading')).toBe(false)
    expect(menu.filter(item => item.type !== 'separator').every(item => item.icon)).toBe(true)
    const open = menu.find((m) => m.label === 'Open note')
    expect(open).toBeTruthy()
    open?.onSelect?.()
    expect(mock.api.workspace.openFile).toHaveBeenCalledWith('Biodiversity/Fern.md')
  })

  it('lists the entry in the agenda panel, in its own day section', async () => {
    setup()
    const { container } = render(React.createElement(AgendaPanel))
    await waitFor(() => expect(container.querySelector('.agenda-card')).toBeInTheDocument())
    expect(container.querySelector('.agenda-card-title')?.textContent).toContain('Fern')
    // The separate "Upcoming" block is gone — a note date is an agenda row like
    // any other, so it is never listed twice.
    expect(container.querySelector('.agenda-upcoming')).not.toBeInTheDocument()
  })

  it('drops note dates from every surface when the sources filter switches them off', async () => {
    const mock = setup()
    const { container } = render(React.createElement(AgendaPanel))
    await waitFor(() => expect(container.querySelector('.agenda-card')).toBeInTheDocument())

    await act(async () => {
      mock.api.settings.set('hiddenSources', ['calendar:noteDates'])
      // The host broadcasts this after a settings write; the mock does not.
      window.dispatchEvent(new Event('valley:plugin-settings-changed'))
    })

    await waitFor(() => expect(container.querySelector('.agenda-card')).not.toBeInTheDocument())
    // Persisted, so the choice survives a remount and a restart.
    expect(mock.driverCalls).toContainEqual({
      driver: 'settings',
      method: 'updatePluginSettings',
      payload: { pluginId: 'calendar', key: 'hiddenSources', value: ['calendar:noteDates'] }
    })
  })

  it('drops the entries entirely when the source is hidden', async () => {
    setup({ hidden: true })
    const { container } = render(React.createElement(CalendarPage))
    await screen.findByRole('heading', { name: /May\s+2026/i })
    expect(container.querySelector('.calendar-chip')).not.toBeInTheDocument()
  })
})

describe('Note dates settings section', () => {
  it('renders the source editor for the "dates" section and adds a prefilled source', async () => {
    const mock = setupCalendarApi()
    render(React.createElement(CalendarSettings, { section: 'dates' }))

    const add = await screen.findByRole('button', { name: /Add source/i })
    expect(CALENDAR_PLUGIN_CONFIG.settingsSections).toContainEqual(
      expect.objectContaining({
        id: 'dates'
      })
    )
    expect(CALENDAR_PLUGIN_CONFIG.datasets).toContainEqual(
      expect.objectContaining({ id: 'note_date_sources', store: 'durable' })
    )

    // Add offers the presets first; "Blank source" is the old behaviour.
    await act(async () => {
      fireEvent.click(add)
    })
    const menu = mock.menus.at(-1) ?? []
    expect(menu.map((entry) => entry.id)).toEqual([
      'birthdays',
      'anniversaries',
      'deadlines',
      undefined,
      'blank'
    ])
    await act(async () => {
      await menu.find((entry) => entry.id === 'blank')?.onSelect?.()
    })

    // Prefilled defaults land in the row and are persisted to the durable dataset.
    expect(await screen.findByDisplayValue('type')).toBeInTheDocument()
    expect(screen.getByDisplayValue('date')).toBeInTheDocument()
    await waitFor(() => {
      const written = mock.datasets.get('calendar.note_date_sources') ?? []
      expect(written).toHaveLength(1)
      expect(written[0].definition).toMatchObject({ matchKey: 'type', dateField: 'date', match: 'exact' })
    })
  })

  it('adds the Birthdays preset already configured for contact notes', async () => {
    const mock = setupCalendarApi()
    render(React.createElement(CalendarSettings, { section: 'dates' }))

    const add = await screen.findByRole('button', { name: /Add source/i })
    await act(async () => {
      fireEvent.click(add)
    })
    await act(async () => {
      await mock.menus.at(-1)?.find((entry) => entry.id === 'birthdays')?.onSelect?.()
    })

    await waitFor(() => {
      const written = mock.datasets.get('calendar.note_date_sources') ?? []
      expect(written).toHaveLength(1)
      expect(written[0].definition).toMatchObject({
        title: 'Birthdays',
        matchKey: 'type',
        matchValue: 'contact',
        dateField: 'birthdate',
        match: 'day-month',
        showCount: true,
        icon: 'cake'
      })
    })
  })

  it('reports what each rule finds, and warns when it finds nothing', async () => {
    const specimen = (relPath: string, frontmatter: Record<string, unknown>): IndexEntry => ({
      relPath,
      title: relPath.replace(/\.md$/, ''),
      kind: 'note',
      frontmatter,
      mtimeMs: 0
    })
    const rule = (over: Partial<DataRecord>): DataRecord =>
      ({
        id: 'b1',
        title: 'Emergence dates',
        matchKey: 'type',
        dateField: 'observed',
        match: 'day-month',
        ...over
      }) as DataRecord

    const setupRule = (over: Partial<DataRecord>): void => {
      setupCalendarApi({
        indexEntries: [
          specimen('Biodiversity/Fern.md', { type: 'species', observed: '1990-05-04' }),
          specimen('Biodiversity/Lichen.md', { type: 'species' })
        ],
        noteDateSources: [rule(over)]
      })
    }

    setupRule({ matchValue: 'species' })
    const { container } = render(React.createElement(CalendarSettings, { section: 'dates' }))
    const stats = await waitFor(() => {
      const el = container.querySelector('.notedate-source-stats')
      expect(el).toBeInTheDocument()
      return el as HTMLElement
    })
    expect(stats.textContent).toBe('2 notes match · 1 with a usable date')
    expect(stats).not.toHaveClass('warn')

    // The exact live-vault failure: a plural value nothing in the vault uses.
    cleanup()
    setupRule({ matchValue: 'animals' })
    const missed = render(React.createElement(CalendarSettings, { section: 'dates' }))
    const warn = await waitFor(() => {
      const el = missed.container.querySelector('.notedate-source-stats')
      expect(el).toBeInTheDocument()
      return el as HTMLElement
    })
    expect(warn.textContent).toBe('No notes match type: animals')
    expect(warn).toHaveClass('warn')

    // Matching notes, but the date property does not exist on them.
    cleanup()
    setupRule({ matchValue: 'species', dateField: 'date' })
    const undated = render(React.createElement(CalendarSettings, { section: 'dates' }))
    await waitFor(() => {
      expect(undated.container.querySelector('.notedate-source-stats')?.textContent).toBe(
        '2 notes match · none has a usable date'
      )
    })
  })

  it('shows and persists the optional end only for recurring sources', async () => {
    const repeating = setupCalendarApi({
      noteDateSources: [{
          id: 'b1',
          title: 'Emergence dates',
          matchKey: 'type',
          matchValue: 'species',
          dateField: 'observed',
          match: 'day-month'
        }]
    })
    render(React.createElement(CalendarSettings, { section: 'dates' }))

    const end = await screen.findByRole('spinbutton', { name: 'Recurring date range in years' })
    expect(end).toHaveValue(null)
    fireEvent.change(end, { target: { value: '4' } })
    fireEvent.blur(end)
    await waitFor(() => {
      expect(repeating.datasets.get('calendar.note_date_sources')?.[0]?.definition).toMatchObject({ recurrenceLimitYears: 4 })
    })

    fireEvent.change(end, { target: { value: '' } })
    fireEvent.blur(end)
    await waitFor(() => {
      const definition = repeating.datasets.get('calendar.note_date_sources')?.[0]?.definition as DataRecord | undefined
      expect(definition?.recurrenceLimitYears).toBeUndefined()
    })

    cleanup()
    setupCalendarApi({
      noteDateSources: [{
          id: 'once',
          title: 'Deadline',
          matchKey: 'type',
          matchValue: 'task',
          dateField: 'due',
          match: 'exact'
        }]
    })
    render(React.createElement(CalendarSettings, { section: 'dates' }))
    await screen.findByDisplayValue('Deadline')
    expect(screen.queryByRole('spinbutton', { name: 'Recurring date range in years' })).not.toBeInTheDocument()
  })

  it('keeps the plain Calendar pane on the default section', async () => {
    setupCalendarApi()
    render(React.createElement(CalendarSettings, {}))
    expect(screen.queryByRole('button', { name: /Add source/i })).not.toBeInTheDocument()
  })
})

describe('grid hour window', () => {
  const at = (startTime?: string, endTime?: string): CalItem =>
    ({ kind: 'event', id: `i-${startTime ?? 'all'}`, title: 't', date: '2026-08-14', startTime, endTime })

  it('opens on the configured day, when everything fits inside it', () => {
    expect(gridHourWindow([at('09:00', '10:00')], 7, 22)).toEqual({ startHour: 7, endHour: 22 })
  })

  it('reaches up for an item that starts before the day does', () => {
    // Otherwise a 06:30 stand-up is simply invisible, with nothing on screen
    // saying anything was missed.
    expect(gridHourWindow([at('06:30', '07:15')], 7, 22)).toEqual({ startHour: 6, endHour: 22 })
  })

  it('reaches down for an item that ends after the day does', () => {
    expect(gridHourWindow([at('23:00', '23:30')], 7, 22)).toEqual({ startHour: 7, endHour: 24 })
  })

  it('covers an item with no end time by its starting hour', () => {
    expect(gridHourWindow([at('23:30')], 7, 22)).toEqual({ startHour: 7, endHour: 24 })
  })

  it('ignores all-day items, which never sit in the time grid', () => {
    expect(gridHourWindow([at(undefined)], 7, 22)).toEqual({ startHour: 7, endHour: 22 })
  })

  it('never inverts, even when the stored hours are nonsense', () => {
    const { startHour, endHour } = gridHourWindow([], 20, 3)
    expect(endHour).toBeGreaterThan(startHour)
  })
})

describe('note date presets', () => {
  it('builds the Birthdays source the settings screenshot describes', () => {
    expect(presetNoteDateSource('birthdays', [])).toMatchObject({
      title: 'Birthdays',
      matchKey: 'type',
      matchValue: 'contact',
      dateField: 'birthdate',
      match: 'day-month',
      showCount: true,
      icon: 'cake'
    })
  })

  it('picks a colour the existing sources are not already using', () => {
    const first = presetNoteDateSource('birthdays', [])
    const second = presetNoteDateSource('anniversaries', [first])
    expect(second.color).not.toBe(first.color)
  })

  it('falls back to a blank source for an id it does not know', () => {
    expect(presetNoteDateSource('nope', []).matchValue).toBe('')
  })
})

describe('Calendar without account integration', () => {
  it('declares no sync page, remote documents or account/network access', async () => {
    expect(CALENDAR_PLUGIN_CONFIG.settingsSections.some(section => section.id === 'sync')).toBe(false)
    expect(CALENDAR_PLUGIN_CONFIG.noteDocuments.some(source => source.id === 'remote_events')).toBe(false)
    expect(CALENDAR_PLUGIN_CONFIG).not.toHaveProperty('permissions.accounts')
    expect(CALENDAR_PLUGIN_CONFIG).not.toHaveProperty('permissions.network')
    const mock = setupCalendarApi()
    await act(async () => render(React.createElement(CalendarSettings)))
    expect(screen.queryByText('Synced calendars')).not.toBeInTheDocument()
    expect(mock.api.backend.call).not.toHaveBeenCalled()
  })
})

describe('Calendar item destination setting', () => {
  it('defaults to the owning plugin and persists the Calendar Agenda choice', async () => {
    const mock = setupCalendarApi()
    await act(async () => render(React.createElement(CalendarSettings, {})))

    const field = await screen.findByRole('combobox', { name: 'Open items in' })
    expect(field).toHaveValue('owner')
    expect(field).toHaveTextContent('Owning plugin')
    expect(field).toHaveTextContent('Calendar Agenda')

    await act(async () => fireEvent.change(field, { target: { value: 'agenda' } }))
    expect(mock.driverCalls).toContainEqual({
      driver: 'settings',
      method: 'updatePluginSettings',
      payload: { pluginId: 'calendar', key: 'itemClickTarget', value: 'agenda' }
    })
  })
})

describe('Calendar plugin integrations section', () => {
  it('uses the shared Plugins glyph and Calendar-only top spacing', async () => {
    setupCalendarApi()
    const { container } = render(React.createElement(CalendarSettings, { section: 'plugins' }))

    expect(CALENDAR_PLUGIN_CONFIG.settingsSections).toContainEqual(
      expect.objectContaining({ id: 'plugins', icon: 'blocks' })
    )
    expect(container.querySelector('.calendar-plugins-settings')).toBeInTheDocument()

    const disposeStyles = injectCalendarStyles()
    const css = document.getElementById('notes-calendar-styles')?.textContent ?? ''
    expect(container.querySelector('.calendar-source-intro')).toHaveTextContent('Choose which plugin items appear in Calendar.')
    expect(css).toContain('.calendar-plugins-settings .settings-plugin-list')
    disposeStyles()
  })

  it('discovers a provider registered while the settings view subscribes', async () => {
    const mock = createMockValleyApi({
      manifest: {
        id: 'calendar',
      indexState: 'scoped',
        datasets: CALENDAR_PLUGIN_CONFIG.datasets as unknown as ValleyPluginManifest['datasets']
      }
    })
    const subscribe = mock.api.interop.services.subscribe
    let registered = false
    mock.api.interop.services.subscribe = vi.fn((contract, listener) => {
      if (contract.id === CALENDAR_ITEM_SOURCE_V2.id && !registered) {
        registered = true
        mock.provideInterop(CALENDAR_ITEM_SOURCE_V2, {
          integration: {
            name: 'To-Do',
            version: '2.0.0',
            author: 'Cedar Lab',
            description: 'Structured task manager.'
          },
          list: pagedSource(async () => [])
        }, 'todo')
      }
      return subscribe(contract, listener)
    })
  initRuntime(mock.api)

    render(React.createElement(CalendarSettings, { section: 'plugins' }))

    expect(await screen.findByText('To-Do')).toBeInTheDocument()
  })

  it('lists a zero-item provider and delegates visibility and configuration', async () => {
    const mock = setupCalendarApi()
    render(React.createElement(CalendarSettings, { section: 'plugins' }))

    expect(await screen.findByText('To-Do')).toBeInTheDocument()
    expect(screen.getByText('Structured task manager.')).toBeInTheDocument()
    expect(screen.getByText(/2.0.0/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Disable To-Do in Calendar' }))
    expect(mock.driverCalls).toContainEqual({
      driver: 'settings',
      method: 'updatePluginSettings',
      payload: { pluginId: 'calendar', key: 'hiddenSources', value: ['calendar:plugin:todo'] }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Configure To-Do' }))
    await waitFor(() => expect(mock.api.workspace.openOwnSettings).toHaveBeenCalled())
  })

  it('discards stale runtime provider ids', async () => {
    setupCalendarApi({ settings: { hiddenSources: ['provider-17', 'calendar:plugin:todo'] } })
    render(React.createElement(CalendarSettings, { section: 'plugins' }))
    expect(await screen.findByRole('switch', { name: 'Enable To-Do in Calendar' })).not.toBeChecked()
  })
})

describe('Calendar automation and item restoration', () => {
  it('edits an explicit event and refuses stale edits and remote writes', async () => {
    const mock = setupCalendarApi({ events: [
      { id: 'local', title: 'Field work', date: '2026-09-01', updatedAt: 'revision-1' },
      { id: 'google:remote', title: 'Remote meeting', date: '2026-09-01', readOnly: true }
    ] })
    registerCalendarCommands(mock.api)
    expect((await mock.api.commands.execute('calendar:edit-fields', { id: 'local', values: { title: 'Updated field work' }, expectedUpdatedAt: 'stale' })).ok).toBe(false)
    expect((await mock.api.commands.execute('calendar:edit-fields', { id: 'google:remote', values: { title: 'Changed' } })).ok).toBe(false)
    const saved = await mock.api.commands.execute('calendar:edit-fields', { id: 'local', values: { title: 'Updated field work', startTime: '09:00', endTime: '10:00' }, expectedUpdatedAt: 'revision-1' })
    expect(saved.ok).toBe(true)
    expect(mock.datasets.get('calendar.events')?.find((row) => row.id === 'local')).toMatchObject({ title: 'Updated field work', startTime: '09:00', allDay: false })
    expect(mock.busUndo).toHaveLength(1)
  })

  it('restores item identity and leaves the current view intact when a target is missing', async () => {
    const mock = setupCalendarApi({ events: [{ id: 'local', title: 'Field work', date: '2026-09-01' }] })
    const provider = mock.api.interop.extensions.providers(PLUGIN_SURFACE_V1).find((entry) => entry.extension.surface === 'main_workspace')!.extension
    const state = { v: 1, view: 'month', cursor: '2026-09-01', selectedDate: '2026-09-01', itemId: 'local', kind: 'event' }
    await provider.restore(state)
    expect(provider.getSnapshot().item?.state.itemId).toBe('local')
    await expect(provider.restore({ ...state, itemId: 'missing' })).rejects.toThrow('no longer exists')
    expect(provider.getSnapshot().item?.state.itemId).toBe('local')
  })
})


describe('Calendar task completion', () => {
  it('changes completion without replacing the grid or navigating', async () => {
    const mock = setupCalendarApi({ todos: [{ id: 'fern', title: 'Observe fern', dueDate: '2026-06-04', completed: false }] })
    await act(async () => { await patchTimeControl({ view: 'month', cursor: '2026-06-01', selectedDate: '2026-06-04' }) })
    const { container } = render(React.createElement(Calendar))
    const checkbox = (await screen.findAllByRole('checkbox', { name: 'Complete Observe fern' }))[0]
    const grid = container.querySelector('.calendar-grid-wrap')!
    grid.scrollTop = 120
    const before = await readTimeControl()
    await act(async () => { fireEvent.click(checkbox) })
    await waitFor(() => expect(checkbox).toBeChecked())
    expect(container.querySelector('.calendar-grid-wrap')).toBe(grid)
    expect(grid.scrollTop).toBe(120)
    expect(await readTimeControl()).toEqual(before)
    expect(mock.api.workspace.openMainTab).not.toHaveBeenCalled()
  })
  it('blocks repeated clicks and restores the status when saving fails without navigating', async () => {
    let finish!: (value: boolean) => void
    const providerUpdate = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve }))
    const mock = setupCalendarApi({ todos: [{ id: 'fern', title: 'Observe fern', dueDate: '2026-06-04', completed: false }], providerUpdate })
    await act(async () => { await patchTimeControl({ view: 'month', cursor: '2026-06-01', selectedDate: '2026-06-04' }) })
    const { container } = render(React.createElement(Calendar))
    const checkbox = (await screen.findAllByRole('checkbox', { name: 'Complete Observe fern' }))[0]
    const grid = container.querySelector('.calendar-grid-wrap')!
    grid.scrollTop = 80
    const before = await readTimeControl()
    fireEvent.click(checkbox)
    await waitFor(() => expect(providerUpdate).toHaveBeenCalledTimes(1))
    fireEvent.click(checkbox)
    fireEvent.keyDown(checkbox, { key: 'Enter' })
    expect(providerUpdate).toHaveBeenCalledTimes(1)
    await act(async () => { finish(false) })
    await waitFor(() => expect(checkbox).not.toBeChecked())
    expect(screen.getByRole('alert')).toBeVisible()
    expect(checkbox).not.toBeDisabled()
    expect(container.querySelector('.calendar-grid-wrap')).toBe(grid)
    expect(grid.scrollTop).toBe(80)
    expect(await readTimeControl()).toEqual(before)
    expect(mock.api.workspace.openMainTab).not.toHaveBeenCalled()
  })

})


describe('native agenda Markdown', () => {
  it('keeps rendered content in the card and reuses it during scrolling', async () => {
    const mock = setupCalendarApi()
    const renderer = vi.spyOn(mock.api.markdown, 'render').mockResolvedValue('<p><a data-wikilink="Forest.md" href="#">Forest</a> <strong>Canopy</strong></p>')
    vi.spyOn(mock.api.workspace, 'resolveWikilink').mockResolvedValue('plugins/calendar/Forest.md')
    const view = render(<div className="agenda-card"><CalendarPreview value="[[Forest.md]] **Canopy**" /></div>)
    expect(await screen.findByText('Canopy')).toHaveProperty('tagName', 'STRONG')
    await act(async () => { fireEvent.click(screen.getByText('Forest')) })
    expect(mock.api.workspace.openFile).toHaveBeenCalledWith('plugins/calendar/Forest.md')
    fireEvent.scroll(view.container.firstElementChild!, { target: { scrollTop: 50 } })
    view.rerender(<div className="agenda-card"><CalendarPreview value="[[Forest.md]] **Canopy**" /></div>)
    expect(renderer).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector('.agenda-card > .agenda-card-note')).toBeInTheDocument()
  })
})

describe('compact draft dismissal', () => {
  it.each(['event', 'todo'].flatMap(kind => ['outside', 'Escape', 'Cancel'].map(method => ({ kind, method }))))('closes a modified $kind draft directly on $method', async ({ kind, method }) => {
    const mock = setupCalendarApi()
    const present = mock.api.ui.openPopover
    let canDismiss: (() => boolean | Promise<boolean>) | undefined
    mock.api.ui.openPopover = (render, target, options) => {
      canDismiss = options?.beforeDismiss
      return present(render, target, options)
    }
    const confirm = vi.spyOn(mock.api.ui, 'confirm')
    const close = vi.fn()
    const added = vi.fn()
    const props = { state: { date: '2026-09-28', kind }, groups: [], onClose: close, onAdded: added }
    const view = render(<QuickAdd {...props} />)
    await screen.findByRole('dialog')
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Uncommitted canopy survey' } })
    await act(async () => {
      if (method === 'outside') expect(await canDismiss?.()).toBe(true)
      else if (method === 'Escape') fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Escape' })
      else fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    expect(confirm).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
    expect(added).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mock.datasets.get('calendar.events')).toEqual([])
    view.unmount()
    render(<QuickAdd {...props} />)
    expect(await screen.findByLabelText('Title')).toHaveValue('')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })) })
  })

  it('keeps the editor open while a save is pending without opening a confirmation', async () => {
    let finishSave!: (saved: boolean) => void
    const providerUpdate = vi.fn(() => new Promise<boolean>(resolve => { finishSave = resolve }))
    const mock = setupCalendarApi({ providerUpdate, todos: [{ id: 'pending-task', title: 'Canopy survey', dueDate: '2026-09-28' }] })
    const present = mock.api.ui.openPopover
    let canDismiss: (() => boolean | Promise<boolean>) | undefined
    mock.api.ui.openPopover = (render, target, options) => {
      canDismiss = options?.beforeDismiss
      return present(render, target, options)
    }
    const confirm = vi.spyOn(mock.api.ui, 'confirm')
    const sourceId = mock.api.interop.services.providers(CALENDAR_ITEM_SOURCE_V2)[0].providerId
    const item = sourcedToItem({ sourceId, sourceOwner: 'todo', labelKey: 'plugin.todo.name', editable: true,
      item: { id: 'pending-task', title: 'Canopy survey', date: '2026-09-28' } })
    const close = vi.fn()
    render(<QuickAdd state={{ date: item.date, editItem: item }} groups={[]} onClose={close} onAdded={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(providerUpdate).toHaveBeenCalledOnce())
    await act(async () => {
      expect(await canDismiss?.()).toBe(false)
      fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Escape' })
    })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(close).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    await act(async () => { finishSave(false) })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await act(async () => { expect(await canDismiss?.()).toBe(true) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(close).toHaveBeenCalledOnce()
  })
})
