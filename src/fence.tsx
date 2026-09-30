/**
 * ```calendar``` code block — a live agenda embedded in a note.
 *
 *   ```calendar
 *   view-mode: week          (agenda | week — week groups by day)
 *   range: this-week         (today | this-week | next-7 | next-30)
 *   start-date: 2026-07-04   (explicit window beats range)
 *   end-date: 2026-07-11
 *   filter-tag: #meetings
 *   category: Habitats
 *   limit: 20
 *   ```
 *
 * Rows click through to the Calendar page.
 */
import codeBlockExamples from './codeBlockExamples.json'
import { React, api } from './runtime'
import { paletteCssValue } from '@valley/plugin-sdk/palette'
import type { FC } from 'react'
import type { EventRecord } from '@valley/plugin-sdk/types'
import { fenceInt, parseFenceParams } from '@valley/plugin-sdk/fenceParams'
import { useCalendarItems } from './useCalendarItems'
import { calendarItemKey, type CalItem } from './items'
import { revealCalendarItem } from './runtime'
import { uiText } from './localization'

const STYLE_ID = 'notes-calendar-fence-styles'

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
.calendar-fence { margin: 0.75em 0; border: 1px solid var(--border-light); border-radius: var(--radius); background: var(--container-color); overflow: hidden; }
.calendar-fence-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--border-light); cursor: pointer; }
.calendar-fence-head .t { font-weight: 600; color: var(--title-color); }
.calendar-fence-head .c { font-size: var(--small-font-size); color: var(--text-secondary); }
.calendar-fence-day { padding: 6px 12px 2px; font-size:0.6875rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-secondary); }
.calendar-fence-row { display: flex; align-items: center; gap: 8px; padding: 5px 12px; cursor: pointer; }
.calendar-fence-row:hover { background: var(--hover-bg); }
.calendar-fence-row .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--accent-color); }
.calendar-fence-row .time { flex: none; width: 6.5em; font-variant-numeric: tabular-nums; font-size: var(--small-font-size); color: var(--text-secondary); }
.calendar-fence-row .t { flex: 1; min-width: 0; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.calendar-fence-row .cat { flex: none; font-size:0.6875rem; padding: 0 6px; border-radius: 999px; background: var(--accent-tint-bg); color: var(--accent-tint-text); }
.calendar-fence-empty { padding: 10px 12px; color: var(--text-secondary); font-size: var(--small-font-size); }
`
  document.head.appendChild(style)
}

const pad = (n: number): string => String(n).padStart(2, '0')
const isoOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const isoPlus = (days: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return isoOf(d)
}

interface Window {
  start: string
  end: string
}

export function fenceWindow(values: Record<string, string>): Window {
  const start = values['start-date'] ?? values.start
  const end = values['end-date'] ?? values.end
  if (start || end) return { start: start ?? isoOf(new Date()), end: end ?? start ?? isoPlus(7) }
  const range = (values.range ?? 'this-week').toLowerCase()
  const today = isoOf(new Date())
  if (range === 'today') return { start: today, end: today }
  if (range === 'next-30') return { start: today, end: isoPlus(30) }
  if (range === 'this-week') {
    const d = new Date()
    const day = (d.getDay() + 6) % 7 // Monday = 0
    const monday = new Date(d)
    monday.setDate(d.getDate() - day)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { start: isoOf(monday), end: isoOf(sunday) }
  }
  return { start: today, end: isoPlus(7) }
}

export function filterFenceEvents(
  events: EventRecord[],
  window: Window,
  tag: string | null,
  category: string | null,
  limit: number
): EventRecord[] {
  const wantedTag = tag ? tag.replace(/^#/, '').toLowerCase() : null
  const wantedCategory = category?.toLowerCase() ?? null
  return events
    .filter((event) => {
      if (event.date < window.start || event.date > window.end) return false
      if (wantedTag && !event.tags.some((t) => t.replace(/^#/, '').toLowerCase() === wantedTag)) return false
      if (wantedCategory && (event.category ?? '').toLowerCase() !== wantedCategory) return false
      return true
    })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    .slice(0, limit)
}

const dayLabel = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  return date.toLocaleDateString(api.ui.language(), { weekday: 'short', day: 'numeric', month: 'short' })
}

const CalendarFence: FC<{ code: string }> = ({ code }) => {
  const params = parseFenceParams(code)
  const window = fenceWindow(params.values)
  const grouped = (params.values['view-mode'] ?? params.values.view ?? 'agenda').toLowerCase().startsWith('week')
  const limit = fenceInt(params, 'limit', 200) ?? 20

  const { items, colorFor } = useCalendarItems({ focusYear: Number(window.start.slice(0, 4)), filePath: params.values.file })
  const tag = (params.values['filter-tag'] ?? params.values.tag ?? '').replace(/^#/, '').toLowerCase()
  const category = params.values.category?.toLowerCase()
  const shown = items.filter(item => item.date >= window.start && item.date <= window.end &&
    (!tag || item.tags?.some(value => value.replace(/^#/, '').toLowerCase() === tag)) &&
    (!category || item.category?.toLowerCase() === category))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '')).slice(0, limit)

  const open = (): void => api.workspace.openMainTab()
  const timeOf = (event: CalItem): string =>
    !event.startTime ? uiText('auto.1ac1ff7616a6') : `${event.startTime}${event.endTime ? `–${event.endTime}` : ''}`

  const row = (event: CalItem, withDate: boolean): JSX.Element => (
    <div key={calendarItemKey(event)} className="calendar-fence-row" role="button" tabIndex={0} onKeyDown={key => { if (key.key === 'Enter') revealCalendarItem({ date: event.date, itemId: event.id, sourceId: event.sourceId ?? event.kind }) }} onClick={() => revealCalendarItem({ date: event.date, itemId: event.id, sourceId: event.sourceId ?? event.kind })} title={event.note || event.title}>
      <span className="dot" style={{ background: paletteCssValue(colorFor(event)) }} />
      <span className="time">{withDate ? `${event.date.slice(5)} ${timeOf(event)}` : timeOf(event)}</span>
      <span className="t">{event.title}</span>
      {event.category && <span className="cat">{event.category}</span>}
    </div>
  )

  let body: JSX.Element
  if (shown.length === 0) {
    body = <div className="calendar-fence-empty">{uiText('auto.a2590d497e7c')}</div>
  } else if (grouped) {
    const days = new Map<string, CalItem[]>()
    for (const event of shown) {
      const list = days.get(event.date) ?? []
      list.push(event)
      days.set(event.date, list)
    }
    body = (
      <>
        {[...days.entries()].map(([date, list]) => (
          <React.Fragment key={date}>
            <div className="calendar-fence-day">{dayLabel(date)}</div>
            {list.map((event) => row(event, false))}
          </React.Fragment>
        ))}
      </>
    )
  } else {
    body = <>{shown.map((event) => row(event, true))}</>
  }

  return (
    <>
      <div className="calendar-fence-head" onClick={open} title={uiText('auto.7a3a9094b18c')}>
        <span className="t">{uiText('auto.adab5090ac6a')}</span>
        <span className="c">
          {window.start} → {window.end} · {shown.length}
        </span>
      </div>
      {body}
    </>
  )
}

/** Register the ```calendar``` fence; returns the unregister fn. */
export function registerCalendarFence(): () => void {
  const off = api.markdown.registerCodeBlockRenderer('calendar', (code, el) => {
    ensureStyles()
    el.classList.add('calendar-fence')
    return api.ui.renderReact(el, <CalendarFence code={code} />)
  }, { examples: codeBlockExamples.calendar })
  return () => {
    off()
    document.getElementById(STYLE_ID)?.remove()
  }
}
