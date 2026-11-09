import { openDailyNote } from './dailyNotes'
/**
 * Agenda — a flat chronological list of every event and todo (anything with a
 * date), grouped into per-day sections sorted newest→oldest. The Calendar
 * plugin's `left_sidebar` view; reuses the Calendar's data + color layers so
 * there is a single source of truth.
 *
 * It tracks the shared Calendar selection (via the SDK time-control surface).
 * Clicking a card reveals its date and position in the main Calendar.
 */
import { React, api, revealTargetStore } from './runtime'
import { selectCalendarProperties, useCalendarSurface } from './surfaces'
import type { ReactElement } from 'react'
import { useTimeControl } from './timeControl'
import { useCalendarItems } from './useCalendarItems'
import { HIDDEN_GROUPS_KEY, HIDDEN_SOURCES_KEY, useCalendarSettings } from './settingsStore'
import { CalendarFilterButton, NoteDateSourceFilterList } from './filters'
import {
  CalendarAgendaCard,
  calendarItemMenuItems,
  openItemInCalendarMain,
  type CalItem
} from './items'
import { CalendarDays, GroupGlyph, Layers, Search, X } from './icons'
import { localizedMonth, localizedWeekday, parseLocalDate } from './dateMath'
import { uiText } from './localization'
import { QuickAdd, type QuickAddState } from './QuickAdd'
import { editSourcedItem } from './itemSources'
import { useVisibleRange } from './visibleRange'

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** A day section before it is measured: header, one card row per item (or the empty line) and the gap above it. */
const estimateDay = (count: number, first: boolean): number => (first ? 0 : 12) + 32 + Math.max(1, count) * 46

function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function AgendaPanel(): ReactElement {
  const today = new Date()
  const todayKey = isoDay(today)
  const [tc, patch] = useTimeControl()
  useCalendarSurface('left_sidebar', tc)
  const { items, sourceOptions, groupCounts, colorFor, documentErrors } = useCalendarItems({ focusYear: Number((tc.selectedDate ?? tc.cursor).slice(0, 4)) })
  const { groups: calendarGroups, hiddenGroups, hiddenSources } = useCalendarSettings()
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const revealStore = revealTargetStore()
  const revealTarget = React.useSyncExternalStore(
    React.useCallback((listener: () => void) => revealStore.subscribe(listener), [revealStore]),
    React.useCallback(() => {
      const target = revealStore.get()
      return target?.surface === 'agenda' ? target : null
    }, [revealStore]),
    React.useCallback(() => {
      const target = revealStore.get()
      return target?.surface === 'agenda' ? target : null
    }, [revealStore])
  )
  const sectionRefs = React.useRef<Map<string, HTMLDivElement>>(new Map())
  const didInitialScroll = React.useRef(false)
  const [todayVisible, setTodayVisible] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [quickAdd, setQuickAddState] = React.useState<QuickAddState | null>(null)
  const anchor = React.useRef({ x: 24, y: 76 })
  const setQuickAdd = (value: QuickAddState | null): void => setQuickAddState(value ? { ...value, anchor: anchor.current } : null)

  const selectItem = React.useCallback((item: CalItem): void => {
    selectCalendarProperties(item, 'left_sidebar')
    openItemInCalendarMain(item)
  }, [])

  const editItem = React.useCallback((item: CalItem): void => {
    selectCalendarProperties(item, 'left_sidebar')
    if (item.kind === 'noteDate' && item.filePath) { api.workspace.openFile(item.filePath); return }
    if (item.kind === 'sourced' && item.sourceId) { void editSourcedItem(item.sourceId, item.id); return }
    if (item.readOnly) return
    setQuickAdd({ date: item.date, editItem: item })
  }, [])

  const visibleItems = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => [
      item.title,
      item.note,
      item.group,
      item.status,
      item.location?.name,
      ...(item.tags ?? []),
      ...(item.fields ?? []).flatMap((field) => [field.key, field.value])
    ].some((value) => value?.toLowerCase().includes(needle)))
  }, [items, search])

  const { days, byDay } = React.useMemo(() => {
    const map = new Map<string, CalItem[]>()
    for (const it of visibleItems) {
      const list = map.get(it.date) ?? []
      list.push(it)
      map.set(it.date, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'))
    }
    if (!search.trim() && tc.selectedDate && !map.has(tc.selectedDate)) map.set(tc.selectedDate, [])
    const keys = [...map.keys()].sort((a, b) => b.localeCompare(a))
    return { days: keys, byDay: map }
  }, [search, tc.selectedDate, visibleItems])

  const revealDay = React.useMemo(() => revealTarget
    ? visibleItems.find((item) => item.id === revealTarget.itemId && (item.sourceId ?? '') === revealTarget.sourceId)?.date ?? null
    : null, [revealTarget, visibleItems])
  const estimate = React.useCallback((key: string, index: number) => estimateDay(byDay.get(key)?.length ?? 0, index === 0), [byDay])
  const sections = useVisibleRange(React, { ids: days, estimate, pinned: [tc.selectedDate, revealDay] })
  const { show, offsetOf } = sections
  // Keep the first visible day in place when days are added or removed above it (items arrive in pages around the
  // focused year), as the browser's scroll anchoring did before the list rendered only the days near the viewport.
  const anchorRef = React.useRef<{ key: string; start: number } | null>(null)
  const recordAnchor = React.useCallback((): void => {
    const body = bodyRef.current
    if (!body) return
    const top = body.getBoundingClientRect().top
    const first = [...body.querySelectorAll<HTMLElement>('.agenda-days > .agenda-section')].find((section) => section.getBoundingClientRect().bottom > top)
    const key = first?.dataset.visibleKey
    const start = key === undefined ? undefined : offsetOf(key)
    anchorRef.current = key !== undefined && start !== undefined ? { key, start } : null
  }, [offsetOf])
  React.useLayoutEffect(() => {
    const body = bodyRef.current, anchor = anchorRef.current
    if (!body || !anchor) return
    const start = offsetOf(anchor.key)
    if (start === undefined) { anchorRef.current = null; return }
    if (start !== anchor.start) body.scrollTop += start - anchor.start
    anchor.start = start
  }, [days, offsetOf])
  /** Smooth scrolling only within about a screen; a farther target jumps, because the rows between are still estimates. */
  const scrollBehavior = React.useCallback((element: HTMLElement | undefined): ScrollBehavior => {
    const root = bodyRef.current
    if (!element || !root) return 'auto'
    const box = root.getBoundingClientRect(), rect = element.getBoundingClientRect()
    return rect.bottom > box.top - box.height && rect.top < box.bottom + box.height ? 'smooth' : 'auto'
  }, [])
  const showDay = React.useCallback((key: string): void => {
    show(key, { block: 'start', behavior: scrollBehavior(sectionRefs.current.get(key)) })
  }, [scrollBehavior, show])

  // Items arrive in pages from several sources, so the first page may not hold the days around today yet: keep
  // aiming at today (or the nearest later day) as pages arrive, until the user scrolls or picks a date.
  React.useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const stop = (): void => { didInitialScroll.current = true }
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
    events.forEach((type) => body.addEventListener(type, stop, { passive: true }))
    return () => events.forEach((type) => body.removeEventListener(type, stop))
  }, [])
  React.useEffect(() => {
    if (revealTarget) didInitialScroll.current = true
  }, [revealTarget])
  // Row heights above the target are still estimates and later pages add days above it, so one early aim drifts.
  const selectedDate = React.useRef(tc.selectedDate)
  selectedDate.current = tc.selectedDate
  React.useEffect(() => {
    if (didInitialScroll.current || days.length === 0) return
    const selected = selectedDate.current
    const target = selected && days.includes(selected) ? selected : days.includes(todayKey) ? todayKey : [...days].reverse().find((k) => k >= todayKey)
    if (target) show(target, { block: 'start' })
  }, [days, show, todayKey])

  React.useEffect(() => {
    if (tc.selectedDate) showDay(tc.selectedDate)
  }, [showDay, tc.selectedDate])

  React.useEffect(() => {
    if (!revealTarget) return
    const frame = requestAnimationFrame(() => {
      const cards = bodyRef.current?.querySelectorAll<HTMLElement>('[data-calendar-item-id]') ?? []
      const card = [...cards].find((element) =>
        element.dataset.calendarItemId === revealTarget.itemId &&
        (element.dataset.calendarSourceId ?? '') === revealTarget.sourceId
      )
      card?.scrollIntoView({ behavior: scrollBehavior(card), block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [revealDay, revealTarget, scrollBehavior])

  // Show the "Today" button whenever today's section scrolls out of view.
  React.useEffect(() => {
    const root = bodyRef.current
    if (!root) return
    const update = (): void => {
      recordAnchor()
      const el = sectionRefs.current.get(todayKey)
      if (!el) {
        setTodayVisible(false)
        return
      }
      const rootRect = root.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      setTodayVisible(elRect.bottom > rootRect.top && elRect.top < rootRect.bottom)
    }
    root.addEventListener('scroll', update, { passive: true })
    update()
    return () => root.removeEventListener('scroll', update)
  }, [todayKey, days, recordAnchor])

  function scrollToToday(): void {
    if (days.includes(todayKey)) showDay(todayKey)
  }

  const openItemMenu = async (item: CalItem, e: React.MouseEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    selectCalendarProperties(item, 'left_sidebar')
    const items = await calendarItemMenuItems(item, () => editItem(item))
    await api.ui.openMenu(items, { x: e.clientX, y: e.clientY })
  }

  return (
    <div className="panel calendar-agenda-panel" onPointerDownCapture={event => { anchor.current = { x: event.clientX, y: event.clientY } }}>
      <div className="panel-header">
        <span className="panel-title">{uiText('auto.891e9d6d47f1')}</span>
        <div className="agenda-header-actions">
          <button className="agenda-today-btn" title={uiText('calendar.daily.open')} aria-label={uiText('calendar.daily.open')} onClick={() => { void openDailyNote(tc.selectedDate ?? todayKey) }}><CalendarDays /></button>
          <CalendarFilterButton
            label={uiText('calendar.filter.sources')}
            icon={<Layers />}
            options={sourceOptions.map((source) => ({ ...source, color: 'palette:primary-blue' }))}
            hidden={hiddenSources}
            settingsKey={HIDDEN_SOURCES_KEY}
            emptyText={uiText('calendar.filter.noSources')}
          />
          <CalendarFilterButton
            label={uiText('calendar.filter.groups')}
            icon={<GroupGlyph />}
            options={calendarGroups.map((group) => ({ id: group.id, label: group.name, color: group.color, count: groupCounts[group.id] ?? 0 }))}
            hidden={hiddenGroups}
            settingsKey={HIDDEN_GROUPS_KEY}
            emptyText={uiText('calendar.filter.noGroups')}
            onOpenSettings={() => api.workspace.openOwnSettings()}
          />
          {!todayVisible && (
            <button className="agenda-today-btn" onClick={scrollToToday}>
              {uiText('auto.24345a14377f')}</button>
          )}
          <button
            className="plugin-open-page"
            onClick={() => api.workspace.openMainTab()}
            aria-label={uiText('auto.9ee309dcedc9')}
            title={uiText('auto.9ee309dcedc9')}
          />
        </div>
      </div>
      <NoteDateSourceFilterList collapsible />
      <div className="search-field-row">
        <div className="agenda-search search-field">
          <Search className="search-field-icon" />
          <input
            className="search-field-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearch('')
            }}
            placeholder={uiText('calendar.agenda.searchPlaceholder')}
            aria-label={uiText('calendar.agenda.searchLabel')}
          />
          {search && <button className="search-field-action" type="button" onClick={() => setSearch('')} aria-label={uiText('calendar.agenda.clearSearch')}><X /></button>}
        </div>
      </div>
      {/* Development-only source diagnostics:
      {sourceErrors.map(error => <div key={error.owner} className="agenda-day-empty" role="status">{error.message}</div>)} */}
      <div className="panel-body agenda-body hidescrollbar" ref={bodyRef}>
        {documentErrors.map(error => <div key={error} role="status">{error}</div>)}
        {days.length === 0 ? (
          <div className="tree-empty">{uiText('auto.418713defbf7')}</div>
        ) : (
          <div className="agenda-days" ref={sections.ref}>{sections.render((i) => {
            const key = days[i]
            const date = parseLocalDate(key)
            const list = byDay.get(key) ?? []
            const isToday = sameDay(date, today)
            const isSelected = tc.selectedDate === key
            const year = date.getFullYear()
            const prevYear = i > 0 ? parseLocalDate(days[i - 1]).getFullYear() : null
            const showYear = prevYear !== null && year !== prevYear
            return (
              <div
                key={key}
                data-visible-key={key}
                className={`agenda-section${i > 0 ? ' agenda-section-spaced' : ''}`}
                ref={(el) => {
                  if (el) sectionRefs.current.set(key, el)
                  else sectionRefs.current.delete(key)
                }}
              >
                {showYear && <div className="agenda-year-sep">{year}</div>}
                <button
                  type="button"
                  className={`agenda-day-header${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                  onClick={() => patch({ selectedDate: key, rangeStart: null, rangeEnd: null })}
                >
                  <span className="agenda-day-dow">{localizedWeekday(date.getDay(), api.ui.language())}</span>
                  <span className="agenda-day-num">{date.getDate()}</span>
                  <span className="agenda-day-month">{localizedMonth(date.getMonth(), api.ui.language())}</span>
                </button>
                {list.length === 0 ? (
                  <div className="agenda-day-empty">{uiText('auto.f4e12416c6b8')}</div>
                ) : (
                  list.map((it) => {
                    const revealed = revealTarget?.itemId === it.id &&
                      revealTarget.sourceId === (it.sourceId ?? '')
                    return (
                    <CalendarAgendaCard
                      key={`${it.occurrenceKey ?? it.id}:${revealed ? revealTarget?.nonce : 0}`}
                      item={it}
                      sourceId={it.sourceId ?? ''}
                      color={colorFor(it)}
                      revealNonce={revealed ? revealTarget?.nonce : undefined}
                      onClick={() => selectItem(it)}
                      onDoubleClick={() => editItem(it)}
                      onContextMenu={(e) => void openItemMenu(it, e)}
                    />
                    )
                  })
                )}
              </div>
            )
          })}</div>
        )}
      </div>
      {quickAdd && <QuickAdd
        key={`${quickAdd.editItem?.sourceId ?? quickAdd.editItem?.kind}:${quickAdd.editItem?.id}`}
        state={quickAdd}
        groups={calendarGroups}
        onClose={() => setQuickAdd(null)}
        onAdded={() => setQuickAdd(null)}
      />}
    </div>
  )
}
