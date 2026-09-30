import ICAL from 'ical.js'
import type { CalendarItemPatch } from '@valley/plugin-sdk'
import { api } from './runtime'
import { addDays } from './dateMath'

export interface CalendarFileEntry {
  id: string
  path: string
  uid: string
  component: number
  period?: number
  recurrenceId?: string
  recurring: boolean
  title: string
  date: string
  endDate?: string
  startTime?: string
  endTime?: string
  note: string
  location?: { name: string }
  availability?: string
  tags?: string[]
  timeZone?: string
  urls?: string[]
  attachments?: string[]
  alarmTimes?: { id: string; at: number }[]
}

export interface ParsedCalendarFile {
  entries: CalendarFileEntry[]
  errors: string[]
}

const datePart = (time: ICAL.Time): string => time.toString().slice(0, 10)
const clockPart = (time: ICAL.Time): string | undefined => time.isDate ? undefined : time.toString().slice(11, 16)

function legacyRule(value: string): string {
  const match = /^(D|W|MP|MD|YM|YD)(\d+)(?:\s+(.*))?$/.exec(value)
  if (!match) throw new Error(`Unsupported vCalendar recurrence: ${value}`)
  const frequency: Record<string, string> = { D: 'DAILY', W: 'WEEKLY', MP: 'MONTHLY', MD: 'MONTHLY', YM: 'YEARLY', YD: 'YEARLY' }
  const words = (match[3] ?? '').split(/\s+/).filter(Boolean)
  const parts = [`FREQ=${frequency[match[1]]}`, `INTERVAL=${match[2]}`]
  const values: string[] = []
  for (const word of words) {
    if (/^#\d+$/.test(word)) { if (word !== '#0') parts.push(`COUNT=${word.slice(1)}`) }
    else if (/^\d{8}(T\d{6}Z?)?$/.test(word)) parts.push(`UNTIL=${word}`)
    else values.push(word)
  }
  if (values.length) {
    if (match[1] === 'W' && values.every(value => /^(MO|TU|WE|TH|FR|SA|SU)$/.test(value))) parts.push(`BYDAY=${values.join(',')}`)
    else if (['MD', 'YM', 'YD'].includes(match[1]) && values.every(value => /^-?\d+$/.test(value))) parts.push(`${{ MD: 'BYMONTHDAY', YM: 'BYMONTH', YD: 'BYYEARDAY' }[match[1]]}=${values.join(',')}`)
    else throw new Error(`Unsupported vCalendar recurrence: ${value}`)
  }
  return parts.join(';')
}

function parseRoot(raw: string): ICAL.Component {
  const unfolded = raw.replace(/\r?\n[ \t]/g, '')
  const legacy = /^VERSION:1\.0\s*$/m.test(unfolded)
  if (legacy && /^TZ:/m.test(unfolded)) throw new Error('Legacy document-wide timezones are unsupported; the source remains unchanged.')
  if (/;ENCODING=QUOTED-PRINTABLE[:;]/i.test(unfolded)) throw new Error('Quoted-printable calendar properties are unsupported; the source remains unchanged.')
  const normalized = legacy ? unfolded.replace(/^RRULE:(.+)$/gm, (_, rule: string) => `RRULE:${legacyRule(rule.trim())}`) : raw
  const root = new ICAL.Component(ICAL.parse(normalized))
  if (root.name !== 'vcalendar') throw new Error('Expected a VCALENDAR document.')
  if (!['1.0', '2.0'].includes(String(root.getFirstPropertyValue('version')))) throw new Error('Unsupported calendar version.')
  return root
}

function instant(time: ICAL.Time): number {
  return time.zone.tzid === 'floating' || time.zone.tzid === 'local' ? new Date(time.toString()).getTime() : time.toUnixTime() * 1000
}

function alarmTimes(event: ICAL.Event, start: ICAL.Time, end: ICAL.Time): { id: string; at: number }[] {
  return event.component.getAllSubcomponents('valarm').flatMap((alarm, index) => {
    if (!['DISPLAY', 'AUDIO'].includes(String(alarm.getFirstPropertyValue('action')).toUpperCase())) return []
    const trigger = alarm.getFirstProperty('trigger')
    const value = trigger?.getFirstValue()
    if (!trigger || !value) return []
    const at = value instanceof ICAL.Duration ? instant(trigger.getParameter('related') === 'END' ? end : start) + value.toSeconds() * 1000 : value instanceof ICAL.Time ? instant(value) : NaN
    return Number.isFinite(at) ? [{ id: String(index), at }] : []
  })
}

function entryFor(path: string, component: number, event: ICAL.Event, start: ICAL.Time, end: ICAL.Time, recurrenceId?: string): CalendarFileEntry {
  const date = datePart(start)
  const endDate = end.isDate ? addDays(datePart(end), -1) : datePart(end)
  return {
    id: `${path}|${event.uid || component}|${recurrenceId ?? ''}`,
    alarmTimes: alarmTimes(event, start, end),
    path, uid: event.uid, component, recurrenceId, recurring: event.isRecurring() || Boolean(recurrenceId),
    urls: event.component.getAllProperties('url').map(property => String(property.getFirstValue())),
    attachments: event.component.getAllProperties('attach').filter(property => property.type === 'uri').map(property => String(property.getFirstValue())),
    title: event.summary || date, tags: event.component.getAllProperties('categories').flatMap(property => property.getValues().map(String)), date, endDate: endDate > date ? endDate : undefined,
    timeZone: start.zone.tzid, startTime: clockPart(start), endTime: clockPart(end), note: event.description ?? '',
    ...(event.location ? { location: { name: event.location } } : {})
  }
}

export function parseCalendarFile(raw: string, path: string, startDate: string, endDate: string): ParsedCalendarFile {
  const result: ParsedCalendarFile = { entries: [], errors: [] }
  let root: ICAL.Component
  try { root = parseRoot(raw) } catch (error) { return { entries: [], errors: [String(error)] } }
  for (const zone of root.getAllSubcomponents('vtimezone')) {
    const id = String(zone.getFirstPropertyValue('tzid') ?? '')
    if (id) ICAL.TimezoneService.register(new ICAL.Timezone({ component: zone, tzid: id }), id)
  }
  const components = root.getAllSubcomponents()
  const events = components.filter(component => component.name === 'vevent')
  for (const component of components) {
    try {
      const index = components.indexOf(component)
      if (!['vevent', 'vfreebusy', 'vtimezone'].includes(component.name)) result.errors.push(`Unsupported ${component.name.toUpperCase()} component is preserved unchanged.`)
      if (component.name === 'vfreebusy') {
        const uid = String(component.getFirstPropertyValue('uid') ?? index)
        let periodIndex = 0
        for (const property of component.getAllProperties('freebusy')) {
          for (const value of property.getValues()) {
            const period = value as ICAL.Period
            const start = period.start, end = period.getEnd()
            const position = periodIndex++
            if (datePart(end) < startDate || datePart(start) > endDate) continue
            const availability = String(property.getParameter('fbtype') ?? 'BUSY')
            result.entries.push({ id: `${path}|${uid}|${position}`, path, uid, component: index, period: position, recurring: false, title: availability, availability, date: datePart(start), endDate: datePart(end) > datePart(start) ? datePart(end) : undefined, timeZone: start.zone.tzid, startTime: clockPart(start), endTime: clockPart(end), note: String(component.getFirstPropertyValue('comment') ?? '') })
          }
        }
      } else if (component.name === 'vevent' && !component.hasProperty('recurrence-id')) {
        const event = new ICAL.Event(component)
        for (const exception of events.filter(other => other.hasProperty('recurrence-id') && other.getFirstPropertyValue('uid') === event.uid)) event.relateException(new ICAL.Event(exception))
        if (event.isRecurring()) {
          const iterator = event.iterator()
          let occurrence: ICAL.Time | null, count = 0
          while ((occurrence = iterator.next())) {
            if (++count > 100000) throw new Error('Recurrence exceeds the supported expansion limit.')
            if (datePart(occurrence) > endDate) break
            const details = event.getOccurrenceDetails(occurrence)
            if (datePart(details.endDate) < startDate) continue
            if (details.item.component.getFirstPropertyValue('status') === 'CANCELLED') continue
            result.entries.push(entryFor(path, index, details.item, details.startDate, details.endDate, occurrence.toString()))
          }
        } else if (datePart(event.endDate) >= startDate && datePart(event.startDate) <= endDate && component.getFirstPropertyValue('status') !== 'CANCELLED') {
          result.entries.push(entryFor(path, index, event, event.startDate, event.endDate))
        }
      }
    } catch (error) { result.errors.push(String(error)) }
  }
  return result
}

function timeFor(date: string, time: string | undefined, previous: ICAL.Time): ICAL.Time {
  const next = ICAL.Time.fromString(time ? `${date}T${time}:00` : date, undefined)
  if (time) { next.zone = previous.zone; if (time === clockPart(previous)) next.second = previous.second }
  return next
}

function preserveCalendar(raw: string, original: ICAL.Component, edited: ICAL.Component): string {
  const before = original.getAllSubcomponents(), after = edited.getAllSubcomponents()
  const lines = raw.match(/[^\r\n]*(?:\r\n|\n|$)/g)?.filter(Boolean) ?? []
  let depth = 0, component = -1, block: string[] = [], output = ''
  for (const line of lines) {
    const begin = /^BEGIN:/i.test(line), end = /^END:/i.test(line)
    if (begin) depth++
    if (depth >= 2) {
      if (begin && depth === 2) { component++; block = [] }
      block.push(line)
      if (end && depth === 2) {
        const old = before[component]
        const key = (value: ICAL.Component): string => `${value.name}|${value.getFirstPropertyValue('uid') ?? value.getFirstPropertyValue('tzid') ?? ''}|${value.getFirstPropertyValue('recurrence-id') ?? ''}`
        const next = after.find(value => key(value) === key(old))
        let serialized = next?.toString()
        if (serialized && /^VERSION:1\.0\s*$/m.test(raw) && old.getFirstProperty('rrule')?.toICALString() === next?.getFirstProperty('rrule')?.toICALString()) {
          const legacyRule = block.join('').replace(/\r?\n[ \t]/g, '').match(/^RRULE:(.+)$/m)?.[1].trim()
          if (legacyRule) serialized = serialized.replace(/^RRULE:.+$/m, `RRULE:${legacyRule}`)
        }
        output += old?.toString() === next?.toString() ? block.join('') : serialized ? serialized + '\r\n' : ''
      }
    } else {
      if (end && depth === 1) for (const added of after.slice(before.length)) output += added.toString() + '\r\n'
      output += line
    }
    if (end) depth--
  }
  return output
}

export function editCalendarFile(raw: string, entry: CalendarFileEntry, patch: CalendarItemPatch, scope: 'occurrence' | 'series'): string {
  const legacy = /^VERSION:1\.0\s*$/m.test(raw)
  const root = parseRoot(raw)
  const original = new ICAL.Component(JSON.parse(JSON.stringify(root.toJSON())))
  let component = root.getAllSubcomponents()[entry.component]
  if (!component || String(component.getFirstPropertyValue('uid') ?? entry.component) !== String(entry.uid || entry.component)) throw new Error('Calendar component changed. Reload before saving.')
  if (entry.period !== undefined) {
    let index = 0
    for (const property of component.getAllProperties('freebusy')) {
      const values = property.getValues() as ICAL.Period[]
      for (let i = 0; i < values.length; i++, index++) {
        if (index !== entry.period) continue
        const previous = values[i]
        const start = timeFor(patch.date ?? entry.date, patch.startTime ?? entry.startTime, previous.start)
        const end = timeFor(patch.endDate ?? entry.endDate ?? patch.date ?? entry.date, patch.endTime ?? entry.endTime, previous.getEnd())
        if (start.compare(end) >= 0) throw new Error('Availability must end after it starts.')
        values[i] = new ICAL.Period({ start, end })
        property.setValues(values)
        if (patch.note !== undefined) component.updatePropertyWithValue('comment', patch.note)
        return preserveCalendar(raw, original, root)
      }
    }
    throw new Error('Availability period no longer exists.')
  }
  if (scope === 'occurrence' && entry.recurrenceId) {
    const existing = root.getAllSubcomponents('vevent').find(candidate => candidate.getFirstPropertyValue('uid') === entry.uid && String(candidate.getFirstPropertyValue('recurrence-id')) === entry.recurrenceId)
    if (existing) component = existing
    else {
      component = new ICAL.Component(JSON.parse(JSON.stringify(component.toJSON())))
      for (const name of ['rrule', 'rdate', 'exdate']) component.removeAllProperties(name)
      const recurrence = ICAL.Time.fromString(entry.recurrenceId, undefined)
      recurrence.zone = new ICAL.Event(root.getAllSubcomponents()[entry.component]).startDate.zone
      component.updatePropertyWithValue('recurrence-id', recurrence)
      if (!recurrence.isDate && !['UTC', 'floating'].includes(recurrence.zone.tzid)) component.getFirstProperty('recurrence-id')!.setParameter('tzid', recurrence.zone.tzid)
      if (legacy) {
        const master = root.getAllSubcomponents()[entry.component]
        const excluded = new ICAL.Property('exdate')
        excluded.setValue(recurrence)
        if (!recurrence.isDate && !['UTC', 'floating'].includes(recurrence.zone.tzid)) excluded.setParameter('tzid', recurrence.zone.tzid)
        master.addProperty(excluded)
        component.removeAllProperties('recurrence-id')
        component.updatePropertyWithValue('uid', crypto.randomUUID())
      }
      root.addSubcomponent(component)
    }
  }
  const event = new ICAL.Event(component)
  let day = patch.date ?? entry.date
  let lastDay = patch.endDate ?? day
  if (scope === 'series' && entry.recurrenceId) {
    const shift = Math.round((Date.parse(day) - Date.parse(entry.date)) / 86400000)
    const span = Math.round((Date.parse(lastDay) - Date.parse(day)) / 86400000)
    day = addDays(datePart(event.startDate), shift)
    lastDay = addDays(day, span)
  }
  const start = timeFor(day, patch.startTime, event.startDate)
  const end = timeFor(lastDay, patch.endTime, event.endDate)
  if (end.isDate) end.adjust(1, 0, 0, 0)
  if (start.compare(end) >= 0) throw new Error('The event must end after it starts.')
  event.startDate = start
  event.endDate = end
  if (patch.title !== undefined) event.summary = patch.title
  if (patch.note !== undefined) event.description = patch.note
  if (patch.location !== undefined) event.location = patch.location?.name ?? ''
  if (patch.urls !== undefined) {
    component.removeAllProperties('url')
    for (const url of patch.urls) component.addPropertyWithValue('url', url)
  }
  if (patch.attachments !== undefined) {
    for (const attachment of component.getAllProperties('attach')) if (attachment.type === 'uri') component.removeProperty(attachment)
    for (const attachment of patch.attachments) component.addPropertyWithValue('attach', attachment)
  }
  if (patch.tags !== undefined) {
    component.removeAllProperties('categories')
    if (patch.tags.length) { const categories = new ICAL.Property('categories'); categories.setValues(patch.tags); component.addProperty(categories) }
  }
  component.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true))
  return preserveCalendar(raw, original, root)
}

export async function saveCalendarFile(entry: CalendarFileEntry, patch: CalendarItemPatch, scope: 'occurrence' | 'series', baseline: { content: string; revisionToken: string }): Promise<void> {
  const content = editCalendarFile(baseline.content, entry, patch, scope)
  const result = await api.vault.writeTextDocumentGuarded(entry.path, content, baseline.revisionToken)
  if (!result.ok || result.editorConflict) throw new Error('Calendar file changed or could not be saved. Your draft is preserved.')
}

export function appendCalendarFile(raw: string, path: string, patch: CalendarItemPatch): string {
  const root = parseRoot(raw)
  const original = new ICAL.Component(JSON.parse(JSON.stringify(root.toJSON())))
  const availability = /\.ifb$/i.test(path)
  const component = new ICAL.Component(availability ? 'vfreebusy' : 'vevent')
  component.updatePropertyWithValue('uid', crypto.randomUUID())
  component.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true))
  const date = patch.date
  if (!date) throw new Error('An event date is required.')
  const start = timeFor(date, patch.startTime, ICAL.Time.fromString(date, undefined))
  const end = timeFor(patch.endDate ?? date, patch.endTime, start)
  if (end.isDate) end.adjust(1, 0, 0, 0)
  if (start.compare(end) >= 0) throw new Error('The event must end after it starts.')
  if (availability) {
    if (start.isDate || end.isDate) throw new Error('Availability requires start and end times.')
    const property = new ICAL.Property('freebusy')
    property.setParameter('fbtype', 'BUSY')
    start.zone = ICAL.Timezone.utcTimezone
    end.zone = ICAL.Timezone.utcTimezone
    property.setValue(new ICAL.Period({ start, end }))
    if (patch.note) component.updatePropertyWithValue('comment', patch.note)
    component.addProperty(property)
  } else {
    const event = new ICAL.Event(component)
    event.startDate = start; event.endDate = end
    event.summary = patch.title ?? ''
    event.description = patch.note ?? ''
    if (patch.location) event.location = patch.location.name
    for (const url of patch.urls ?? []) component.addPropertyWithValue('url', url)
    for (const attachment of patch.attachments ?? []) component.addPropertyWithValue('attach', attachment)
    if (patch.tags?.length) { const categories = new ICAL.Property('categories'); categories.setValues(patch.tags); component.addProperty(categories) }
  }
  root.addSubcomponent(component)
  return preserveCalendar(raw, original, root)
}

export async function deleteCalendarFileEntry(entry: CalendarFileEntry): Promise<void> {
  const baseline = await api.vault.readTextDocument(entry.path)
  if (!baseline) throw new Error('Calendar file unavailable.')
  const root = parseRoot(baseline.content)
  const original = new ICAL.Component(JSON.parse(JSON.stringify(root.toJSON())))
  const component = root.getAllSubcomponents()[entry.component]
  if (!component || String(component.getFirstPropertyValue('uid') ?? entry.component) !== String(entry.uid || entry.component)) throw new Error('Calendar component no longer exists.')
  if (entry.recurrenceId) {
    const property = new ICAL.Property('exdate')
    const recurrence = ICAL.Time.fromString(entry.recurrenceId, undefined)
    recurrence.zone = new ICAL.Event(component).startDate.zone
    property.setValue(recurrence)
    if (!recurrence.isDate && !['UTC', 'floating'].includes(recurrence.zone.tzid)) property.setParameter('tzid', recurrence.zone.tzid)
    component.addProperty(property)
  } else if (entry.period !== undefined) {
    let position = 0
    for (const property of component.getAllProperties('freebusy')) {
      const values = property.getValues().filter(() => position++ !== entry.period)
      if (values.length) property.setValues(values)
      else component.removeProperty(property)
    }
  } else root.removeSubcomponent(component)
  const saved = await api.vault.writeTextDocumentGuarded(entry.path, preserveCalendar(baseline.content, original, root), baseline.revisionToken)
  if (!saved.ok || saved.editorConflict) throw new Error('Calendar file changed. Reload before deleting.')
}
