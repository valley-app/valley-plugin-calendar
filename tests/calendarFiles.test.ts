import * as React from 'react'
import { createMockValleyApi } from './harness'
import { initRuntime } from '../src/runtime'
import { describe, expect, it, vi } from 'vitest'
import { appendCalendarFile, deleteCalendarFileEntry, parseCalendarFile, editCalendarFile, saveCalendarFile } from '../src/calendarFiles'
import { dailyNoteDate, openDailyNote } from '../src/dailyNotes'

const path = 'plugins/calendar/forest.ics'
const wrap = (body: string, version = '2.0') => `BEGIN:VCALENDAR\r\nVERSION:${version}\r\nPRODID:-//Valley//Calendar//EN\r\n${body}\r\nEND:VCALENDAR\r\n`
const event = (extra = '') => `BEGIN:VEVENT\r\nUID:forest\r\nDTSTAMP:20260928T080000Z\r\nDTSTART;VALUE=DATE:20260928\r\nDTEND;VALUE=DATE:20261001\r\nSUMMARY:Canopy survey\r\n${extra}END:VEVENT`
const read = (raw: string) => parseCalendarFile(raw, path, '2026-09-01', '2026-11-30')

describe('calendar files', () => {
  it('uses exclusive all-day end dates', () => {
    expect(read(wrap(event())).entries[0]).toMatchObject({ date: '2026-09-28', endDate: '2026-09-30', startTime: undefined })
  })
  it('preserves folded Unicode, unknown fields, alarms and unrelated components while editing', () => {
    const raw = wrap(event('DESCRIPTION:Äste und\r\n  Blätter\r\nX-FOREST:keep\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nDESCRIPTION:Observe\r\nEND:VALARM\r\n') + '\r\nBEGIN:VTODO\r\nUID:task\r\nSUMMARY:Moss\r\nEND:VTODO')
    const item = read(raw).entries[0]
    expect(item.note).toBe('Äste und Blätter')
    const saved = editCalendarFile(raw, item, { title: 'Bäume', date: item.date, endDate: item.endDate, note: item.note }, 'series')
    expect(saved).toContain('X-FOREST:keep')
    expect(saved).toContain('BEGIN:VALARM')
    expect(saved).toContain('BEGIN:VTODO')
    expect(read(saved).entries[0].title).toBe('Bäume')
  })
  it('expands recurrence and excludes canceled dates', () => {
    const raw = wrap('BEGIN:VEVENT\r\nUID:repeat\r\nDTSTART:20260928T090000Z\r\nDTEND:20260928T100000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE:20260929T090000Z\r\nSUMMARY:Bird count\r\nEND:VEVENT')
    expect(read(raw).entries.map(entry => entry.date)).toEqual(['2026-09-28', '2026-09-30'])
    const item = read(raw).entries[1]
    const saved = editCalendarFile(raw, item, { title: 'Revised count', date: item.date, startTime: '11:00', endTime: '12:00' }, 'occurrence')
    expect(read(saved).entries.map(entry => entry.title)).toEqual(['Bird count', 'Revised count'])
  })
  it('reads and edits free/busy duration periods without creating events', () => {
    const raw = wrap('BEGIN:VFREEBUSY\r\nUID:availability\r\nDTSTAMP:20260928T080000Z\r\nFREEBUSY;FBTYPE=BUSY-TENTATIVE:20260928T090000Z/PT1H,20260929T120000Z/PT2H\r\nEND:VFREEBUSY')
    const entries = read(raw).entries
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ startTime: '09:00', endTime: '10:00', availability: 'BUSY-TENTATIVE' })
    const saved = editCalendarFile(raw, entries[0], { date: '2026-09-28', startTime: '10:00', endTime: '11:00' }, 'series')
    expect(read(saved).entries[0].startTime).toBe('10:00')
    expect(saved).not.toContain('VEVENT')
  })
  it('retains a legacy file version and translates supported legacy recurrence for display', () => {
    const raw = wrap('BEGIN:VEVENT\r\nUID:legacy\r\nDTSTART:20260928T090000\r\nDTEND:20260928T100000\r\nSUMMARY:Ferns\r\nEND:VEVENT', '1.0')
    const item = read(raw).entries[0]
    const saved = editCalendarFile(raw, item, { title: 'Moss', date: item.date, startTime: item.startTime, endTime: item.endTime }, 'series')
    expect(saved).toContain('VERSION:1.0')
    expect(read(raw.replace('SUMMARY:', 'RRULE:D1 #3\r\nSUMMARY:')).entries).toHaveLength(3)
  })
  it('reports malformed documents and unsupported legacy recurrence', () => {
    expect(read('invalid').errors.length).toBeGreaterThan(0)
    expect(read(wrap(event('RRULE:UNKNOWN\r\n'), '1.0')).errors.length).toBeGreaterThan(0)
  })
  it('rejects reversed time ranges', () => {
    const raw = wrap(event())
    expect(() => editCalendarFile(raw, read(raw).entries[0], { startTime: '12:00', endTime: '11:00' }, 'series')).toThrow('end after')
  })
})

describe('daily note filenames', () => {
  it('recognizes only real dates immediately inside the selected folder', () => {
    expect(dailyNoteDate('plugins/calendar/dailynotes/2028-02-29.md', 'plugins/calendar/dailynotes')).toBe('2028-02-29')
    for (const name of ['2026-02-29.md', '2026-2-02.md', '2026-09-31.md', 'nested/2026-09-28.md', '2026-09-28.txt']) expect(dailyNoteDate(`plugins/calendar/dailynotes/${name}`, 'plugins/calendar/dailynotes')).toBeNull()
  })
})

describe('calendar file mutation boundaries', () => {
  it('moves an entire recurring series relative to the selected occurrence', () => {
    const raw = wrap(event('RRULE:FREQ=DAILY;COUNT=3\r\n'))
    const item = read(raw).entries[1]
    const saved = editCalendarFile(raw, item, { title: 'Moved', date: '2026-09-30', endDate: '2026-10-02' }, 'series')
    expect(read(saved).entries.map(entry => entry.date)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01'])
  })
  it('edits legacy occurrences while retaining the original recurrence syntax', () => {
    const raw = wrap(event('RRULE:D1 #3\r\n'), '1.0')
    const saved = editCalendarFile(raw, read(raw).entries[1], { title: 'Changed observation', date: '2026-09-29' }, 'occurrence')
    expect(saved).toContain('RRULE:D1 #3')
    expect(saved).not.toContain('FREQ=')
    expect(read(saved).entries.filter(entry => entry.date === '2026-09-29')).toHaveLength(1)
  })
  it('keeps embedded timezone rules and exception TZIDs across a DST boundary', () => {
    const zone = 'BEGIN:VTIMEZONE\r\nTZID:Forest/Seasonal\r\nBEGIN:STANDARD\r\nDTSTART:19701025T030000\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nEND:STANDARD\r\nBEGIN:DAYLIGHT\r\nDTSTART:19700329T020000\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nEND:DAYLIGHT\r\nEND:VTIMEZONE'
    const raw = wrap(zone + '\r\nBEGIN:VEVENT\r\nUID:seasonal\r\nDTSTART;TZID=Forest/Seasonal:20261024T090000\r\nDTEND;TZID=Forest/Seasonal:20261024T100000\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:Dawn count\r\nEND:VEVENT')
    expect(read(raw).entries.map(entry => entry.startTime)).toEqual(['09:00', '09:00', '09:00'])
    expect(read(raw).entries[1].timeZone).toBe('Forest/Seasonal')
    const withAlarm = raw.replace('SUMMARY:Dawn count', 'BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT1H\r\nEND:VALARM\r\nSUMMARY:Dawn count')
    expect(read(withAlarm).entries.map(entry => new Date(entry.alarmTimes![0].at).toISOString())).toEqual(['2026-10-24T06:00:00.000Z', '2026-10-25T07:00:00.000Z', '2026-10-26T07:00:00.000Z'])
    const saved = editCalendarFile(raw, read(raw).entries[1], { title: 'Later count', date: '2026-10-25', startTime: '11:00', endTime: '12:00' }, 'occurrence')
    expect(saved).toContain(zone)
    expect(saved).toContain('RECURRENCE-ID;TZID=Forest/Seasonal:20261025T090000')
    expect(read(saved).entries.map(entry => entry.startTime)).toEqual(['09:00', '11:00', '09:00'])
  })
})


describe('guarded calendar documents', () => {
  it('retains revisions and rejects concurrent edits without an unguarded write', async () => {
    const mock = createMockValleyApi()
    const dispose = initRuntime({ ...mock.api, React })
    for (const key of ['stat', 'readTextDocument', 'writeTextDocumentGuarded', 'createTextDocumentGuarded', 'writeFile'] as const) vi.spyOn(mock.api.vault, key)
    const raw = wrap(event())
    vi.mocked(mock.api.vault.writeTextDocumentGuarded).mockResolvedValue({ ok: false, reason: 'conflict' } as never)
    await expect(saveCalendarFile(read(raw).entries[0], { title: 'Draft', date: '2026-09-28' }, 'series', { content: raw, revisionToken: 'original' })).rejects.toThrow('draft is preserved')
    expect(mock.api.vault.writeTextDocumentGuarded).toHaveBeenCalledWith(path, expect.stringContaining('SUMMARY:Draft'), 'original')
    expect(mock.api.vault.writeFile).not.toHaveBeenCalled()
    await dispose()
  })
  it('removes one source component without changing an unrelated folded component', async () => {
    const mock = createMockValleyApi()
    const dispose = initRuntime({ ...mock.api, React })
    for (const key of ['stat', 'readTextDocument', 'writeTextDocumentGuarded', 'createTextDocumentGuarded', 'writeFile'] as const) vi.spyOn(mock.api.vault, key)
    const other = 'BEGIN:VEVENT\r\nUID:moss\r\nDTSTART;VALUE=DATE:20260930\r\nSUMMARY:Moss and\r\n  lichens\r\nEND:VEVENT'
    const raw = wrap(event() + '\r\n' + other)
    vi.mocked(mock.api.vault.readTextDocument).mockResolvedValue({ content: raw, revisionToken: 'original' } as never)
    vi.mocked(mock.api.vault.writeTextDocumentGuarded).mockResolvedValue({ ok: true } as never)
    await deleteCalendarFileEntry(read(raw).entries[0])
    const saved = vi.mocked(mock.api.vault.writeTextDocumentGuarded).mock.calls[0][1]
    expect(saved).toContain(other)
    expect(saved).not.toContain('UID:forest')
    await dispose()
  })
  it('creates events and UTC availability inside the source file', () => {
    const raw = wrap(event())
    expect(read(appendCalendarFile(raw, path, { title: 'Moss', date: '2026-09-28' })).entries).toHaveLength(2)
    const busy = appendCalendarFile(wrap(''), 'forest.ifb', { title: 'BUSY', date: '2026-09-28', startTime: '09:00', endTime: '10:00' })
    expect(busy).toContain('FREEBUSY;FBTYPE=BUSY:20260928T090000Z/20260928T100000Z')
    expect(busy).not.toContain('VEVENT')
  })
  it('opens an existing daily note without writing and creates an absent note once', async () => {
    const mock = createMockValleyApi()
    const dispose = initRuntime({ ...mock.api, React })
    for (const key of ['stat', 'readTextDocument', 'writeTextDocumentGuarded', 'createTextDocumentGuarded', 'writeFile'] as const) vi.spyOn(mock.api.vault, key)
    vi.mocked(mock.api.vault.stat).mockResolvedValue({ size: 10 } as never)
    await openDailyNote('2026-09-28')
    expect(mock.api.vault.createTextDocumentGuarded).not.toHaveBeenCalled()
    vi.mocked(mock.api.vault.stat).mockResolvedValue(null)
    vi.mocked(mock.api.vault.createTextDocumentGuarded).mockResolvedValue({ ok: true } as never)
    await openDailyNote('2026-09-29')
    expect(mock.api.vault.createTextDocumentGuarded).toHaveBeenCalledWith('plugins/calendar/dailynotes/2026-09-29.md', '# 2026-09-29\n\n')
    await expect(openDailyNote('2026-02-29')).rejects.toThrow()
    await dispose()
  })
})

it('extracts relative and absolute display alarms without adding a default alarm', () => {
  const raw = wrap('BEGIN:VEVENT\r\nUID:alarm\r\nDTSTART:20260928T090000Z\r\nDTEND:20260928T100000Z\r\nRRULE:FREQ=DAILY;COUNT=2\r\nSUMMARY:Bird count\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT10M\r\nEND:VALARM\r\nEND:VEVENT')
  const entries = read(raw).entries
  expect(entries.map(entry => entry.alarmTimes?.map(alarm => new Date(alarm.at).toISOString()))).toEqual([['2026-09-28T08:50:00.000Z'], ['2026-09-29T08:50:00.000Z']])
  expect(read(wrap(event())).entries[0].alarmTimes ?? []).toEqual([])
})
