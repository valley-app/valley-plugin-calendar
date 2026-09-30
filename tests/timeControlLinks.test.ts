import { describe, expect, it } from 'vitest'
import { calendarLinkPatch, calendarLinkState } from '../src/timeControl'

describe('Calendar Valley-link state', () => {
  it('round-trips the visible view, cursor, day, range, and time', () => {
    const state = calendarLinkState({
      view: 'week',
      cursor: '2027-03-01',
      selectedDate: '2027-03-14',
      rangeStart: '2027-03-12',
      rangeEnd: '2027-03-16',
      selectedTime: '09:30',
      timeRange: { start: '09:30', end: '11:00' }
    })

    expect(calendarLinkPatch(state)).toEqual({
      view: 'week',
      cursor: '2027-03-01',
      selectedDate: '2027-03-14',
      rangeStart: '2027-03-12',
      rangeEnd: '2027-03-16',
      selectedTime: '09:30',
      timeRange: { start: '09:30', end: '11:00' }
    })
  })

  it('rejects incompatible state and clears malformed optional selections safely', () => {
    expect(calendarLinkPatch({ v: 2, view: 'month', cursor: '2027-03-01' })).toBeNull()
    expect(calendarLinkPatch({ v: 1, view: 'day', cursor: '2027-03-01' })).toBeNull()
    expect(calendarLinkPatch({ v: 1, view: 'month', cursor: '2027-02-30' })).toBeNull()
    expect(calendarLinkPatch({
      v: 1,
      view: 'year',
      cursor: '2027-03-01',
      selectedDate: 'not-a-date',
      rangeStart: 3,
      rangeEnd: null,
      selectedTime: '25:00',
      timeRange: { start: '11:00', end: '09:30' }
    })).toEqual({
      view: 'year',
      cursor: '2027-03-01',
      selectedDate: null,
      rangeStart: null,
      rangeEnd: null,
      selectedTime: null,
      timeRange: null
    })
  })
})
