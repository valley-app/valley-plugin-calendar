import { describe, expect, it } from 'vitest'
import { layoutOverlaps } from '../src/overlap'
import type { CalItem } from '../src/items'

function item(id: string, startTime: string, endTime?: string): CalItem {
  return { kind: 'event', id, title: id, date: '2026-08-20', startTime, endTime }
}

const near = (value: number, expected: number): void => {
  expect(Math.abs(value - expected)).toBeLessThan(0.0001)
}

describe('layoutOverlaps', () => {
  it('gives a lone block the whole column', () => {
    const out = layoutOverlaps([item('a', '09:00', '10:00')])
    expect(out.get('a')).toEqual({ left: 0, width: 1, z: 1 })
  })

  it('leaves back-to-back blocks full width — touching is not overlapping', () => {
    const out = layoutOverlaps([item('a', '09:00', '10:00'), item('b', '10:00', '11:00')])
    expect(out.get('a')).toEqual({ left: 0, width: 1, z: 1 })
    expect(out.get('b')).toEqual({ left: 0, width: 1, z: 1 })
  })

  it('splits the column between two overlapping blocks and laps the later one', () => {
    const out = layoutOverlaps([item('a', '09:00', '11:00'), item('b', '10:00', '12:00')])
    const a = out.get('a')!
    const b = out.get('b')!
    near(a.left, 0)
    near(a.width, 0.5)
    expect(a.z).toBe(1)
    // The second lane reaches back over the first, so both titles stay readable.
    expect(b.left).toBeLessThan(0.5)
    near(b.left + b.width, 1)
    expect(b.z).toBe(2)
  })

  it('widens a block into lanes nothing of its own overlaps sits in', () => {
    // A long morning block beside one short stand-up: the long one keeps the
    // whole column below the stand-up rather than losing half of it to nothing.
    const out = layoutOverlaps([item('long', '09:00', '17:00'), item('standup', '09:00', '09:30')])
    const long = out.get('long')!
    near(long.left, 0)
    near(long.width, 0.5)
    const later = layoutOverlaps([item('long', '09:00', '17:00'), item('late', '16:00', '17:00')])
    near(later.get('long')!.width, 0.5)
  })

  it('keeps separate clusters independent', () => {
    const out = layoutOverlaps([
      item('a', '09:00', '10:00'),
      item('b', '09:30', '10:30'),
      item('c', '14:00', '15:00')
    ])
    near(out.get('a')!.width, 0.5)
    expect(out.get('c')).toEqual({ left: 0, width: 1, z: 1 })
  })

  it('reuses a lane once its block has ended', () => {
    const out = layoutOverlaps([
      item('spanning', '09:00', '12:00'),
      item('first', '09:00', '10:00'),
      item('second', '10:00', '11:00')
    ])
    near(out.get('spanning')!.left, 0)
    // `first` and `second` do not overlap, so they share lane 1.
    near(out.get('first')!.left, out.get('second')!.left)
    expect(out.get('first')!.z).toBe(out.get('second')!.z)
  })

  it('gives a third overlap a third of the column', () => {
    const out = layoutOverlaps([
      item('a', '09:00', '12:00'),
      item('b', '09:00', '12:00'),
      item('c', '09:00', '12:00')
    ])
    near(out.get('a')!.width, 1 / 3)
    near(out.get('a')!.left, 0)
    near(out.get('c')!.left + out.get('c')!.width, 1)
    expect(out.get('c')!.z).toBe(3)
  })

  it('an item with no end still occupies its hour', () => {
    const out = layoutOverlaps([item('a', '09:00'), item('b', '09:30', '10:30')])
    near(out.get('a')!.width, 0.5)
  })

  it('a zero-length item still takes a lane', () => {
    const out = layoutOverlaps([item('a', '09:00', '10:00'), item('b', '09:30', '09:30')])
    near(out.get('a')!.width, 0.5)
    expect(out.get('b')).toBeDefined()
  })

  it('skips all-day items', () => {
    const out = layoutOverlaps([{ kind: 'event', id: 'allday', title: 'x', date: '2026-08-20' }])
    expect(out.size).toBe(0)
  })

  it('does not depend on input order', () => {
    const forward = layoutOverlaps([item('a', '09:00', '11:00'), item('b', '10:00', '12:00')])
    const reverse = layoutOverlaps([item('b', '10:00', '12:00'), item('a', '09:00', '11:00')])
    expect(forward.get('a')).toEqual(reverse.get('a'))
    expect(forward.get('b')).toEqual(reverse.get('b'))
  })
})
