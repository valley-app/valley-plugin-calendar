import { reminderTimes } from '../src/reminderOwner'
import { describe, expect, it, vi } from 'vitest'
import { createMockValleyApi } from '@valley/plugin-testkit'
import type { EventRecord, ValleyPluginManifest } from '@valley/plugin-sdk/types'
import { createCalendarDomain } from '../src/domain'
import config from '../config.json'

const event = (): EventRecord => ({ id: 'fern', title: 'Fern survey', date: '2026-09-30', note: '', tags: ['field'], createdAt: '2026-09-30T08:00:00.000Z', updatedAt: '2026-09-30T08:00:00.000Z' })
const setup = () => {
  const mock = createMockValleyApi({ manifest: { id: 'calendar', datasets: config.datasets as unknown as ValleyPluginManifest['datasets'], noteDocuments: config.noteDocuments } })
  const publish = vi.fn(async () => {})
  const domain = createCalendarDomain(mock.api, publish)
  return { mock, publish, domain }
}

describe('headless Calendar owner', () => {
  it('creates and updates local events without a renderer and emits committed values', async () => {
    const { domain, publish } = setup()
    await domain.append(event())
    expect(publish).toHaveBeenCalledWith('event.created', { record: expect.objectContaining({ id: 'fern' }) })
    await domain.patch('fern', { title: 'Moved survey', note: 'Bring samples' })
    expect(publish).toHaveBeenCalledWith('event.updated', expect.objectContaining({ record: expect.objectContaining({ title: 'Moved survey' }), previous: expect.objectContaining({ title: 'Fern survey' }) }))
    expect(await domain.get('fern')).toMatchObject({ title: 'Moved survey', note: 'Bring samples', tags: ['field'] })
  })

  it('preserves data and emits nothing on stale revision or failed commit', async () => {
    const { domain, publish, mock } = setup()
    await domain.append(event())
    publish.mockClear()
    expect(await domain.update('fern', { ...event(), title: 'Stale' }, 'stale')).toEqual({ ok: false })
    vi.spyOn(mock.api.documents, 'update').mockRejectedValueOnce(new Error('Conflict'))
    await expect(domain.update('fern', { ...event(), title: 'Rejected' })).rejects.toThrow('Conflict')
    expect(publish).not.toHaveBeenCalled()
    expect((await domain.get('fern'))?.title).toBe('Fern survey')
  })

  it('rejects read-only events and stops writes after unload', async () => {
    const { domain, publish } = setup()
    await expect(domain.append({ ...event(), readOnly: true })).rejects.toThrow('read-only')
    await expect(domain.append({ ...event(), id: 'google:remote' })).rejects.toThrow('read-only')
    expect(publish).not.toHaveBeenCalled()
    await domain.dispose()
    await expect(domain.append(event())).rejects.toThrow('stopped')
  })

  it('serializes changes and forwards only the supplied causal event publisher', async () => {
    const { domain, publish, mock } = setup()
    await domain.append(event())
    publish.mockClear()
    const scoped = vi.fn(async () => {})
    await Promise.all([domain.patch('fern', { title: 'New title' }, mock.api, scoped), domain.patch('fern', { note: 'New note' }, mock.api, scoped)])
    expect(await domain.get('fern')).toMatchObject({ title: 'New title', note: 'New note' })
    expect(scoped).toHaveBeenCalledTimes(2)
    expect(publish).not.toHaveBeenCalled()
  })
})

it('preserves reminder choices, defaults new timed events, and rejects invalid offsets before saving', async () => {
  const { domain } = setup()
  await domain.append({ ...event(), startTime: '10:00' })
  expect((await domain.get('fern'))?.reminderOffsets).toEqual([10])
  await domain.patch('fern', { reminderOffsets: [0, 60, 120] })
  const saved = (await domain.get('fern'))!
  expect(reminderTimes(saved).map(value => value.at)).toEqual([0, 60, 120].map(minutes => new Date('2026-09-30T10:00').getTime() - minutes * 60000))
  await expect(domain.patch('fern', { reminderOffsets: [10, 10] })).rejects.toThrow('Invalid reminder offsets')
  expect((await domain.get('fern'))?.reminderOffsets).toEqual([0, 60, 120])
  expect(reminderTimes({ ...saved, startTime: undefined, reminderTime: undefined })).toEqual([])
  expect(reminderTimes({ ...saved, reminderOffsets: [] })).toEqual([])
  expect(reminderTimes({ ...saved, source: 'provider' })).toEqual([])
})
