import { describe, expect, it } from 'vitest'
import type { DataRecord } from '@valley/plugin-sdk/types'
import { createMockValleyApi, type MockValleyApi } from './harness'
import { initRuntime as initCalendarRuntime } from '../src/runtime'
import { registerCalendarCommands } from '../src/commands'

describe('calendar commands (bus)', () => {
  function setup(events: DataRecord[] = []): MockValleyApi {
    const mock = createMockValleyApi({
      manifest: { id: 'calendar' },
      datasets: {
        'calendar.events': events,
        'calendar.event_tags': [],
        'calendar.event_links': [],
        'calendar.event_attachments': []
      }
    })
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
})
