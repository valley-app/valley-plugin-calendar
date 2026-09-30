import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { calendarCss } from '../src/styles'
import { MAX_SPAN_DAYS, addDays, daysBetween, daysInRange } from '../src/dateMath'
import { normalizeEventRecord } from '../src/events'
import type { DataRecord } from '@valley/plugin-sdk/types'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const read = (name: string): string => fs.readFileSync(path.join(src, name), 'utf8')

describe('quick-add plugin boundary', () => {
  // Plugin CSS is injected into <head> after the bundle, so a class another
  // plugin owns *works* — right up until the user disables that plugin. The
  // quick-add popover rendered .todo-save-btn, .todo-tag-* and a
  // .todo-priority-cycle that was never defined anywhere at all.
  it('renders no class the To-Do plugin owns', () => {
    for (const name of ['QuickAdd.tsx', 'fields.tsx', 'icons.tsx', 'items.tsx']) {
      expect(read(name), `${name} reaches into another plugin's stylesheet`).not.toMatch(/todo-[a-z]/)
    }
  })

  it('defines every class the popover renders in its own stylesheet', () => {
    const css = calendarCss
    const rendered = new Set<string>()
    for (const file of ['QuickAdd.tsx', 'fields.tsx']) {
      for (const [, list] of read(file).matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        for (const name of (list ?? '').split(/[\s{}?:]+/)) {
          if (name.startsWith('calendar-')) rendered.add(name)
        }
      }
    }
    expect(rendered.size).toBeGreaterThan(10)
    const missing = [...rendered].filter((name) => !css.includes(`.${name}`))
    expect(missing).toEqual([])
  })
})

describe('daysInRange', () => {
  it('materializes every day of a span, both ends included', () => {
    expect(daysInRange('2026-08-12', '2026-08-15')).toEqual([
      '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15'
    ])
  })

  it('treats a missing, equal or backwards end as a single day', () => {
    expect(daysInRange('2026-08-12')).toEqual(['2026-08-12'])
    expect(daysInRange('2026-08-12', '2026-08-12')).toEqual(['2026-08-12'])
    expect(daysInRange('2026-08-12', '2026-08-01')).toEqual(['2026-08-12'])
  })

  it('crosses a month and a year boundary', () => {
    expect(daysInRange('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'
    ])
  })

  it('clamps a runaway span rather than materializing it', () => {
    expect(daysInRange('2026-01-01', '2099-01-01')).toHaveLength(MAX_SPAN_DAYS)
  })

  it('counts whole days across a DST change', () => {
    // Most of Europe springs forward on 2026-03-29: the raw millisecond gap
    // over that night is 23 hours, which a floor would round down to one day
    // short. The helpers compare at noon so the count stays whole.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(daysBetween('2026-08-20', '2026-08-13')).toBe(-7)
  })
})

describe('event end dates', () => {
  const normalize = (record: Partial<DataRecord>): ReturnType<typeof normalizeEventRecord> =>
    normalizeEventRecord({ id: 'e1', title: 'Trip', date: '2026-08-12', ...record } as DataRecord)

  it('keeps an end date that is genuinely later', () => {
    expect(normalize({ endDate: '2026-08-15' }).endDate).toBe('2026-08-15')
  })

  it('drops a same-day, backwards or absent end', () => {
    expect(normalize({ endDate: '2026-08-12' }).endDate).toBeUndefined()
    expect(normalize({ endDate: '2026-08-01' }).endDate).toBeUndefined()
    expect(normalize({}).endDate).toBeUndefined()
  })
})
