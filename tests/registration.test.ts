import type { ValleyPluginManifest } from '@valley/plugin-sdk/types'
import { describe, expect, it, vi } from 'vitest'
import { CALENDAR_ITEM_SOURCE_V2, CALENDAR_NAVIGATOR_V1, CALENDAR_PANEL_SELECTION_V1 } from '@valley/plugin-sdk'
import { createMockValleyApi } from './harness'
import calendarPlugin from '../src/index'
import { revealTargetStore } from '../src/runtime'
import config from '../config.json'
const calendarManifest = { id: 'calendar', datasets: config.datasets as unknown as ValleyPluginManifest['datasets'], noteDocuments: config.noteDocuments }
describe('calendar plugin registration', () => {
  it('registers its slot views + settings view and the open-page command', async () => {
    const mock = createMockValleyApi({
      manifest: calendarManifest
    })
    const registerView = mock.api.registerView as ReturnType<typeof vi.fn>
    const patchTimeControl = vi.fn(mock.api.workspace.patchTimeControl)
    patchTimeControl.mockImplementation(() => ({} as ReturnType<typeof mock.api.workspace.patchTimeControl>))
    mock.api.workspace.patchTimeControl = patchTimeControl

    const dispose = calendarPlugin.register(mock.api)

    const keys = registerView.mock.calls.map((c) => c[0])
    expect(keys).toEqual(
      expect.arrayContaining(['calendar.agenda', 'calendar.panel', 'calendar.page', 'calendar.settings'])
    )
    expect(mock.commands.map((c) => c.id)).toContain('open-page')

    const navigators = mock.api.interop.services.providers(CALENDAR_NAVIGATOR_V1)
    expect(navigators).toHaveLength(1)
    await expect(navigators[0].invoke('openDate', [
      {
        date: '2026-08-12',
        startTime: '08:30',
        endTime: '10:00',
        sourceId: 'todo',
        itemId: 't1'
      }
    ])).resolves.toEqual({ ok: true, value: undefined })
    expect(patchTimeControl).toHaveBeenCalledWith({
      cursor: '2026-08-01',
      selectedDate: '2026-08-12',
      selectedTime: '08:30',
      timeRange: { start: '08:30', end: '10:00' },
      rangeStart: null,
      rangeEnd: null
    })
    expect(patchTimeControl).not.toHaveBeenCalledWith(
      expect.objectContaining({ view: expect.anything() })
    )
    expect(mock.api.workspace.openMainTab).toHaveBeenCalled()
    expect(revealTargetStore().get()).toMatchObject({
      sourceId: 'todo',
      itemId: 't1',
      date: '2026-08-12',
      nonce: expect.any(Number)
    })
    expect(mock.api.interop.state.get(CALENDAR_PANEL_SELECTION_V1)).toBeNull()

    dispose?.()
    expect(mock.commands).toHaveLength(0)
    expect(mock.api.interop.services.providers(CALENDAR_NAVIGATOR_V1)).toEqual([])
    expect(mock.api.interop.state.get(CALENDAR_PANEL_SELECTION_V1)).toBeNull()
    expect(revealTargetStore().get()).toBeNull()
  })
})

describe('optional calendar item sources', () => {
  it('Calendar renders with no item source registered', () => {
    const mock = createMockValleyApi({
      manifest: calendarManifest
    })
    // Nothing provides `calendar.itemSource` — the Todo plugin is disabled.
    expect(mock.api.interop.services.providers(CALENDAR_ITEM_SOURCE_V2)).toEqual([])

    // Registering must still succeed: an unclaimed point is an empty list, not
    // an error, so Calendar keeps working with only its own events.
    expect(() => calendarPlugin.register(mock.api)).not.toThrow()
    const keys = (mock.api.registerView as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(keys).toEqual(expect.arrayContaining(['calendar.page']))
  })
})
