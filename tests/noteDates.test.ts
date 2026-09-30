import { describe, it, expect } from 'vitest'
import type { IndexEntry } from '@valley/plugin-sdk/types'
import {
  activeYears,
  buildNoteDates,
  buildSourceEntries,
  countAt,
  matchNotes,
  noteDateTitle,
  noteDatesSignature,
  occurrenceInYear,
  occurrenceKeys,
  parseFieldList,
  parseNoteDate,
  sanitizeNoteDateSource,
  showFieldsFor,
  sourceMatchStats,
  type NoteDateSource
} from '../src/noteDates'

const source = (over: Partial<NoteDateSource> = {}): NoteDateSource => ({
  id: 's1',
  title: 'Contacts',
  matchKey: 'type',
  matchValue: 'contact',
  dateField: 'birthdate',
  match: 'day-month',
  showCount: true,
  labelMode: 'filename',
  showFields: ['phone'],
  visible: true,
  hidden: false,
  ...over
})

const entry = (relPath: string, frontmatter: Record<string, unknown>, over: Partial<IndexEntry> = {}): IndexEntry => ({
  relPath,
  title: relPath.replace(/\.md$/, ''),
  kind: 'note',
  frontmatter,
  mtimeMs: 0,
  ...over
})

describe('sanitizeNoteDateSource', () => {
  it('defaults every field of an empty record', () => {
    const s = sanitizeNoteDateSource({})
    expect(s.matchKey).toBe('type')
    expect(s.dateField).toBe('date')
    expect(s.match).toBe('exact')
    expect(s.recurrenceLimitYears).toBeUndefined()
    expect(s.dateFormat).toBeUndefined()
    expect(s.labelMode).toBe('filename')
    expect(s.showFields).toEqual([])
    expect(s.visible).toBe(true)
    expect(s.hidden).toBe(false)
  })

  it('leaves unset styling undefined so the normal fallback stays in charge', () => {
    const s = sanitizeNoteDateSource({ color: '', icon: '   ' })
    expect(s.color).toBeUndefined()
    expect(s.borderColor).toBeUndefined()
    expect(s.icon).toBeUndefined()
  })

  it('keeps styling that is set', () => {
    const s = sanitizeNoteDateSource({ color: '#ec4899', borderColor: '#ffffff', icon: 'cake' })
    expect(s).toMatchObject({ color: '#ec4899', borderColor: '#ffffff', icon: 'cake' })
  })

  it('parses showFields from an array or a comma string, and accepts the Map-pins key', () => {
    expect(sanitizeNoteDateSource({ showFields: [' phone ', '', 'place'] }).showFields).toEqual(['phone', 'place'])
    expect(sanitizeNoteDateSource({ showFields: 'phone, place\nemail' }).showFields).toEqual(['phone', 'place', 'email'])
    expect(sanitizeNoteDateSource({ hoverFields: ['phone'] }).showFields).toEqual(['phone'])
  })

  it('normalizes a blank folder to undefined and blank times to undefined', () => {
    const s = sanitizeNoteDateSource({ folder: '  ', startTimeField: '', endTimeField: 'ends' })
    expect(s.folder).toBeUndefined()
    expect(s.startTimeField).toBeUndefined()
    expect(s.endTimeField).toBe('ends')
  })

  it('infers property label mode from a labelField, and honours explicit flags', () => {
    expect(sanitizeNoteDateSource({ labelField: 'firstName' }).labelMode).toBe('property')
    expect(sanitizeNoteDateSource({ labelMode: 'filename', labelField: 'firstName' }).labelMode).toBe('filename')
    expect(sanitizeNoteDateSource({ match: 'day-month', showCount: false }).showCount).toBe(false)
    expect(sanitizeNoteDateSource({ visible: false }).visible).toBe(false)
    expect(sanitizeNoteDateSource({ hidden: true }).hidden).toBe(true)
  })

  it('uses only the current `match` field', () => {
    expect(sanitizeNoteDateSource({ repeat: 'yearly' }).match).toBe('exact')
    expect(sanitizeNoteDateSource({ repeat: 'never' }).match).toBe('exact')
    expect(sanitizeNoteDateSource({ repeat: 'nonsense' }).match).toBe('exact')
    expect(sanitizeNoteDateSource({ match: 'day', repeat: 'yearly' }).match).toBe('day')
    expect(sanitizeNoteDateSource({ match: 'bogus', repeat: 'yearly' }).match).toBe('exact')
  })

  it('keeps a date format that is set and drops a blank one', () => {
    expect(sanitizeNoteDateSource({ dateFormat: ' dd.mm.yyyy ' }).dateFormat).toBe('dd.mm.yyyy')
    expect(sanitizeNoteDateSource({ dateFormat: '   ' }).dateFormat).toBeUndefined()
  })

  it('clamps recurring date limits to a usable hard range', () => {
    expect(sanitizeNoteDateSource({ recurrenceLimitYears: -1 }).recurrenceLimitYears).toBe(0)
    expect(sanitizeNoteDateSource({ recurrenceLimitYears: 101 }).recurrenceLimitYears).toBe(100)
    expect(sanitizeNoteDateSource({ recurrenceLimitYears: '2' }).recurrenceLimitYears).toBeUndefined()
  })
})

describe('parseFieldList', () => {
  it('splits on commas and newlines, dropping blanks', () => {
    expect(parseFieldList('a, b\n\n c ,')).toEqual(['a', 'b', 'c'])
  })
})

describe('parseNoteDate', () => {
  it('reads ISO dates and ISO datetimes', () => {
    expect(parseNoteDate('1990-05-04')).toEqual({ year: 1990, month: 5, day: 4 })
    expect(parseNoteDate('1990-05-04T09:30:00Z')).toEqual({ year: 1990, month: 5, day: 4 })
    expect(parseNoteDate(['1990-05-04'])).toEqual({ year: 1990, month: 5, day: 4 })
  })

  it('reads year-less birthdays', () => {
    expect(parseNoteDate('--05-04')).toEqual({ month: 5, day: 4 })
    expect(parseNoteDate('05-04')).toEqual({ month: 5, day: 4 })
    expect(parseNoteDate('--02-29')).toEqual({ month: 2, day: 29 })
  })

  it('reads a Date instance by its local components', () => {
    expect(parseNoteDate(new Date(1990, 4, 4))).toEqual({ year: 1990, month: 5, day: 4 })
    expect(parseNoteDate(new Date('nope'))).toBeNull()
  })

  it('reads a value through the source format, with or without a year', () => {
    expect(parseNoteDate('04.05.1990', 'dd.mm.yyyy')).toEqual({ year: 1990, month: 5, day: 4 })
    expect(parseNoteDate('4.5.1990', 'dd.mm.yyyy')).toEqual({ year: 1990, month: 5, day: 4 })
    expect(parseNoteDate('05/04/1990', 'mm/dd/yyyy')).toEqual({ year: 1990, month: 5, day: 4 })
    expect(parseNoteDate('04.05', 'dd.mm')).toEqual({ month: 5, day: 4 })
    expect(parseNoteDate('29.02', 'dd.mm')).toEqual({ month: 2, day: 29 })
  })

  it('falls back to auto-detection when the format does not apply', () => {
    // Unparseable pattern — the value still reads as ISO instead of vanishing.
    expect(parseNoteDate('1990-05-04', 'nonsense')).toEqual({ year: 1990, month: 5, day: 4 })
    // Valid pattern the value does not match.
    expect(parseNoteDate('1990-05-04', 'dd.mm.yyyy')).toEqual({ year: 1990, month: 5, day: 4 })
    // Neither the pattern nor a built-in shape fits.
    expect(parseNoteDate('04/05/1990', 'dd.mm.yyyy')).toBeNull()
  })

  it('rejects impossible values read through a format', () => {
    expect(parseNoteDate('30.02.1990', 'dd.mm.yyyy')).toBeNull()
    expect(parseNoteDate('01.13.1990', 'dd.mm.yyyy')).toBeNull()
  })

  it('rejects impossible and unparseable values', () => {
    expect(parseNoteDate('1990-02-30')).toBeNull()
    expect(parseNoteDate('1990-13-01')).toBeNull()
    expect(parseNoteDate('1991-02-29')).toBeNull()
    expect(parseNoteDate('next tuesday')).toBeNull()
    expect(parseNoteDate('')).toBeNull()
    expect(parseNoteDate(42)).toBeNull()
    expect(parseNoteDate(null)).toBeNull()
    expect(parseNoteDate({})).toBeNull()
  })
})

describe('occurrenceInYear', () => {
  it('zero-pads and rolls the year', () => {
    expect(occurrenceInYear({ year: 1990, month: 1, day: 5 }, 2026)).toBe('2026-01-05')
    expect(occurrenceInYear({ month: 5, day: 4 }, 2027)).toBe('2027-05-04')
  })

  it('folds Feb 29 to Feb 28 in common years only', () => {
    expect(occurrenceInYear({ year: 2000, month: 2, day: 29 }, 2026)).toBe('2026-02-28')
    expect(occurrenceInYear({ year: 2000, month: 2, day: 29 }, 2028)).toBe('2028-02-29')
    expect(occurrenceInYear({ year: 2000, month: 2, day: 29 }, 2100)).toBe('2100-02-28')
  })
})

describe('occurrenceKeys', () => {
  it('places an exact date once, and only when it carries a year', () => {
    expect(occurrenceKeys({ year: 1990, month: 5, day: 4 }, 'exact', [2026, 2027])).toEqual(['1990-05-04'])
    expect(occurrenceKeys({ month: 5, day: 4 }, 'exact', [2026])).toEqual([])
  })

  it('places a day + month date once per year', () => {
    expect(occurrenceKeys({ month: 5, day: 4 }, 'day-month', [2026, 2027])).toEqual(['2026-05-04', '2027-05-04'])
    expect(occurrenceKeys({ year: 2000, month: 2, day: 29 }, 'day-month', [2026])).toEqual(['2026-02-28'])
  })

  it('places a day-only date every month, clamped into short months', () => {
    const keys = occurrenceKeys({ month: 5, day: 31 }, 'day', [2026])
    expect(keys).toHaveLength(12)
    expect(keys[0]).toBe('2026-01-31')
    expect(keys[1]).toBe('2026-02-28')
    expect(keys[3]).toBe('2026-04-30')
    expect(keys[11]).toBe('2026-12-31')
    expect(occurrenceKeys({ month: 1, day: 31 }, 'day', [2028])[1]).toBe('2028-02-29')
  })
})

describe('countAt', () => {
  it('counts elapsed years, and nothing without a source year', () => {
    expect(countAt({ year: 1990, month: 5, day: 4 }, 2026)).toBe(36)
    expect(countAt({ month: 5, day: 4 }, 2026)).toBeNull()
    expect(countAt({ year: 2030, month: 5, day: 4 }, 2026)).toBeNull()
  })
})

describe('activeYears', () => {
  it('spans one year back and two ahead around today and the focused year', () => {
    expect(activeYears(new Date(2026, 0, 1))).toEqual([2025, 2026, 2027, 2028])
    expect(activeYears(new Date(2026, 0, 1), 2026)).toEqual([2025, 2026, 2027, 2028])
    expect(activeYears(new Date(2026, 0, 1), 2030)).toEqual([2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032])
  })

})

describe('matchNotes', () => {
  const notes = [
    entry('Biodiversity/Fern.md', { type: 'Contact', birthdate: '1990-05-04' }),
    entry('Surveys/Canopy Window.md', { type: 'task', due: '2026-05-04' }),
    entry('Biodiversity/Old.md', { type: 'contact' }, { excluded: true }),
    entry('Biodiversity/Draw.canvas', { type: 'contact' }, { kind: 'other' })
  ]

  it('matches case-insensitively and skips excluded or non-note entries', () => {
    expect(matchNotes(notes, source()).map((e) => e.relPath)).toEqual(['Biodiversity/Fern.md'])
  })

  it('honours the folder scope', () => {
    expect(matchNotes(notes, source({ folder: 'Surveys' }))).toEqual([])
    expect(matchNotes(notes, source({ folder: 'Biodiversity/' })).map((e) => e.relPath)).toEqual(['Biodiversity/Fern.md'])
  })

  it('returns nothing for an incomplete source', () => {
    expect(matchNotes(notes, source({ matchValue: '' }))).toEqual([])
    expect(matchNotes(notes, source({ dateField: '' }))).toEqual([])
  })
})

describe('sourceMatchStats', () => {
  const notes = [
    entry('Biodiversity/Fern.md', { type: 'contact', birthdate: '1990-05-04' }),
    entry('Biodiversity/Sky.md', { type: 'contact', birthdate: '--07-12' }),
    entry('Biodiversity/Nil.md', { type: 'contact' }),
    entry('Biodiversity/Bad.md', { type: 'contact', birthdate: '{{date:YYYY-MM-DD}}' }),
    entry('Fungi/Spore Release.md', { type: 'release', birthdate: '2026-06-01' })
  ]

  it('counts matches and how many carry a usable date', () => {
    expect(sourceMatchStats(notes, source())).toEqual({ matched: 4, dated: 2 })
  })

  it('reports zero matches for a value the vault does not use (the plural typo)', () => {
    expect(sourceMatchStats(notes, source({ matchValue: 'contacts' }))).toEqual({ matched: 0, dated: 0 })
  })

  it('reports matches with no usable date when the date property is wrong', () => {
    expect(sourceMatchStats(notes, source({ dateField: 'date' }))).toEqual({ matched: 4, dated: 0 })
  })

  it('does not count a year-less date as usable for an exact rule', () => {
    expect(sourceMatchStats(notes, source({ match: 'exact' }))).toEqual({ matched: 4, dated: 1 })
  })

  it('honours the source format and the folder scope', () => {
    const german = [entry('Biodiversity/Moss.md', { type: 'contact', birthdate: '04.05.1990' })]
    expect(sourceMatchStats(german, source())).toEqual({ matched: 1, dated: 0 })
    expect(sourceMatchStats(german, source({ dateFormat: 'dd.mm.yyyy' }))).toEqual({ matched: 1, dated: 1 })
    expect(sourceMatchStats(notes, source({ folder: 'Fungi' }))).toEqual({ matched: 0, dated: 0 })
  })

  it('stays at zero for an unfinished rule', () => {
    expect(sourceMatchStats(notes, source({ matchValue: '' }))).toEqual({ matched: 0, dated: 0 })
  })
})

describe('showFieldsFor / noteDateTitle', () => {
  const note = entry('Biodiversity/Fern.md', {
    type: 'contact',
    birthdate: '1990-05-04',
    phone: 'radio-000',
    place: [],
    firstName: 'Fern'
  })

  it('keeps present fields in order and drops empty ones', () => {
    const s = source({ showFields: ['phone', 'place', 'missing'] })
    expect(showFieldsFor(note.frontmatter, s)).toEqual([{ key: 'phone', value: 'radio-000' }])
  })

  it('titles from the filename or a property', () => {
    expect(noteDateTitle(note, source())).toBe('Biodiversity/Fern')
    expect(noteDateTitle(note, source({ labelMode: 'property', labelField: 'firstName' }))).toBe('Fern')
    expect(noteDateTitle(note, source({ labelMode: 'property', labelField: 'missing' }))).toBe('Biodiversity/Fern')
  })
})

describe('buildSourceEntries', () => {
  const notes = [
    entry('Biodiversity/Fern.md', { type: 'contact', birthdate: '1990-05-04', phone: 'radio-000' }),
    entry('Biodiversity/Sky.md', { type: 'contact', birthdate: '--07-12' }),
    entry('Biodiversity/Nil.md', { type: 'contact' })
  ]

  it('lands one entry per year for a yearly source, with stable ids', () => {
    const out = buildSourceEntries(notes, source(), [2026, 2027], 2026)
    expect(out.map((e) => `${e.relPath}@${e.date}`)).toEqual([
      'Biodiversity/Fern.md@2026-05-04',
      'Biodiversity/Fern.md@2027-05-04',
      'Biodiversity/Sky.md@2026-07-12',
      'Biodiversity/Sky.md@2027-07-12'
    ])
    expect(new Set(out.map((e) => e.id)).size).toBe(4)
    expect(out[0].id).toBe('notedate:s1:Biodiversity/Fern.md:2026-05-04')
  })

  it('lands a day-only source every month, with one id per occurrence', () => {
    const out = buildSourceEntries(notes, source({ match: 'day' }), [2026], 2026)
    const fern = out.filter((e) => e.relPath === 'Biodiversity/Fern.md')
    expect(fern).toHaveLength(12)
    expect(new Set(out.map((e) => e.id)).size).toBe(out.length)
    expect(fern.map((e) => e.date.slice(5))).toContain('02-04')
    // A count is meaningless monthly — the title stays bare.
    expect(fern[0].title).toBe('Biodiversity/Fern')
  })

  it('starts on the source date and applies the inclusive offset to the viewed year', () => {
    const dated = [entry('Biodiversity/Historical.md', { type: 'contact', birthdate: '1990-05-04' })]
    const out = buildSourceEntries(dated, source({ recurrenceLimitYears: 2 }), [2027, 2028, 2029], 2027)
    expect(out.map((item) => item.date)).toEqual(['2027-05-04', '2028-05-04', '2029-05-04'])

    const monthly = buildSourceEntries(dated, source({ match: 'day', recurrenceLimitYears: 2 }), [2027], 2027)
    expect(monthly.map((item) => item.date)).toEqual([
      '2027-01-04', '2027-02-04', '2027-03-04', '2027-04-04',
      '2027-05-04', '2027-06-04', '2027-07-04', '2027-08-04',
      '2027-09-04', '2027-10-04', '2027-11-04', '2027-12-04'
    ])
  })

  it('repeats without an end when the end offset is empty', () => {
    const dated = [entry('Biodiversity/Recent.md', { type: 'contact', birthdate: '2025-05-04' })]
    const out = buildSourceEntries(dated, source(), [2024, 2025, 2026, 2027, 2028, 2029], 2027)
    expect(out.map((item) => item.date)).toEqual([
      '2025-05-04',
      '2026-05-04',
      '2027-05-04',
      '2028-05-04',
      '2029-05-04'
    ])
  })

  it('reads the date through the source format', () => {
    const german = [entry('Biodiversity/Moss.md', { type: 'contact', birthdate: '04.05.1990' })]
    expect(buildSourceEntries(german, source(), [2026], 2026)).toEqual([])
    const out = buildSourceEntries(german, source({ dateFormat: 'dd.mm.yyyy' }), [2026], 2026)
    expect(out.map((e) => e.date)).toEqual(['2026-05-04'])
    expect(out[0].title).toBe('Biodiversity/Moss (36)')
  })

  it('decorates the title with the count only when the year is known', () => {
    const out = buildSourceEntries(notes, source(), [2026], 2026)
    expect(out[0].title).toBe('Biodiversity/Fern (36)')
    expect(out[1].title).toBe('Biodiversity/Sky')
    expect(out[1].count).toBeNull()
  })

  it('leaves the title bare when showCount is off', () => {
    expect(buildSourceEntries(notes, source({ showCount: false }), [2026], 2026)[0].title).toBe('Biodiversity/Fern')
  })

  it('places a non-repeating source once, on its own date', () => {
    const out = buildSourceEntries(notes, source({ match: 'exact' }), [2026, 2027], 2026)
    expect(out.map((e) => e.date)).toEqual(['1990-05-04'])
    expect(out[0].title).toBe('Biodiversity/Fern')
  })

  it('skips notes whose date field is missing or unparseable', () => {
    const broken = [entry('Biodiversity/Bad.md', { type: 'contact', birthdate: 'sometime' })]
    expect(buildSourceEntries(broken, source(), [2026], 2026)).toEqual([])
    expect(buildSourceEntries(notes, source(), [2026], 2026).some((e) => e.relPath === 'Biodiversity/Nil.md')).toBe(false)
  })

  it('reads optional times and falls back to all-day', () => {
    const timed = [entry('Surveys/Canopy Count.md', { type: 'task', on: '2026-05-04', from: '09:15', to: '25:00' })]
    const s = source({ matchValue: 'task', dateField: 'on', startTimeField: 'from', endTimeField: 'to', match: 'exact' })
    const [item] = buildSourceEntries(timed, s, [2026], 2026)
    expect(item.startTime).toBe('09:15')
    expect(item.endTime).toBeUndefined()
    expect(buildSourceEntries(timed, source({ matchValue: 'task', dateField: 'on', match: 'exact' }), [2026], 2026)[0].startTime)
      .toBeUndefined()
  })

  it('carries the source styling through, including "unset"', () => {
    const styled = buildSourceEntries(notes, source({ color: '#ec4899', icon: 'cake' }), [2026], 2026)[0]
    expect(styled).toMatchObject({ color: '#ec4899', icon: 'cake' })
    const bare = buildSourceEntries(notes, source(), [2026], 2026)[0]
    expect(bare.color).toBeUndefined()
    expect(bare.icon).toBeUndefined()
    expect(bare.fields).toEqual([{ key: 'phone', value: 'radio-000' }])
  })

  it('yields nothing for hidden or invisible sources', () => {
    expect(buildSourceEntries(notes, source({ hidden: true }), [2026], 2026)).toEqual([])
    expect(buildSourceEntries(notes, source({ visible: false }), [2026], 2026)).toEqual([])
  })
})

describe('buildNoteDates', () => {
  it('concatenates every source in order', () => {
    const notes = [
      entry('Biodiversity/Fern.md', { type: 'contact', birthdate: '1990-05-04' }),
      entry('Fungi/Spore Release.md', { type: 'release', date: '2026-06-01' })
    ]
    const out = buildNoteDates(
      notes,
      [source(), source({ id: 's2', matchValue: 'release', dateField: 'date', match: 'exact' })],
      [2026],
      2026
    )
    expect(out.map((e) => e.sourceId)).toEqual(['s1', 's2'])
  })
})

describe('noteDatesSignature', () => {
  const notes = [entry('Animalia/Red Fox.md', { type: 'contact', birthdate: '1990-05-04', phone: 'field-radio', city: 'Fern Reserve' })]

  it('changes when a depended-on value changes', () => {
    const before = noteDatesSignature(notes, [source()])
    const moved = [entry('Animalia/Red Fox.md', { type: 'contact', birthdate: '1990-05-05', phone: 'field-radio', city: 'Fern Reserve' })]
    expect(noteDatesSignature(moved, [source()])).not.toBe(before)
  })

  it('changes when the source config changes', () => {
    const before = noteDatesSignature(notes, [source()])
    expect(noteDatesSignature(notes, [source({ showCount: false })])).not.toBe(before)
    expect(noteDatesSignature(notes, [source({ icon: 'cake' })])).not.toBe(before)
    expect(noteDatesSignature(notes, [source({ match: 'exact' })])).not.toBe(before)
    expect(noteDatesSignature(notes, [source({ dateFormat: 'dd.mm.yyyy' })])).not.toBe(before)
  })

  it('stays stable across an unrelated frontmatter edit', () => {
    const before = noteDatesSignature(notes, [source()])
    const edited = [entry('Animalia/Red Fox.md', { type: 'contact', birthdate: '1990-05-04', phone: 'field-radio', city: 'Moss Basin' })]
    expect(noteDatesSignature(edited, [source()])).toBe(before)
  })
})
