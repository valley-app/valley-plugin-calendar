import { describe, expect, it } from 'vitest'
import { updateEvent, deleteEvent } from '../src/events'
import type { EventRecord } from '@valley/plugin-sdk/types'

// Read-only events pulled from a connected Google/Microsoft calendar carry a
// `<provider>:` id. The data layer must refuse to write or delete them so they
// can never pollute `calendar.events` — guarded before any IPC/data call.
const remote = (id: string): EventRecord => ({
  id,
  title: 'Remote event',
  date: '2026-06-17',
  tags: [],
  note: '',
  createdAt: '',
  updatedAt: '',
  readOnly: true
})

describe('calendar read-only remote events', () => {
  it('updateEvent is a no-op for google: / microsoft: ids', async () => {
    expect(await updateEvent('google:abc', remote('google:abc'))).toBe(false)
    expect(await updateEvent('microsoft:xyz', remote('microsoft:xyz'))).toBe(false)
  })

  it('deleteEvent is a no-op for remote ids', async () => {
    expect(await deleteEvent('google:abc')).toBe(false)
    expect(await deleteEvent('microsoft:xyz')).toBe(false)
  })
})
