// @vitest-environment jsdom
import * as React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventRecord } from '@valley/plugin-sdk/types'
import type { PluginBackendApi } from '@valley/plugin-sdk'
import { createMockValleyApi } from './harness'
import { initRuntime } from '../src/runtime'
import { startReminderOwner } from '../src/reminderOwner'
import { WeekGrid } from '../src/WeekGrid'

const settle = async (): Promise<void> => { for (let index = 0; index < 20; index++) await vi.advanceTimersByTimeAsync(0) }

function owner(records: EventRecord[] = []) {
  const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
  const listeners: { realm?: (info: unknown) => void; settings?: () => void; resume?: () => void } = {}
  const write = vi.fn(async () => ({ ok: true }))
  const api = {
    ...mock.api,
    realm: { ...mock.api.realm, read: vi.fn(async () => null), onChanged: (listener: (info: unknown) => void) => { listeners.realm = listener; return () => {} } },
    settings: { get: () => ({}), subscribe: (listener: () => void) => { listeners.settings = listener; return () => {} } },
    lifecycle: { onResume: (listener: () => void) => { listeners.resume = listener; return () => {} } },
    data: { dataset: () => ({ subscribe: () => () => {} }), files: { readText: async () => null, readTextBaseline: async () => null, writeTextGuarded: write } },
    notifications: { schedule: vi.fn(async () => {}), cancel: vi.fn(async () => {}), onOccurrence: () => () => {} },
    i18n: { t: (key: string) => key },
    rpc: { handle: () => () => {}, emit: vi.fn() }
  } as unknown as PluginBackendApi
  const list = vi.fn(async () => records)
  return { api, list, listeners, write, stop: startReminderOwner(api, list) }
}

const event = (id: string): EventRecord => ({ id, title: id, date: '2026-11-20', startTime: '09:00', note: '' } as EventRecord)

describe('Calendar reminder owner at idle', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: new Date(2026, 10, 9, 23, 50) }) })
  afterEach(() => { vi.useRealTimers() })

  it('does nothing between events and passes once at the local day boundary', async () => {
    const { list, stop } = owner()
    await settle()
    const start = list.mock.calls.length
    await vi.advanceTimersByTimeAsync(9 * 60_000)
    await settle()
    expect(list).toHaveBeenCalledTimes(start)
    await vi.advanceTimersByTimeAsync(2 * 60_000)
    await settle()
    expect(list).toHaveBeenCalledTimes(start + 1)
    await stop()
  })

  it('saves its state only when the wanted reminders change', async () => {
    const records = [event('a')]
    const { list, listeners, write, stop } = owner(records)
    await settle()
    expect(write).toHaveBeenCalledTimes(1)
    const start = list.mock.calls.length
    listeners.settings!()
    await settle()
    expect(list).toHaveBeenCalledTimes(start + 1)
    expect(write).toHaveBeenCalledTimes(1)
    records.push(event('b'))
    listeners.settings!()
    await settle()
    expect(write).toHaveBeenCalledTimes(2)
    await stop()
  })

  it('ignores realm changes that do not touch a calendar file', async () => {
    const { list, listeners, stop } = owner()
    await settle()
    const start = list.mock.calls.length
    listeners.realm!({ eventId: '1', kind: 'changed', paths: ['notes/a.md'] })
    await settle()
    expect(list).toHaveBeenCalledTimes(start)
    listeners.realm!({ eventId: '2', kind: 'changed', paths: ['cal/a.ICS'] })
    await settle()
    expect(list).toHaveBeenCalledTimes(start + 1)
    listeners.realm!({ eventId: '3', kind: 'renamed', paths: [], oldPath: 'cal/old.vcs', newPath: 'notes/old.txt' })
    await settle()
    expect(list).toHaveBeenCalledTimes(start + 2)
    await stop()
  })

  it('coalesces a burst of change events into one pass', async () => {
    const { list, listeners, stop } = owner()
    await settle()
    const start = list.mock.calls.length
    for (let index = 0; index < 25; index++) listeners.resume!()
    await settle()
    expect(list).toHaveBeenCalledTimes(start + 1)
    await stop()
  })

  it('arms no timer after stopping', async () => {
    const { stop } = owner()
    await settle()
    expect(vi.getTimerCount()).toBe(1)
    await stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('WeekGrid now indicator', () => {
  let hidden = false
  const setHidden = (value: boolean): void => { hidden = value; act(() => { document.dispatchEvent(new Event('visibilitychange')) }) }
  const grid = () => <WeekGrid days={[new Date(2026, 10, 9)]} items={[]} dayStartHour={0} dayEndHour={24} colorFor={() => ''} selectedItemKey={null} onSelectItem={() => {}} onEditItem={() => {}} onCommit={() => {}} onCreate={() => {}} revealTarget={null} />

  beforeEach(() => {
    hidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    vi.useFakeTimers({ now: new Date(2026, 10, 9, 12, 0, 30) })
    initRuntime(createMockValleyApi({ manifest: { id: 'calendar' } }).api)
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); delete (document as { hidden?: boolean }).hidden })

  it('keeps one timer while visible, none while hidden, and re-arms when shown', () => {
    render(grid())
    expect(vi.getTimerCount()).toBe(1)
    setHidden(true)
    expect(vi.getTimerCount()).toBe(0)
    act(() => { vi.advanceTimersByTime(10 * 60_000) })
    expect(vi.getTimerCount()).toBe(0)
    setHidden(false)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('arms nothing after unmount', () => {
    const view = render(grid())
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
