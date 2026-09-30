import type { ValleyPluginManifest } from '@valley/plugin-sdk/types'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockValleyApi, type MockValleyApi } from './harness'
import type { DataRecord } from '@valley/plugin-sdk/types'
import { initRuntime } from '../src/runtime'
import { appendEvent, updateEvent, deleteEvent, newEvent } from '../src/events'
import config from '../config.json'

let calMock: MockValleyApi
const eventRecords = (): DataRecord[] => calMock.datasets.get('calendar.events') ?? []
beforeEach(() => {
  calMock = createMockValleyApi({ manifest: { id: 'calendar', datasets: config.datasets as unknown as ValleyPluginManifest['datasets'], noteDocuments: config.noteDocuments }, datasets: { 'calendar.events': [] } })
  initRuntime(calMock.api)
})

describe('undoable calendar events', () => {
  it('append/update/delete all register working inverses', async () => {
    const event = newEvent('Fungi survey block', '2026-06-10')
    expect(await appendEvent(event)).toBe(true)
    expect((await calMock.undoActions[0].undo()).ok).toBe(true)
    expect(eventRecords()).toHaveLength(0)
    expect((await calMock.undoActions[0].redo!()).ok).toBe(true)

    calMock.undoActions.length = 0
    await updateEvent(event.id, { ...event, title: 'Moved block' })
    expect((await calMock.undoActions[0].undo()).ok).toBe(true)
    expect(eventRecords()[0].title).toBe('Fungi survey block')

    calMock.undoActions.length = 0
    await deleteEvent(event.id)
    expect(eventRecords()).toHaveLength(0)
    expect((await calMock.undoActions[0].undo()).ok).toBe(true)
    expect(eventRecords()[0].title).toBe('Fungi survey block')
  })
})
