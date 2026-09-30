import type { IndexEntry } from '@valley/plugin-sdk/types'

export type NoteDateIndexEntry = Pick<IndexEntry, 'relPath' | 'title' | 'kind' | 'excluded' | 'frontmatter'>
import { asBool, asString, asTime } from '@valley/plugin-sdk/normalize'
import { nextPaletteColor } from '@valley/plugin-sdk/palette'
import { daysInMonth, isRealCalendarDate, parseDateByPattern } from '@valley/plugin-sdk/datePattern'

/**
 * Which parts of the note's date must equal the day it lands on — and therefore
 * how often it comes round: the full date once (`exact`), day + month every year
 * (birthdays), or the day of the month every month.
 */
export type NoteDateMatch = 'exact' | 'day-month' | 'day'
export type NoteDateLabelMode = 'filename' | 'property'

const MATCH_MODES: NoteDateMatch[] = ['exact', 'day-month', 'day']

export const MAX_RECURRENCE_LIMIT_YEARS = 100

/**
 * A user-configured "note date source": scrape every note whose frontmatter
 * `matchKey` equals `matchValue` (e.g. `type: contact`), read a date out of
 * `dateField` (plus optional time fields) and put a read-only entry on the
 * calendar — birthdays, deadlines, anniversaries, release dates.
 *
 * Styling is optional: an unset `color` falls through to priority, status and
 * the neutral default; an unset `icon` renders a plain text chip. Definitions
 * live in Calendar's durable `note_date_sources` dataset.
 */
export interface NoteDateSource {
  id: string
  /** Shown in the settings row and the Upcoming list. */
  title: string
  /** Frontmatter key to match on (e.g. "type"). */
  matchKey: string
  /** Value matchKey must equal, case-insensitive. */
  matchValue: string
  /** Optional vault-relative folder scope. */
  folder?: string
  /** Frontmatter key holding the date (`YYYY-MM-DD`, `--MM-DD`, …). */
  dateField: string
  /** Pattern the date value is written in (`dd.mm.yyyy`) — unset ⇒ auto-detect. */
  dateFormat?: string
  /** Optional frontmatter key holding a `HH:MM` start time. */
  startTimeField?: string
  /** Optional frontmatter key holding a `HH:MM` end time. */
  endTimeField?: string
  /** How much of the date must match — and so how often the entry lands. */
  match: NoteDateMatch
  /** Optional inclusive end offset from the viewed year: 2 materializes the viewed year through viewed year + 2. */
  recurrenceLimitYears?: number
  /** 'day-month' only — append the year count, e.g. "Ada (36)". */
  showCount: boolean
  labelMode: NoteDateLabelMode
  /** Frontmatter key used as the title when labelMode === 'property'. */
  labelField?: string
  /** Frontmatter keys surfaced on the entry, in order. */
  showFields: string[]
  /** Optional chip colour — unset ⇒ priority/status/neutral fallback. */
  color?: string
  /** Optional outline colour — unset ⇒ no outline. */
  borderColor?: string
  /** Optional glyph id (see noteDateGlyphs()) — unset ⇒ text-only chip. */
  icon?: string
  /** false → entries hidden from the calendar (kept in settings). */
  visible: boolean
  /** true → source hidden from the calendar entirely. */
  hidden: boolean
}

/** One materialized calendar entry derived from a note. */
export interface NoteDateEntry {
  /** `notedate:<sourceId>:<relPath>:<year>` — stable across rebuilds. */
  id: string
  sourceId: string
  relPath: string
  /** `YYYY-MM-DD`. */
  date: string
  startTime?: string
  endTime?: string
  /** Already count-decorated when the source asks for it. */
  title: string
  /** Years since the source date, or null when the value carries no year. */
  count: number | null
  color?: string
  borderColor?: string
  icon?: string
  fields: { key: string; value: string }[]
}

/** A date without a required year: `--05-04` (unknown birth year) is valid. */
export interface DateParts {
  year?: number
  month: number
  day: number
}

/** Render a frontmatter value as a single-line display string. */
export function toDisplay(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(toDisplay).filter(Boolean).join(', ')
  if (typeof value === 'object') return ''
  return String(value)
}

/** The scalar text of a frontmatter value: the string, or a list's first entry. */
function firstText(value: unknown): string {
  if (Array.isArray(value)) {
    const hit = value.find((v) => typeof v === 'string' && v.trim())
    return typeof hit === 'string' ? hit.trim() : ''
  }
  return asString(value).trim()
}

/** Parse a comma/newline-separated "field list" input into trimmed keys. */
export function parseFieldList(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

let counter = 0
/** A prefilled source for the settings "Add source" button. */
export function defaultNoteDateSource(): NoteDateSource {
  counter += 1
  return {
    id: `notedate-${Date.now().toString(36)}-${counter}`,
    title: '',
    matchKey: 'type',
    matchValue: '',
    dateField: 'date',
    match: 'exact',
    showCount: true,
    labelMode: 'filename',
    showFields: [],
    visible: true,
    hidden: false
  }
}

/**
 * The shapes worth offering as a starting point, because every one of them takes
 * five fields to get right by hand and gets them wrong the same way.
 *
 * A descriptor carries a stable English `id` and a `labelKey`: the id is what a
 * caller matches on, the key is what the menu renders. The `title` that lands on
 * disk stays English — it is plugin data, not chrome.
 */
export interface NoteDatePreset {
  id: string
  labelKey: string
  /** Bundled English fallback, for a host that has no catalog loaded yet. */
  label: string
  patch: Partial<NoteDateSource>
}

export const NOTE_DATE_PRESETS: readonly NoteDatePreset[] = [
  {
    id: 'birthdays',
    labelKey: 'calendar.noteDatePreset.birthdays',
    label: 'Birthdays',
    patch: {
      title: 'Birthdays',
      matchKey: 'type',
      matchValue: 'contact',
      dateField: 'birthdate',
      // A birthday recurs on its day and month; the year it carries is the one
      // `showCount` turns into an age.
      match: 'day-month',
      showCount: true,
      icon: 'cake'
    }
  },
  {
    id: 'anniversaries',
    labelKey: 'calendar.noteDatePreset.anniversaries',
    label: 'Anniversaries',
    patch: {
      title: 'Anniversaries',
      matchKey: 'type',
      matchValue: 'anniversary',
      dateField: 'date',
      match: 'day-month',
      showCount: true,
      icon: 'heart'
    }
  },
  {
    id: 'deadlines',
    labelKey: 'calendar.noteDatePreset.deadlines',
    label: 'Deadlines',
    patch: {
      title: 'Deadlines',
      matchKey: 'type',
      matchValue: 'project',
      dateField: 'due',
      // A deadline happens once — recurring it yearly would be a lie.
      match: 'exact',
      showCount: false,
      icon: 'flag'
    }
  }
]

/**
 * A new source built from a preset, coloured so it cannot collide with one the
 * user already has. An unknown id yields the blank source, which is the right
 * failure mode: the button still adds a row.
 */
export function presetNoteDateSource(presetId: string, existing: readonly NoteDateSource[]): NoteDateSource {
  const base = defaultNoteDateSource()
  const preset = NOTE_DATE_PRESETS.find((entry) => entry.id === presetId)
  if (!preset) return base
  const used = existing.map((source) => source.color).filter((color): color is string => !!color)
  return { ...base, ...preset.patch, color: nextPaletteColor(used) }
}

function asRecurrenceLimitYears(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(MAX_RECURRENCE_LIMIT_YEARS, Math.floor(value)))
}

function asMatchMode(value: unknown, fallback: NoteDateMatch): NoteDateMatch {
  const explicit = asString(value).trim() as NoteDateMatch
  if (MATCH_MODES.includes(explicit)) return explicit
  return fallback
}

/** Coerce a persisted (or partial) record into a fully-defaulted source. */
export function sanitizeNoteDateSource(raw: Record<string, unknown>): NoteDateSource {
  const base = defaultNoteDateSource()
  // `hoverFields` is the Map-pins name — accept it so a hand-copied row works.
  const show = raw.showFields ?? raw.hoverFields
  return {
    id: asString(raw.id, base.id),
    title: asString(raw.title).trim(),
    matchKey: asString(raw.matchKey, base.matchKey).trim(),
    matchValue: asString(raw.matchValue).trim(),
    folder: asString(raw.folder).trim() || undefined,
    dateField: asString(raw.dateField, base.dateField).trim() || base.dateField,
    dateFormat: asString(raw.dateFormat).trim() || undefined,
    startTimeField: asString(raw.startTimeField).trim() || undefined,
    endTimeField: asString(raw.endTimeField).trim() || undefined,
    match: asMatchMode(raw.match, base.match),
    recurrenceLimitYears: asRecurrenceLimitYears(raw.recurrenceLimitYears),
    showCount: asBool(raw.showCount, base.showCount),
    labelMode:
      raw.labelMode === 'property' || (raw.labelMode == null && Boolean(asString(raw.labelField).trim()))
        ? 'property'
        : 'filename',
    labelField: asString(raw.labelField).trim() || undefined,
    showFields: Array.isArray(show)
      ? show.map((h) => asString(h).trim()).filter(Boolean)
      : parseFieldList(asString(show)),
    color: asString(raw.color).trim() || undefined,
    borderColor: asString(raw.borderColor).trim() || undefined,
    icon: asString(raw.icon).trim() || undefined,
    visible: raw.visible !== false,
    hidden: raw.hidden === true
  }
}

function underFolder(relPath: string, folder: string | undefined): boolean {
  if (!folder) return true
  return relPath === folder || relPath.startsWith(folder.replace(/\/+$/, '') + '/')
}

/** True when a source is complete enough to match notes. */
export function isSourceActive(source: NoteDateSource): boolean {
  return Boolean(source.matchKey && source.matchValue && source.dateField)
}

/**
 * Every non-excluded note matching a source's frontmatter predicate (and its
 * optional folder scope). Reads the pre-parsed index — no file I/O.
 */
export function matchNotes(entries: readonly NoteDateIndexEntry[], source: NoteDateSource): NoteDateIndexEntry[] {
  if (!isSourceActive(source)) return []
  const key = source.matchKey
  const want = source.matchValue.trim().toLowerCase()
  const out: NoteDateIndexEntry[] = []
  for (const entry of entries) {
    if (entry.excluded || entry.kind !== 'note') continue
    if (!underFolder(entry.relPath, source.folder)) continue
    const value = entry.frontmatter?.[key]
    if (String(value ?? '').trim().toLowerCase() !== want) continue
    out.push(entry)
  }
  return out
}

/** What a rule currently finds in the vault — the settings row's feedback line. */
export interface SourceMatchStats {
  /** Notes whose frontmatter satisfies the predicate. */
  matched: number
  /** Of those, how many carry a date this rule can actually place. */
  dated: number
}

/**
 * Why a rule produces the entries it does. A mistyped `matchValue` or
 * `dateField` otherwise fails in complete silence — this is what the Note dates
 * settings row reports so a rule that finds nothing says so.
 */
export function sourceMatchStats(entries: readonly NoteDateIndexEntry[], source: NoteDateSource): SourceMatchStats {
  const notes = matchNotes(entries, source)
  let dated = 0
  for (const entry of notes) {
    const parts = parseNoteDate(entry.frontmatter?.[source.dateField], source.dateFormat)
    // An `exact` rule cannot place a year-less date — counting it as usable would lie.
    if (parts && (source.match !== 'exact' || parts.year != null)) dated += 1
  }
  return { matched: notes.length, dated }
}

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/
const NO_YEAR_DATE = /^(?:--)?(\d{1,2})-(\d{1,2})$/

/**
 * Parse a frontmatter date value. Accepts `YYYY-MM-DD` (optionally with a time
 * suffix), the vCard-style year-less `--MM-DD` (and bare `MM-DD`), and a real
 * `Date` — never `new Date(string)`, whose UTC/locale parsing shifts the day.
 *
 * A source's own `format` (`dd.mm.yyyy`) is tried first; an unparseable value
 * still falls through to the built-in shapes, so a mistyped pattern degrades to
 * auto-detection instead of emptying the calendar.
 */
export function parseNoteDate(value: unknown, format?: string): DateParts | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() }
  }
  const raw = firstText(value)
  if (!raw) return null
  if (format) {
    const byPattern = parseDateByPattern(raw, format)
    if (byPattern) return byPattern
  }
  const iso = ISO_DATE.exec(raw)
  if (iso) {
    const [, y, m, d] = iso
    const parts = { year: Number(y), month: Number(m), day: Number(d) }
    return isRealCalendarDate(parts.year, parts.month, parts.day) ? parts : null
  }
  const noYear = NO_YEAR_DATE.exec(raw)
  if (noYear) {
    const [, m, d] = noYear
    const parts = { month: Number(m), day: Number(d) }
    // Validate against a leap year so `--02-29` survives.
    return isRealCalendarDate(2000, parts.month, parts.day) ? parts : null
  }
  return null
}

/**
 * The `YYYY-MM-DD` key this date lands on in `year`. The day folds to the last
 * day of the month when the target month is shorter — Feb 29 to Feb 28 in a
 * common year (string arithmetic; Date maths would roll it to Mar 1).
 */
export function occurrenceInYear(parts: DateParts, year: number): string {
  return occurrenceKey(year, parts.month, parts.day)
}

/** One `YYYY-MM-DD` key, with the day clamped into the month. */
function occurrenceKey(year: number, month: number, day: number): string {
  const clamped = Math.min(day, daysInMonth(year, month))
  return `${year}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`
}

/**
 * Every day this date lands on across `years`, per its match mode: the full
 * date once, day + month once a year, or the day of the month every month.
 */
export function occurrenceKeys(parts: DateParts, match: NoteDateMatch, years: number[]): string[] {
  if (match === 'exact') {
    return parts.year == null ? [] : [occurrenceInYear(parts, parts.year)]
  }
  if (match === 'day-month') return years.map((year) => occurrenceInYear(parts, year))
  const out: string[] = []
  for (const year of years) {
    for (let month = 1; month <= 12; month += 1) out.push(occurrenceKey(year, month, parts.day))
  }
  return out
}

/** Years elapsed at `year` (an age, for birthdays); null without a source year. */
export function countAt(parts: DateParts, year: number): number | null {
  if (parts.year == null) return null
  const diff = year - parts.year
  return diff < 0 ? null : diff
}

/**
 * The years materialized around today and the cursor. The extra two future
 * years let a source's viewed-year-relative range materialize without another
 * data pass when the user pages the Calendar.
 */
export function activeYears(today: Date, focusYear?: number): number[] {
  const years = new Set<number>()
  const base = today.getFullYear()
  for (const y of [base - 1, base, base + 1, base + 2]) years.add(y)
  if (focusYear != null && Number.isFinite(focusYear)) {
    for (const y of [focusYear - 1, focusYear, focusYear + 1, focusYear + 2]) years.add(y)
  }
  return [...years].sort((a, b) => a - b)
}

/** The rows surfaced on an entry: the configured fields with present values. */
export function showFieldsFor(
  fm: Record<string, unknown> | undefined,
  source: NoteDateSource
): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = []
  for (const key of source.showFields) {
    const value = toDisplay(fm?.[key])
    if (value) out.push({ key, value })
  }
  return out
}

/** The entry's title: the `labelField` value in 'property' mode, else the note title. */
export function noteDateTitle(entry: NoteDateIndexEntry, source: NoteDateSource): string {
  if (source.labelMode === 'property' && source.labelField) {
    const value = toDisplay(entry.frontmatter?.[source.labelField])
    if (value) return value
  }
  return entry.title
}

/**
 * Materialize one source over `years` per its match mode (see
 * {@link occurrenceKeys}). An `exact` source is skipped when its value carries
 * no year — there is nothing to place it in.
 */
export function buildSourceEntries(
  entries: readonly NoteDateIndexEntry[],
  source: NoteDateSource,
  years: number[],
  viewedYear: number
): NoteDateEntry[] {
  if (source.hidden || !source.visible) return []
  const out: NoteDateEntry[] = []
  for (const entry of matchNotes(entries, source)) {
    const fm = entry.frontmatter
    const parts = parseNoteDate(fm?.[source.dateField], source.dateFormat)
    if (!parts) continue
    const sourceStart = parts.year == null ? undefined : occurrenceInYear(parts, parts.year)
    const maxYear = source.recurrenceLimitYears == null
      ? undefined
      : viewedYear + source.recurrenceLimitYears
    const occurrences = occurrenceKeys(parts, source.match, years).filter((date) => {
      if (source.match === 'exact') return true
      const year = Number(date.slice(0, 4))
      return (maxYear == null || year <= maxYear) &&
        (sourceStart == null || date >= sourceStart)
    })
    if (!occurrences.length) continue
    const startTime = source.startTimeField ? asTime(fm?.[source.startTimeField]) : undefined
    const endTime = source.endTimeField ? asTime(fm?.[source.endTimeField]) : undefined
    const label = noteDateTitle(entry, source)
    const fields = showFieldsFor(fm, source)
    for (const date of occurrences) {
      const count = countAt(parts, Number(date.slice(0, 4)))
      const showCount = source.match === 'day-month' && source.showCount && count != null
      out.push({
        id: `notedate:${source.id}:${entry.relPath}:${date}`,
        sourceId: source.id,
        relPath: entry.relPath,
        date,
        startTime,
        endTime,
        title: showCount ? `${label} (${count})` : label,
        count,
        color: source.color,
        borderColor: source.borderColor,
        icon: source.icon,
        fields
      })
    }
  }
  return out
}

/** Every entry across all sources, in source order. */
export function buildNoteDates(
  entries: readonly NoteDateIndexEntry[],
  sources: NoteDateSource[],
  years: number[],
  viewedYear: number
): NoteDateEntry[] {
  return sources.flatMap((source) => buildSourceEntries(entries, source, years, viewedYear))
}

/**
 * A cheap fingerprint of everything the derived entries depend on: source config
 * plus each matched note's date/time/label/shown values. Unchanged ⇒ an index
 * broadcast can reuse the previous entries. The years window is deliberately
 * absent — it is a render input, not an index fact.
 */
export function noteDatesSignature(entries: readonly NoteDateIndexEntry[], sources: NoteDateSource[]): string {
  const parts: unknown[] = []
  for (const source of sources) {
    parts.push(
      JSON.stringify(source)
    )
    for (const entry of matchNotes(entries, source)) {
      const fm = entry.frontmatter
      parts.push(
        entry.relPath,
        parseNoteDate(fm?.[source.dateField], source.dateFormat),
        source.startTimeField ? asTime(fm?.[source.startTimeField]) : null,
        source.endTimeField ? asTime(fm?.[source.endTimeField]) : null,
        noteDateTitle(entry, source)
      )
      for (const key of source.showFields) parts.push(toDisplay(fm?.[key]))
    }
  }
  return JSON.stringify(parts)
}
