/**
 * The two header filters both calendar surfaces share: which **groups** and
 * which **sources** are on.
 *
 * They used to be a row of legend chips wedged into the Calendar's top bar,
 * which only fitted on a wide window, was absent from the Agenda entirely, and —
 * worse — did nothing: `hiddenGroups` was written to settings and never read
 * back by anything that filters items. Both filters now live behind one icon
 * each, persist through `settingsStore`, and are applied once in
 * `useCalendarItems`, so hiding "Pixar" hides it on the page and in the panel
 * together.
 */
import { React, api, revealCalendarItem } from './runtime'
import type { ReactElement, ReactNode } from 'react'
import type { UiMenuTarget } from '@valley/plugin-sdk'
import { groupOfItem, type CalendarGroup } from './localGroups'
import { paletteCssContrast, paletteCssValue } from '@valley/plugin-sdk/palette'
import type { CalItem } from './items'
import { COLLAPSED_GROUPS_KEY, EVENTS_SOURCE_ID, GROUPS_SECTION_FOLDED_KEY, NO_GROUP_ID, NOTE_DATES_SOURCE_ID, providerSourceKey, saveGroupFilter, useCalendarSettings } from './settingsStore'
import { useNoteIndex } from './noteIndex'
import { saveNoteDateSources, useNoteDateSources } from './noteDateStore'
import { matchNotes, noteDateTitle, occurrenceInYear, occurrenceKeys, parseNoteDate, sourceMatchStats, type NoteDateIndexEntry, type NoteDateSource } from './noteDates'
import { parseLocalDate } from './dateMath'
import { CalendarDays, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Eye, EyeOff, MoreHorizontal, NoteDateGlyph, Plus, Settings, ValleyIcon, X } from './icons'
import { uiText } from './localization'

/** One row of the sources filter: the Calendar's own two, plus every provider. */
export interface ItemSourceOption {
  id: string
  label: string
  count: number
}

interface CalendarFilterOption {
  id: string
  label: string
  color?: string
  icon?: ReactNode
  count?: number
  /** A subgroup: the row sits indented under its group. */
  sub?: boolean
}

/** Which source contributed an item — the id the sources filter switches off. */
export function itemSourceId(item: CalItem): string {
  if (item.kind === 'event' || item.kind === 'file') return EVENTS_SOURCE_ID
  if (item.kind === 'noteDate') return NOTE_DATES_SOURCE_ID
  return item.sourceOwner ? providerSourceKey(item.sourceOwner) : ''
}

/**
 * Apply both filters. With groups selected, only items of those groups (a main
 * group covers its subgroups) stay, and items without a group only when No
 * group is selected; an empty selection shows everything.
 */
export function visibleItems(
  items: readonly CalItem[],
  groups: readonly CalendarGroup[],
  groupFilter: readonly string[],
  hiddenSources: readonly string[]
): CalItem[] {
  if (groupFilter.length === 0 && hiddenSources.length === 0) return items as CalItem[]
  const selected = new Set(groupFilter)
  const hiddenSourceIds = new Set(hiddenSources)
  return items.filter((item) => {
    if (hiddenSourceIds.has(itemSourceId(item))) return false
    if (selected.size === 0) return true
    const group = groupOfItem(item, groups)
    if (!group) return selected.has(NO_GROUP_ID)
    return selected.has(group.id) || (group.parent !== undefined && selected.has(group.parent))
  })
}

export function CalendarFilterList({
  label,
  options,
  hidden,
  settingsKey,
  emptyText,
  onOpenSettings,
  saveHidden,
  embedded = false
}: {
  label: string
  options: readonly CalendarFilterOption[]
  hidden: readonly string[]
  settingsKey?: string
  emptyText: string
  onOpenSettings?: () => void
  saveHidden?: (next: string[]) => Promise<boolean>
  embedded?: boolean
}): ReactElement {
  const [off, setOff] = React.useState<string[]>(() => [...hidden])
  const [error, setError] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => setOff([...hidden]), [hidden])
  const selected = options.filter((option) => !off.includes(option.id)).length
  const selectedRows = options.map((option) => !off.includes(option.id))
  const selectionRunClass = (active: boolean, index: number): string => active
    ? ` active${!selectedRows[index - 1] ? ' selection-run-start' : ''}${!selectedRows[index + 1] ? ' selection-run-end' : ''}`
    : ''
  const commit = (next: string[]): void => {
    if (saving) return
    setOff(next)
    setSaving(true)
    const persist = saveHidden
      ? saveHidden(next)
      : settingsKey
        ? api.settings.set(settingsKey, next).then((result) => result.ok)
        : Promise.resolve(false)
    void persist.then((ok) => {
      if (!ok) { setOff([...hidden]); setError(true) }
      else setError(false)
    }).catch(() => { setOff([...hidden]); setError(true) }).finally(() => setSaving(false))
  }
  const flip = (id: string): void => commit(
    off.includes(id) ? off.filter((value) => value !== id) : [...off, id]
  )
  const toggleAll = (): void => {
    const optionIds = new Set(options.map((option) => option.id))
    commit(selected === options.length
      ? [...new Set([...off, ...optionIds])]
      : off.filter((id) => !optionIds.has(id)))
  }
  if (embedded) return <div className="props-info">
    <div className="props-info-actions">
      {onOpenSettings && <button type="button" onClick={onOpenSettings}>{uiText('calendar.properties.manageGroups')}</button>}
      {options.length > 0 && <button type="button" disabled={saving} onClick={toggleAll}>{uiText(selected === options.length ? 'calendar.filter.deselectAll' : 'calendar.filter.selectAll')}</button>}
    </div>
    <dl className="props-info-table calendar-filter-properties">{options.map((option) => <div className={`props-info-row calendar-filter-property-row${option.sub ? ' calendar-filter-sub' : ''}`} key={option.id}>
      <dt className="props-info-key">
        {option.icon && <span className="calendar-filter-property-glyph" style={option.color ? { color: paletteCssValue(option.color) } : undefined}>{option.icon}</span>}
        {!option.icon && option.color && <span className="props-info-dot" style={{ background: paletteCssValue(option.color) }} />}
        {option.label}
      </dt>
      <dd className="props-info-value calendar-filter-property-value">
        {option.count !== undefined && <span className="calendar-filter-option-count">{option.count}</span>}
        <api.ui.settings.Toggle label={option.label} checked={!off.includes(option.id)} disabled={saving} onChange={() => flip(option.id)} />
      </dd>
    </div>)}</dl>
    {options.length === 0 && <p className="props-info-hint">{emptyText}</p>}
    {error && <p className="props-info-hint" role="alert">{api.ui.t('error.commandFailed')}</p>}
  </div>
  return (
    <div className="calendar-filter-popover-body">
      <div className="calendar-filter-popover-head">
        {onOpenSettings ? (
          <button type="button" className="calendar-filter-popover-title actionable" onClick={onOpenSettings}>{label}</button>
        ) : (
          <span className="calendar-filter-popover-title">{label}</span>
        )}
        {options.length > 0 && (
          <button type="button" className="calendar-filter-popover-all" onClick={toggleAll}>
            {uiText(selected === options.length ? 'calendar.filter.deselectAll' : 'calendar.filter.selectAll')}
          </button>
        )}
      </div>
      {options.length === 0 ? (
        <div className="calendar-filter-empty">{emptyText}</div>
      ) : (
        <div className="calendar-filter-list">
          {options.map((option, index) => {
            const active = !off.includes(option.id)
            const visiblySelected = selectedRows[index]
            return (
              <button
                key={option.id}
                type="button"
                className={`calendar-filter-option${option.sub ? ' calendar-filter-sub' : ''}${selectionRunClass(visiblySelected, index)}`}
                aria-pressed={active}
                onClick={() => flip(option.id)}
              >
                <span className="calendar-filter-check" aria-hidden="true">{active ? '✓' : ''}</span>
                {option.icon ? (
                  <span className="calendar-filter-option-glyph" style={option.color ? { color: paletteCssValue(option.color) } : undefined}>{option.icon}</span>
                ) : (
                  <span
                    className="calendar-legend-dot"
                    style={{ background: option.color ? paletteCssValue(option.color) : 'var(--text-tertiary)' }}
                  />
                )}
                <span className="calendar-filter-option-label">{option.label}</span>
                {option.count !== undefined && <span className="calendar-filter-option-count">{option.count}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function useSavedSetting<T>(key: string, read: (value: unknown) => T): [T, (next: T) => void] {
  const [shown, setShown] = React.useState<{ value: T } | null>(null)
  const saved = React.useSyncExternalStore(
    React.useCallback((listener: () => void) => api.settings.subscribe(listener), []),
    () => api.settings.get()[key]
  )
  const value = React.useMemo(() => read(saved), [read, saved])
  React.useEffect(() => { setShown(null) }, [saved])
  const set = React.useCallback((next: T): void => {
    setShown({ value: next })
    void api.settings.set(key, next).catch(() => setShown(null))
  }, [key])
  return [shown ? shown.value : value, set]
}
const readFolded = (value: unknown): boolean => value === true
const readIds = (value: unknown): string[] => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []

/**
 * The selection after a click on a row. A plain click shows that group alone, or
 * everything again when it was the only one shown; with `toggle` (Shift or ⌘)
 * exactly the clicked group is added or removed, never a range. All clears it.
 */
export function pickGroup(selected: readonly string[], id: string, toggle = false): string[] {
  if (id === ALL_GROUPS_ID) return []
  if (toggle) return selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id]
  return selected.length === 1 && selected[0] === id ? [] : [id]
}

const ALL_GROUPS_ID = 'calendar:allGroups'
/** A mouse click on a head button leaves no focus box; keyboard focus keeps its ring. */
const keepFocus = (event: React.MouseEvent): void => event.preventDefault()

interface GroupRow { id: string; label: string; color?: string; count: number; parent?: string; sub?: boolean }

/**
 * The Groups section under the Agenda's search field, drawn and used like
 * Contacts' (18 Nov): All entries, every group with its subgroups one step in,
 * then No group, each with its count. A click shows that group alone (a group
 * covers its subgroups), the same row again or All entries shows everything;
 * Shift- or ⌘-click adds or removes exactly the clicked group. The title folds
 * the section and names the active filter; × clears it. The selection is the
 * one filter of every Calendar surface, so the page follows it too.
 */
export function GroupsSection({ groups, counts, embedded = false }: {
  groups: readonly CalendarGroup[]
  counts: Readonly<Record<string, number>>
  embedded?: boolean
}): ReactElement | null {
  const { groupFilter } = useCalendarSettings()
  const [pending, setPending] = React.useState<string[] | null>(null)
  const selected = pending ?? groupFilter
  React.useEffect(() => setPending(null), [groupFilter])
  const [folded, setFolded] = useSavedSetting(GROUPS_SECTION_FOLDED_KEY, readFolded)
  const [collapsedIds, setCollapsedIds] = useSavedSetting(COLLAPSED_GROUPS_KEY, readIds)
  const [focusId, setFocusId] = React.useState<string | null>(null)
  const [error, setError] = React.useState(false)
  const listRef = React.useRef<HTMLDivElement>(null)
  const listId = React.useId()
  if (!groups.length) return null

  const own = (id: string): number => counts[id] ?? 0
  const mains = groups.filter((group) => group.parent === undefined)
  const subsOf = (id: string): CalendarGroup[] => groups.filter((group) => group.parent === id)
  const groupRows: GroupRow[] = mains.flatMap((group) => [
    { id: group.id, label: group.name, color: group.color, count: own(group.id) + subsOf(group.id).reduce((sum, sub) => sum + own(sub.id), 0) },
    ...subsOf(group.id).map((sub) => ({ id: sub.id, label: sub.name, color: sub.color, count: own(sub.id), parent: group.id, sub: true }))
  ])
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const all: GroupRow = { id: ALL_GROUPS_ID, label: uiText('calendar.groups.all'), count: total }
  const none: GroupRow | null = own(NO_GROUP_ID) > 0 || selected.includes(NO_GROUP_ID) ? { id: NO_GROUP_ID, label: uiText('calendar.groups.none'), count: own(NO_GROUP_ID) } : null
  const collapsed = new Set(collapsedIds)
  const foldable = mains.filter((group) => subsOf(group.id).length > 0).map((group) => group.id)
  const allFolded = foldable.length > 0 && foldable.every((id) => collapsed.has(id))
  const rows: GroupRow[] = [all, ...groupRows.filter((row) => !(row.parent && collapsed.has(row.parent))), ...(none ? [none] : [])]
  const isActive = (row: GroupRow): boolean => row.id === ALL_GROUPS_ID ? selected.length === 0 : selected.includes(row.id)
  const current = rows.find((row) => row.id === focusId) ?? rows.find(isActive) ?? rows[0]
  const summary = selected.length === 1
    ? [...groupRows, ...(none ? [none] : [])].find((row) => row.id === selected[0])?.label ?? ''
    : selected.length > 1 ? uiText('calendar.groups.selected', { count: selected.length }) : ''

  const choose = (next: string[]): void => {
    setPending(next)
    void saveGroupFilter(next).then((ok) => { setError(!ok); if (!ok) setPending(null) }).catch(() => { setError(true); setPending(null) })
  }
  const toggleFold = (id: string): void => setCollapsedIds(collapsed.has(id) ? collapsedIds.filter((entry) => entry !== id) : [...collapsedIds, id])
  const focusRow = (row: GroupRow | undefined): void => {
    if (!row) return
    setFocusId(row.id)
    const target = [...(listRef.current?.querySelectorAll<HTMLElement>('.calendar-groups-row') ?? [])].find((element) => element.dataset.groupId === row.id)
    target?.focus()
  }
  const onRowKey = (event: React.KeyboardEvent<HTMLButtonElement>, row: GroupRow, index: number): void => {
    const folds = foldable.includes(row.id)
    const shut = folds && collapsed.has(row.id)
    const move = (next: GroupRow | undefined): void => { event.preventDefault(); focusRow(next) }
    switch (event.key) {
      case 'ArrowDown': move(rows[index + 1]); break
      case 'ArrowUp': move(rows[index - 1]); break
      case 'Home': move(rows[0]); break
      case 'End': move(rows.at(-1)); break
      case 'ArrowRight':
        if (shut) { event.preventDefault(); toggleFold(row.id) } else if (folds) move(rows[index + 1])
        break
      case 'ArrowLeft':
        if (folds && !shut) { event.preventDefault(); toggleFold(row.id) } else if (row.parent) move(rows.find((candidate) => candidate.id === row.parent))
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        choose(pickGroup(selected, row.id, event.shiftKey || api.ui.hasModKey(event)))
        break
    }
  }

  return (
    <section className={`calendar-groups${folded ? ' folded' : ''}${embedded ? ' embedded' : ''}`} aria-label={uiText('calendar.filter.groups')}>
      <div className="calendar-groups-head">
        <button type="button" onMouseDown={keepFocus} className="calendar-groups-title" aria-expanded={!folded} aria-controls={listId} onClick={() => setFolded(!folded)}>
          <span className="calendar-groups-chevron" aria-hidden="true">{folded ? <ChevronRight /> : <ChevronDown />}</span>
          <span className="calendar-groups-name">{uiText('calendar.filter.groups')}</span>
          {summary && <span className="calendar-groups-summary">· {summary}</span>}
        </button>
        {selected.length > 0 && (
          <button type="button" onMouseDown={keepFocus} className="panel-tool-btn calendar-groups-clear" aria-label={uiText('calendar.groups.clear')} title={uiText('calendar.groups.clear')} onClick={() => choose([])}>
            <X />
          </button>
        )}
        {!folded && foldable.length > 0 && (
          <button type="button" onMouseDown={keepFocus} className="panel-tool-btn calendar-groups-fold-all"
            aria-label={uiText(allFolded ? 'calendar.groups.expandAll' : 'calendar.groups.collapseAll')}
            title={uiText(allFolded ? 'calendar.groups.expandAll' : 'calendar.groups.collapseAll')}
            onClick={() => setCollapsedIds(allFolded ? [] : foldable)}>
            {allFolded ? <ChevronsUpDown /> : <ChevronsDownUp />}
          </button>
        )}
      </div>
      {!folded && (
        <div className="calendar-groups-list" id={listId} ref={listRef} role="group" aria-label={uiText('calendar.filter.groups')}>
          {rows.map((row, index) => {
            const folds = foldable.includes(row.id)
            const shut = folds && collapsed.has(row.id)
            const active = isActive(row)
            return (
              <div key={row.id} className="calendar-groups-item">
                {folds && (
                  <button type="button" className="calendar-groups-fold" tabIndex={-1} aria-expanded={!shut}
                    aria-label={uiText(shut ? 'calendar.groups.expandGroup' : 'calendar.groups.collapseGroup', { name: row.label })}
                    onClick={() => toggleFold(row.id)}>
                    {shut ? <ChevronRight /> : <ChevronDown />}
                  </button>
                )}
                <button
                  type="button"
                  className={`calendar-groups-row${row.sub ? ' sub' : ''}${active ? ' active' : ''}`}
                  data-group-id={row.id}
                  aria-pressed={active}
                  tabIndex={row === current ? 0 : -1}
                  onFocus={() => setFocusId(row.id)}
                  onKeyDown={(event) => onRowKey(event, row, index)}
                  onClick={(event) => choose(pickGroup(selected, row.id, event.shiftKey || api.ui.hasModKey(event)))}
                >
                  <span
                    className={`calendar-groups-dot${row.id === ALL_GROUPS_ID ? ' all' : row.id === NO_GROUP_ID ? ' none' : ''}`}
                    style={row.color ? { background: paletteCssValue(row.color) } : undefined}
                    aria-hidden="true"
                  />
                  <span className="calendar-groups-label">{row.label}</span>
                  <span className="calendar-groups-count">{row.count}</span>
                </button>
              </div>
            )
          })}
        </div>
      )}
      {error && <p role="alert" className="settings-path-error">{api.ui.t('error.commandFailed')}</p>}
    </section>
  )
}

/** The date of a dated note that the sidebar reveals: its next occurrence from today, else its last one. */
export function nextNoteDate(entry: NoteDateIndexEntry, source: NoteDateSource, today: string): string | null {
  const parts = parseNoteDate(entry.frontmatter?.[source.dateField], source.dateFormat)
  if (!parts) return null
  if (source.match === 'exact') return parts.year == null ? null : occurrenceInYear(parts, parts.year)
  const year = Number(today.slice(0, 4))
  const dates = occurrenceKeys(parts, source.match, [year, year + 1])
  return dates.find((date) => date >= today) ?? dates.at(-1) ?? null
}

/** A source's glyph in white on a disc in its own colour, like its entries in the calendar. */
const SourceBadge = ({ source, small }: { source: Pick<NoteDateSource, 'color' | 'icon'>; small?: boolean }): ReactElement => (
  <span className={`notedate-badge${small ? ' is-small' : ''}`}
    style={source.color ? { ['--badge-fill' as string]: paletteCssValue(source.color), ['--badge-on' as string]: paletteCssContrast(source.color) } : undefined}>
    <NoteDateGlyph id={source.icon || 'calendar'} />
  </span>
)

const menuTarget = (event: React.MouseEvent<HTMLElement>): UiMenuTarget =>
  event.type === 'contextmenu' ? { x: event.clientX, y: event.clientY } : { anchor: event.currentTarget, align: 'end' }

interface DatedNote { entry: NoteDateIndexEntry; title: string; date: string }

/**
 * The Note dates list, drawn like Map's Map pins tab (18 Nov): a 38px bar with
 * the master eye, fold all and add source, then one row per source with dates —
 * chevron, glyph on a disc in its colour, name, count, eye and ⋯ — that opens to
 * list the notes it dates. Sources drag to a new place (Alt+↑/↓ too); the order
 * is the one Settings shows. No switches here; Settings keeps them.
 */
export function NoteDateSourceFilterList({ embedded = false }: { embedded?: boolean }): ReactElement {
  const sources = useNoteDateSources()
  const entries = useNoteIndex(sources)
  const [open, setOpen] = React.useState<string[]>([])
  const [error, setError] = React.useState(false)
  const dragged = React.useRef<string | null>(null)
  const [mark, setMark] = React.useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const counts = React.useMemo(() => new Map(sources.map((source) => [source.id, sourceMatchStats(entries, source).dated])), [entries, sources])
  const shown = sources.filter((source) => !source.hidden && (counts.get(source.id) ?? 0) > 0)
  const anyVisible = shown.some((source) => source.visible)
  const allFolded = shown.every((source) => !open.includes(source.id))

  const commit = (next: NoteDateSource[]): void => {
    void saveNoteDateSources(next).then(() => setError(false)).catch(() => setError(true))
  }
  const setVisible = (id: string, visible: boolean): void => commit(sources.map((source) => source.id === id ? { ...source, visible } : source))
  const toggleOpen = (id: string): void => setOpen((ids) => ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id])
  const notesOf = (source: NoteDateSource): DatedNote[] => matchNotes(entries, source)
    .map((entry) => ({ entry, title: noteDateTitle(entry, source), date: nextNoteDate(entry, source, todayKey) }))
    .filter((note): note is DatedNote => note.date !== null)
    .sort((a, b) => a.title.localeCompare(b.title, api.ui.language()))
  const reveal = (source: NoteDateSource, note: DatedNote): void => revealCalendarItem({ date: note.date, itemId: `notedate:${source.id}:${note.entry.relPath}:${note.date}` })
  const openNote = (note: DatedNote, newTab?: boolean): void => api.workspace.openFile(note.entry.relPath, undefined, newTab ? { newTab } : undefined)
  const dayLabel = (date: string): string => {
    const day = parseLocalDate(date)
    return day.toLocaleDateString(api.ui.language(), { day: 'numeric', month: 'short', ...(day.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }) })
  }

  const openSourceMenu = (event: React.MouseEvent<HTMLElement>, source: NoteDateSource): void => {
    event.preventDefault()
    event.stopPropagation()
    void api.ui.openMenu([
      { id: 'solo', label: uiText('noteDates.menu.solo'), icon: <Eye />, onSelect: () => commit(sources.map((entry) => entry.hidden ? entry : { ...entry, visible: entry.id === source.id })) },
      { type: 'separator' },
      { id: 'edit', label: uiText('sources.edit'), icon: <Settings />, onSelect: () => api.workspace.openOwnSettings('dates') }
    ], menuTarget(event))
  }
  const openNoteMenu = (event: React.MouseEvent<HTMLElement>, source: NoteDateSource, note: DatedNote): void => {
    event.preventDefault()
    event.stopPropagation()
    void api.ui.openMenu([
      { id: 'reveal', label: uiText('noteDates.menu.reveal'), icon: <CalendarDays />, onSelect: () => reveal(source, note) },
      { id: 'note', label: uiText('noteDates.menu.openNote'), icon: <ValleyIcon />, onSelect: () => openNote(note) }
    ], menuTarget(event))
  }
  const more = (onOpen: (event: React.MouseEvent<HTMLElement>) => void): ReactElement => (
    <button type="button" className="notedate-row-action notedate-row-more" title={uiText('noteDates.more')} aria-label={uiText('noteDates.more')}
      onClick={onOpen} onDoubleClick={(event) => event.stopPropagation()}>
      <MoreHorizontal />
    </button>
  )

  // Sources reorder by dragging the row itself; the insertion line shows where it lands.
  const drop = (event: React.DragEvent<HTMLElement>, target: NoteDateSource): { id: string; position: 'before' | 'after' } | null => {
    if (!dragged.current || dragged.current === target.id) return null
    const rect = event.currentTarget.getBoundingClientRect()
    return { id: target.id, position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' }
  }
  /** Reorder among the listed sources only: unused and empty sources keep their slots in the saved order. */
  const move = (dragId: string, at: { id: string; position: 'before' | 'after' }): void => {
    const moving = shown.find((source) => source.id === dragId)
    if (!moving) return
    const rest = shown.filter((source) => source.id !== dragId)
    const index = rest.findIndex((source) => source.id === at.id) + (at.position === 'after' ? 1 : 0)
    const order = [...rest.slice(0, index), moving, ...rest.slice(index)]
    if (order.every((source, position) => source.id === shown[position].id)) return
    const listed = new Set(order.map((source) => source.id))
    let position = 0
    commit(sources.map((source) => listed.has(source.id) ? order[position++] : source))
  }
  const step = (source: NoteDateSource, delta: -1 | 1): void => {
    const index = shown.findIndex((entry) => entry.id === source.id)
    const target = shown[index + delta]
    if (target) move(source.id, { id: target.id, position: delta < 0 ? 'before' : 'after' })
  }

  return (
    <div className={`notedate-sidebar-sources${embedded ? ' embedded' : ''}`}>
      <div className="notedate-sidebar-bar">
        <span className="panel-title notedate-sidebar-bar-title">{uiText('calendar.filter.noteDates')}</span>
        <div className="panel-toolbar">
          <button type="button" className={`panel-tool-btn${anyVisible ? '' : ' is-off'}`} disabled={!shown.length} aria-pressed={anyVisible}
            title={uiText(anyVisible ? 'noteDates.eye.hideAll' : 'noteDates.eye.showAll')} aria-label={uiText(anyVisible ? 'noteDates.eye.hideAll' : 'noteDates.eye.showAll')}
            onClick={() => commit(sources.map((source) => source.hidden ? source : { ...source, visible: !anyVisible }))}>
            {anyVisible ? <Eye /> : <EyeOff />}
          </button>
          {shown.length > 0 && (
            <button type="button" className="panel-tool-btn"
              title={uiText(allFolded ? 'sources.expandAll' : 'sources.collapseAll')} aria-label={uiText(allFolded ? 'sources.expandAll' : 'sources.collapseAll')}
              onClick={() => setOpen(allFolded ? shown.map((source) => source.id) : [])}>
              {allFolded ? <ChevronsUpDown /> : <ChevronsDownUp />}
            </button>
          )}
          <button type="button" className="panel-tool-btn" title={uiText('noteDates.add')} aria-label={uiText('noteDates.add')}
            onClick={() => api.workspace.openOwnSettings('dates')}>
            <Plus />
          </button>
        </div>
      </div>
      {error && <p role="alert" className="settings-path-error">{api.ui.t('error.commandFailed')}</p>}
      {!shown.length && <div className="notedate-sidebar-empty">{uiText('noteDates.sidebarEmpty')}</div>}
      <div className="notedate-tree">
        {shown.flatMap((source) => {
          const expanded = open.includes(source.id)
          const label = source.title || uiText('sources.untitled')
          const row = (
            <div key={source.id} role="button" tabIndex={0} aria-expanded={expanded}
              className={`notedate-row notedate-tree-row notedate-tree-source${source.visible ? '' : ' is-hidden'}${mark?.id === source.id ? ` drop-${mark.position}` : ''}`}
              style={{ ['--notedate-tree-depth' as string]: 0 }}
              onClick={() => toggleOpen(source.id)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); step(source, event.key === 'ArrowUp' ? -1 : 1); return }
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleOpen(source.id) }
              }}
              title={uiText('noteDates.row.hint')}
              onContextMenu={(event) => openSourceMenu(event, source)}
              draggable
              onDragStart={(event) => { dragged.current = source.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', source.id) }}
              onDragOver={(event) => {
                const at = drop(event, source)
                if (!at) return
                event.preventDefault()
                if (mark?.id !== at.id || mark.position !== at.position) setMark(at)
              }}
              onDrop={(event) => {
                const at = drop(event, source)
                const id = dragged.current
                dragged.current = null
                setMark(null)
                if (!at || !id) return
                event.preventDefault()
                move(id, at)
              }}
              onDragEnd={() => { dragged.current = null; setMark(null) }}>
              <span className={`notedate-tree-slot notedate-source-chevron${expanded ? ' open' : ''}`}><ChevronRight /></span>
              <SourceBadge source={source} />
              <span className="notedate-row-title">{label}</span>
              <span className="notedate-row-count">{counts.get(source.id)}</span>
              <button type="button" className={`notedate-row-action notedate-row-eye${source.visible ? '' : ' is-off'}`} aria-pressed={source.visible}
                title={uiText(source.visible ? 'noteDates.eye.hide' : 'noteDates.eye.show', { name: label })}
                aria-label={uiText(source.visible ? 'noteDates.eye.hide' : 'noteDates.eye.show', { name: label })}
                onClick={(event) => { event.stopPropagation(); setVisible(source.id, !source.visible) }}>
                {source.visible ? <Eye /> : <EyeOff />}
              </button>
              {more((event) => openSourceMenu(event, source))}
            </div>
          )
          if (!expanded) return [row]
          return [row, ...notesOf(source).map((note) => (
            <div key={`${source.id}:${note.entry.relPath}`} role="button" tabIndex={0}
              className={`notedate-row notedate-tree-row${source.visible ? '' : ' is-hidden'}`}
              style={{ ['--notedate-tree-depth' as string]: 1 }}
              title={note.entry.relPath}
              onClick={() => reveal(source, note)}
              onDoubleClick={(event) => openNote(note, api.ui.hasModKey(event))}
              onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === 'Enter') reveal(source, note) }}
              onContextMenu={(event) => openNoteMenu(event, source, note)}>
              <span className="notedate-tree-slot" />
              <SourceBadge source={source} small />
              <span className="notedate-row-title">{note.title}</span>
              <span className="notedate-row-count">{dayLabel(note.date)}</span>
              {more((event) => openNoteMenu(event, source, note))}
            </div>
          ))]
        })}
      </div>
    </div>
  )
}
