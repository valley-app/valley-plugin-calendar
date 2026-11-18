import { React, api } from './runtime'
import type { ReactElement } from 'react'
import { paletteCssValue } from '@valley/plugin-sdk/palette'
import { CalendarCompletion, calendarItemKey, type CalItem } from './items'
import { groupOfItem, type CalendarGroup } from './localGroups'
import { useCalendarSourceProviders } from './itemSources'
import { parseLocalDate } from './dateMath'
import { uiText } from './localization'

/**
 * The Calendar page as a table (18 Nov, modelled on To-Do's main table): the
 * entries of the shown week, month or year, one 37px row each, under a sticky
 * header whose columns sort. The first column is the task check (or the entry's
 * colour), then Title, Date, Time, Group, Source, Place and Notes. A click
 * selects the row (the right sidebar shows it), ↑/↓ move the selection, a
 * double-click or Enter edits it and right-click opens the entry's menu.
 */
type Column = 'title' | 'date' | 'time' | 'group' | 'source' | 'place' | 'note'
const COLUMNS: Column[] = ['title', 'date', 'time', 'group', 'source', 'place', 'note']

interface Row { item: CalItem; key: string; end: string; group?: CalendarGroup; parent?: CalendarGroup; source: string }

const shortDay = (date: string, withYear: boolean): string =>
  parseLocalDate(date).toLocaleDateString(api.ui.language(), { weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })

/** One row per entry: a multi-day entry is drawn once per day by the grids, here once with its whole span. */
export function tableRows(items: readonly CalItem[], groups: readonly CalendarGroup[], sourceName: (item: CalItem) => string): Row[] {
  const rows = new Map<string, Row>()
  for (const item of items) {
    const id = `${item.kind}:${item.sourceId ?? ''}:${item.id}`
    const key = item.endDate ? id : `${id}:${item.date}`
    const end = item.endDate ?? item.date
    const known = rows.get(key)
    if (known) { if (item.date < known.item.date) known.item = item; continue }
    const group = groupOfItem(item, groups)
    rows.set(key, { item, key: calendarItemKey(item), end, group, parent: group?.parent ? groups.find((entry) => entry.id === group.parent) : undefined, source: sourceName(item) })
  }
  return [...rows.values()]
}

function sortValue(row: Row, column: Column): string {
  const { item } = row
  switch (column) {
    case 'title': return item.title.toLocaleLowerCase()
    case 'date': return `${item.date} ${item.startTime ?? '00:00'}`
    case 'time': return item.startTime ?? '~'
    case 'group': return [row.parent?.name, row.group?.name ?? item.group].filter(Boolean).join(' · ').toLocaleLowerCase() || '~'
    case 'source': return row.source.toLocaleLowerCase()
    case 'place': return item.location?.name?.toLocaleLowerCase() ?? '~'
    case 'note': return item.note?.trim().toLocaleLowerCase() || '~'
  }
}

export function CalendarTable({ items, groups, colorFor, selectedKey, onSelect, onEdit, onContextMenu }: {
  items: readonly CalItem[]
  groups: readonly CalendarGroup[]
  colorFor: (item: CalItem) => string
  selectedKey: string | null
  onSelect: (item: CalItem) => void
  onEdit: (item: CalItem, newTab?: boolean) => void
  onContextMenu: (item: CalItem, event: React.MouseEvent) => void
}): ReactElement {
  const providers = useCalendarSourceProviders()
  const [sort, setSort] = React.useState<{ column: Column; descending: boolean }>({ column: 'date', descending: false })
  const sourceName = React.useCallback((item: CalItem): string => {
    if (item.kind === 'noteDate') return uiText('calendar.filter.noteDates')
    if (item.kind === 'file') return item.filePath?.split('/').pop() ?? ''
    if (item.kind === 'event') return uiText('calendar.filter.events')
    const provider = providers.find((entry) => entry.owner === item.sourceOwner)
    return provider?.integration?.localized?.[api.ui.language()]?.name ?? provider?.integration?.name ?? item.sourceOwner ?? ''
  }, [providers])
  const rows = React.useMemo(() => {
    const list = tableRows(items, groups, sourceName)
    const direction = sort.descending ? -1 : 1
    return list.sort((a, b) => sortValue(a, sort.column).localeCompare(sortValue(b, sort.column), api.ui.language()) * direction
      || sortValue(a, 'date').localeCompare(sortValue(b, 'date')))
  }, [groups, items, sort, sourceName])
  const years = new Set(rows.map((row) => row.item.date.slice(0, 4)))
  const withYear = years.size > 1
  const bodyRef = React.useRef<HTMLTableSectionElement>(null)
  React.useEffect(() => {
    if (!selectedKey) return
    const row = [...(bodyRef.current?.querySelectorAll<HTMLElement>('tr[data-row-key]') ?? [])].find((element) => element.dataset.rowKey === selectedKey)
    row?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedKey])

  const label = (column: Column): string => uiText(`calendar.table.${column}`)
  const header = (column: Column): ReactElement => {
    const active = sort.column === column
    return <th key={column} className={`calendar-table-${column}`} aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className={`calendar-table-sort${active ? ' active' : ''}`} onMouseDown={(event) => event.preventDefault()}
        onClick={() => setSort((current) => ({ column, descending: current.column === column ? !current.descending : false }))}>
        <span>{label(column)}</span>{active && <span className="calendar-table-sort-mark" aria-hidden="true">{sort.descending ? '↓' : '↑'}</span>}
      </button>
    </th>
  }
  const move = (step: 1 | -1): void => {
    const index = rows.findIndex((row) => row.key === selectedKey)
    const next = rows[index < 0 ? (step > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, index + step))]
    if (next) onSelect(next.item)
  }

  if (!rows.length) return <div className="calendar-table-empty">{uiText('calendar.table.empty')}</div>
  return (
    <div className="calendar-table-scroll" tabIndex={0} onKeyDown={(event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1) }
      else if (event.key === 'Enter') { const row = rows.find((entry) => entry.key === selectedKey); if (row) { event.preventDefault(); onEdit(row.item) } }
    }}>
      <table className="calendar-table" aria-label={uiText('calendar.table.label')}>
        <thead><tr><th className="calendar-table-mark" aria-label={uiText('calendar.table.done')} />{COLUMNS.map(header)}</tr></thead>
        <tbody ref={bodyRef}>
          {rows.map((row) => {
            const { item } = row
            const selected = row.key === selectedKey
            const multiDay = row.end !== item.date
            return (
              <tr key={row.key} data-row-key={row.key} data-calendar-item-id={item.id} aria-selected={selected}
                className={`calendar-table-row${selected ? ' selected' : ''}${item.completed ? ' completed' : ''}`}
                onClick={() => onSelect(item)}
                onDoubleClick={(event) => onEdit(item, api.ui.hasModKey(event))}
                onContextMenu={(event) => onContextMenu(item, event)}>
                <td className="calendar-table-mark">
                  {item.kind === 'sourced' && typeof item.completed === 'boolean'
                    ? <CalendarCompletion item={item} />
                    : <span className="calendar-table-dot" style={{ background: paletteCssValue(colorFor(item)) }} aria-hidden="true" />}
                </td>
                <td className="calendar-table-title"><span className="calendar-table-text">{item.title}</span></td>
                <td className="calendar-table-date"><span className="calendar-table-text">{multiDay ? `${shortDay(item.date, withYear)} – ${shortDay(row.end, withYear)}` : shortDay(item.date, withYear)}</span></td>
                <td className="calendar-table-time"><span className="calendar-table-text">{item.startTime ? [item.startTime, item.endTime].filter(Boolean).join(' – ') : uiText('calendar.card.allDay')}</span></td>
                <td className="calendar-table-group">{(row.group || item.group) && <span className="calendar-item-group-pill" style={{ ['--calendar-group-color' as string]: paletteCssValue(row.group?.color ?? 'palette:gray') }}>
                  <span className="calendar-item-group-dot" aria-hidden="true" />
                  <span className="calendar-item-group-name">{row.parent && <span className="calendar-item-group-parent">{row.parent.name} · </span>}{row.group?.name ?? item.group}</span>
                </span>}</td>
                <td className="calendar-table-source"><span className="calendar-table-text">{row.source}</span></td>
                <td className="calendar-table-place"><span className="calendar-table-text">{item.location?.name ?? ''}</span></td>
                <td className="calendar-table-note"><span className="calendar-table-text">{item.note?.trim().split('\n')[0] ?? ''}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
