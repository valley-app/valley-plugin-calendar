import { deleteCalendarFileEntry } from './calendarFiles'
import { openDailyNote } from './dailyNotes'
import { React, api } from './runtime'
import type { ReactElement } from 'react'
import type { MainWorkspaceNavigation } from '@valley/plugin-sdk'
import {
  CALENDAR_PANEL_SELECTION_V1,
  type CalendarPanelSelection,
  type CalendarRevealTarget,
  type UiMenuItem
} from '@valley/plugin-sdk'
import { useHostField } from './hooks'
import { useCalendarSettings } from './settingsStore'
import {
  useTimeControl,
  defaultTimeControl,
  rangeDays,
  type CalendarViewMode,
  type TimeControlState
} from './timeControl'
import { deleteEvent } from './events'
import { creatableSources, editSourcedItem, openSourcedItem, removeSourcedItem } from './itemSources'
import { WEEK_START_INDEX } from './lib'
import {
  CalendarAgendaCard,
  calendarItemKey,
  calendarEditRequestStore,
  calendarItemMenuItems,
  openItemInCalendarMain,
  persistItemMove,
  revealItemInCalendarAgenda,
  type CalItem
} from './items'
import { localizedMonth, isoDay, isoWeek, parseLocalDate, startOfWeek } from './dateMath'
import { useCalendarItems } from './useCalendarItems'
import { QuickAdd, type QuickAddState } from './QuickAdd'
import { WeekGrid } from './WeekGrid'
import { MonthGrid, YearGrid } from './MonthGrid'
import { SWIPE_IDLE_MS, calendarSwipeStep, newSwipeGesture, type CalendarSwipeGesture } from './swipe'
import { CalendarDays, ChevronRight, Clock, Plus, Trash, X } from './icons'
import { uiText } from './localization'
import { revealTargetStore } from './runtime'
import { selectCalendarProperties, useCalendarSurface } from './surfaces'

// Re-exports kept stable for the Panel/Page/Agenda views and tests.
export { sourcedToItem, eventToItem, type CalItem } from './items'
export { useCalendarData } from './useCalendarData'
export { calendarSwipeStep, newSwipeGesture, type CalendarSwipeGesture } from './swipe'
export { MONTH_SHORT, WEEKDAY_LABELS, isoDay, parseLocalDate } from './dateMath'

type CalendarHistoryEntry = Pick<TimeControlState, 'view' | 'cursor' | 'selectedDate' | 'rangeStart' | 'rangeEnd'>

const CALENDAR_HISTORY_LIMIT = 20

function sameCalendarHistoryEntry(a: CalendarHistoryEntry | undefined, b: CalendarHistoryEntry): boolean {
  return Boolean(
    a &&
    a.view === b.view &&
    a.cursor === b.cursor &&
    a.selectedDate === b.selectedDate &&
    a.rangeStart === b.rangeStart &&
    a.rangeEnd === b.rangeEnd
  )
}

function panelSelection(entry: CalendarHistoryEntry): CalendarPanelSelection | null {
  if (entry.rangeStart && entry.rangeEnd) {
    const [rangeStart, rangeEnd] = entry.rangeStart <= entry.rangeEnd
      ? [entry.rangeStart, entry.rangeEnd]
      : [entry.rangeEnd, entry.rangeStart]
    return { selectedDate: entry.selectedDate, rangeStart, rangeEnd }
  }
  if (entry.selectedDate) {
    return { selectedDate: entry.selectedDate, rangeStart: null, rangeEnd: null }
  }
  return null
}

function useRevealTarget(): CalendarRevealTarget | null {
  const store = revealTargetStore()
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => store.subscribe(onStoreChange),
    [store]
  )
  const getSnapshot = React.useCallback(
    () => {
      const target = store.get()
      return target?.surface === 'main' ? target : null
    },
    [store]
  )
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ── main component ───────────────────────────────────────────────────────────

export function Calendar({
  variant = 'main',
  filePath,
  navigation
}: {
  variant?: 'main' | 'right'
  filePath?: string
  navigation?: MainWorkspaceNavigation
}): ReactElement {
  const today = new Date()
  const weekStartPref = useHostField('weekStart')
  const {
    groups: calendarGroups,
    dayStartHour: calendarDayStartHour,
    dayEndHour: calendarDayEndHour,
    itemClickTarget
  } = useCalendarSettings()
  const weekStart = WEEK_START_INDEX[weekStartPref] ?? 1
  const surface = variant === 'main' ? 'main_workspace' : 'right_sidebar'
  const [tc, patchShared] = useTimeControl(surface)
  const revealTarget = useRevealTarget()
  const defaultTc = React.useMemo(() => defaultTimeControl(), [])
  const [view, setView_] = React.useState<CalendarViewMode>(tc.view ?? defaultTc.view)
  const [cursor, setCursor_] = React.useState(tc.cursor ?? defaultTc.cursor)
  const [historyState, setHistoryState] = React.useState<{ entries: CalendarHistoryEntry[]; index: number }>(() => ({
    entries: [{
      view: tc.view ?? defaultTc.view,
      cursor: tc.cursor ?? defaultTc.cursor,
      selectedDate: tc.selectedDate ?? null,
      rangeStart: tc.rangeStart ?? null,
      rangeEnd: tc.rangeEnd ?? null
    }],
    index: 0
  }))
  const pushHistory = React.useCallback((entry: CalendarHistoryEntry) => {
    setHistoryState((state) => {
      if (sameCalendarHistoryEntry(state.entries[state.index], entry)) return state
      const base = state.entries.slice(0, state.index + 1)
      const entries = [...base, entry].slice(-CALENDAR_HISTORY_LIMIT)
      return { entries, index: entries.length - 1 }
    })
  }, [])
  const patch = React.useCallback((p: Partial<TimeControlState>, opts: { pushHistory?: boolean } = {}) => {
    const nextEntry: CalendarHistoryEntry = {
      view: p.view ?? view,
      cursor: p.cursor ?? cursor,
      selectedDate: p.selectedDate === undefined ? (tc.selectedDate ?? null) : p.selectedDate,
      rangeStart: p.rangeStart === undefined ? (tc.rangeStart ?? null) : p.rangeStart,
      rangeEnd: p.rangeEnd === undefined ? (tc.rangeEnd ?? null) : p.rangeEnd
    }
    if (opts.pushHistory !== false) pushHistory(nextEntry)
    if (p.view !== undefined) setView_(p.view)
    if (p.cursor !== undefined) setCursor_(p.cursor)
    if (Object.keys(p).length > 0) patchShared(p)
  }, [cursor, patchShared, pushHistory, tc.rangeEnd, tc.rangeStart, tc.selectedDate, view])
  const goHistory = React.useCallback((delta: -1 | 1): void => {
    const nextIndex = historyState.index + delta
    if (nextIndex < 0 || nextIndex >= historyState.entries.length) return
    const entry = historyState.entries[nextIndex]
    setHistoryState({ ...historyState, index: nextIndex })
    patch(entry, { pushHistory: false })
  }, [historyState, patch])
  useCalendarSurface(surface, tc, React.useMemo(() => ({
    canGoBack: historyState.index > 0,
    canGoForward: historyState.index < historyState.entries.length - 1,
    goBack: () => goHistory(-1),
    goForward: () => goHistory(1)
  }), [goHistory, historyState.entries.length, historyState.index]))
  React.useEffect(() => {
    if (variant !== 'main' || !navigation) return
    navigation.setController({
      canGoBack: historyState.index > 0,
      canGoForward: historyState.index < historyState.entries.length - 1,
      goBack: () => goHistory(-1),
      goForward: () => goHistory(1)
    })
    return () => navigation.setController(null)
  }, [goHistory, historyState.entries.length, historyState.index, navigation, variant])
  React.useEffect(() => {
    setView_(tc.view ?? defaultTc.view)
    setCursor_(tc.cursor ?? defaultTc.cursor)
  }, [defaultTc.cursor, defaultTc.view, tc.view, tc.cursor])
  React.useEffect(() => {
    if (variant !== 'right') return
    return () => api.interop.state.publish(CALENDAR_PANEL_SELECTION_V1, null)
  }, [variant])
  React.useEffect(() => {
    if (variant !== 'right') return
    api.interop.state.publish(CALENDAR_PANEL_SELECTION_V1, panelSelection({
      view,
      cursor,
      selectedDate: tc.selectedDate,
      rangeStart: tc.rangeStart,
      rangeEnd: tc.rangeEnd
    }))
  }, [cursor, tc.rangeEnd, tc.rangeStart, tc.selectedDate, variant, view])
  const cursorDate = parseLocalDate(cursor)
  const selected = tc.selectedDate ? parseLocalDate(tc.selectedDate) : today
  const [compact, setCompact] = React.useState(false)
  const compactLayout = variant !== 'main' || compact
  const [dir, setDir] = React.useState<1 | -1>(1)
  const swipe = React.useRef<CalendarSwipeGesture & { idleTimer: ReturnType<typeof setTimeout> | null }>({
    ...newSwipeGesture(),
    idleTimer: null
  })
  const [quickAdd, setQuickAddState] = React.useState<QuickAddState | null>(null)
  const anchor = React.useRef({ x: 24, y: 76 })
  const setQuickAdd = (value: QuickAddState | null): void => setQuickAddState(value ? { ...value, sourceFilePath: filePath, anchor: anchor.current } : null)
  const [selectedItemKey, setSelectedItemKey] = React.useState<string | null>(null)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const menuRequestRef = React.useRef(0)

  const { items, itemsByDay, colorFor, documentErrors } = useCalendarItems({
    filePath,
    focusYear: Number(cursor.slice(0, 4))
  })

  const itemClickTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectItem = React.useCallback((item: CalItem): void => {
    setSelectedItemKey(calendarItemKey(item))
    selectCalendarProperties(item, surface)
    if (itemClickTimerRef.current) clearTimeout(itemClickTimerRef.current)
    itemClickTimerRef.current = setTimeout(() => {
      itemClickTimerRef.current = null
      if (itemClickTarget === 'owner' && item.kind === 'sourced' && item.sourceId) {
        void openSourcedItem(item.sourceId, item.id).then((opened) => {
          if (!opened) revealItemInCalendarAgenda(item)
        })
        return
      }
      revealItemInCalendarAgenda(item)
    }, 220)
  }, [itemClickTarget, surface])

  const editItem = React.useCallback((item: CalItem): void => {
    if (itemClickTimerRef.current) {
      clearTimeout(itemClickTimerRef.current)
      itemClickTimerRef.current = null
    }
    setSelectedItemKey(calendarItemKey(item))
    selectCalendarProperties(item, surface)
    if (item.kind === 'noteDate' && item.filePath) { api.workspace.openFile(item.filePath); return }
    if (item.kind === 'sourced' && item.sourceId) { void editSourcedItem(item.sourceId, item.id); return }
    if (item.readOnly) return
    setQuickAdd({ date: item.date, editItem: item })
  }, [surface])

  const editRequests = calendarEditRequestStore()
  const editRequest = React.useSyncExternalStore(
    React.useCallback((listener: () => void) => editRequests.subscribe(listener), [editRequests]),
    React.useCallback(() => editRequests.get(), [editRequests]),
    React.useCallback(() => editRequests.get(), [editRequests])
  )
  React.useEffect(() => {
    if (variant !== 'main' || !editRequest) return
    if (editRequest.item.readOnly) setQuickAdd({ date: editRequest.item.date, editItem: editRequest.item })
    else editItem(editRequest.item)
    editRequests.publish(null)
  }, [editItem, editRequest, editRequests, variant])

  React.useEffect(() => () => {
    if (itemClickTimerRef.current) clearTimeout(itemClickTimerRef.current)
  }, [])

  // Self-measure: switch to the compact (sidebar) layout below ~340px. Uses a
  // hysteresis band (enter <340, leave >380) so a layout change that nudges the
  // width back across a single threshold can't oscillate (flicker).
  React.useEffect(() => {
    const el = rootRef.current
    const Observer = (el?.ownerDocument.defaultView as typeof window | null)?.ResizeObserver ?? globalThis.ResizeObserver
    if (!el || !Observer) return
    const ro = new Observer((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth
      setCompact((prev) => (prev ? width <= 380 : width < 340))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  React.useEffect(() => () => {
    if (swipe.current.idleTimer) clearTimeout(swipe.current.idleTimer)
  }, [])

  const handleItemAction = React.useCallback(async (item: CalItem, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    e.preventDefault()
    setSelectedItemKey(calendarItemKey(item))
    selectCalendarProperties(item, surface)
    setQuickAdd(null)
    const request = ++menuRequestRef.current
    const point = { x: e.clientX, y: e.clientY }
    const leading = await calendarItemMenuItems(item, () => editItem(item))
    if (request !== menuRequestRef.current) return
    const ours: UiMenuItem[] = item.readOnly ? [] : [
      {
        label: uiText('auto.f6fdbe48dc54'),
        icon: <Trash />,
        danger: true,
        onSelect: () => api.ui.openMenu([
          { label: uiText('auto.7c1496f9a7dc', { p0: item.title }), icon: <Trash />, enabled: false },
          { label: uiText('auto.77dfd2135f4d'), icon: <X /> },
          { label: uiText('auto.ae8a5b196587'), icon: <Trash />, danger: true, onSelect: () => deleteItem(item) }
        ], point)
      }
    ]
    const items = leading.length > 0 && ours.length > 0
      ? [...leading, { type: 'separator' as const }, ...ours]
      : [...leading, ...ours]
    void api.ui.openMenu(items, point)
  }, [editItem, surface])

  const deleteItem = async (item: CalItem): Promise<void> => {
    if (item.kind === 'noteDate') return // scraped from a note — nothing of ours to delete
    if (item.file) await deleteCalendarFileEntry(item.file)
    else if (item.kind === 'event') await deleteEvent(item.id)
    // A contributed item is the provider's to delete; we only ask.
    else if (item.sourced && item.sourceId) await removeSourcedItem(item.sourceId, item.sourced.id)
  }

  const year = cursorDate.getFullYear()
  const month = cursorDate.getMonth()

  const setView = (next: CalendarViewMode): void => patch({ view: next })

  const goToday = (): void => {
    const now = new Date()
    patch({ selectedDate: isoDay(now), rangeStart: null, rangeEnd: null, cursor: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01` })
  }

  const pickWeek = (weekStartDate: Date): void =>
    patch({
      view: 'week',
      selectedDate: isoDay(weekStartDate),
      rangeStart: null,
      rangeEnd: null,
      cursor: `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, '0')}-01`
    })

  const step = (d: -1 | 1): void => {
    setDir(d)
    if (view === 'year') {
      patch({ cursor: `${year + d}-${String(month + 1).padStart(2, '0')}-01` })
    } else if (view === 'week') {
      const base = startOfWeek(selected, weekStart)
      const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d * 7)
      patch({ selectedDate: isoDay(next), rangeStart: null, rangeEnd: null, cursor: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01` })
    } else {
      const next = new Date(year, month + d, 1)
      patch({ cursor: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01` })
    }
  }

  const armSwipeIdleReset = (): void => {
    if (swipe.current.idleTimer) clearTimeout(swipe.current.idleTimer)
    swipe.current.idleTimer = setTimeout(() => {
      Object.assign(swipe.current, newSwipeGesture())
      swipe.current.idleTimer = null
    }, SWIPE_IDLE_MS)
  }

  const onStageWheel = (e: React.WheelEvent): void => {
    armSwipeIdleReset()
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    e.preventDefault()
    const next = calendarSwipeStep(swipe.current, e.deltaX, e.deltaY)
    Object.assign(swipe.current, next.gesture)
    if (next.step !== 0) step(next.step)
  }

  const dragSelRef = React.useRef<{ anchor: string } | null>(null)
  const draggedRef = React.useRef(false)
  const lastSwapRef = React.useRef(0)
  const cursorRef = React.useRef(cursor)
  cursorRef.current = cursor

  React.useEffect(() => {
    const onUp = (): void => { dragSelRef.current = null; lastSwapRef.current = 0 }
    const window = rootRef.current?.ownerDocument.defaultView
    window?.addEventListener('mouseup', onUp)
    return () => window?.removeEventListener('mouseup', onUp)
  }, [])

  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!dragSelRef.current || view !== 'month') return
    const gridEl = rootRef.current?.querySelector('.calendar-grid') as HTMLElement | null
    if (!gridEl) return
    const rect = gridEl.getBoundingClientRect()
    const inTop = e.clientY < rect.top + 44
    const inBottom = e.clientY > rect.bottom - 44
    if (!inTop && !inBottom) { lastSwapRef.current = 0; return }
    const now = Date.now()
    if (now - lastSwapRef.current < 450) return
    lastSwapRef.current = now
    const moveDir: 1 | -1 = inBottom ? 1 : -1
    setDir(moveDir)
    const cur = parseLocalDate(cursorRef.current)
    const next = new Date(cur.getFullYear(), cur.getMonth() + moveDir, 1)
    const newCursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
    const newEnd = moveDir === 1 ? newCursor : isoDay(new Date(next.getFullYear(), next.getMonth() + 1, 0))
    draggedRef.current = true
    patch({ cursor: newCursor, rangeStart: dragSelRef.current.anchor, rangeEnd: newEnd })
  }

  const pickDay = (date: Date, e?: React.MouseEvent): void => {
    if (draggedRef.current) { draggedRef.current = false; return }
    setSelectedItemKey(null)
    selectCalendarProperties(null, surface)
    const iso = isoDay(date)
    if (e?.shiftKey && tc.selectedDate) {
      patch({ rangeStart: tc.selectedDate, rangeEnd: iso })
      return
    }
    patch({
      selectedDate: iso,
      rangeStart: null,
      rangeEnd: null,
      cursor: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
    })
  }
  const startRangeDrag = (date: Date): void => {
    dragSelRef.current = { anchor: isoDay(date) }
    draggedRef.current = false
  }
  const extendRangeDrag = (date: Date): void => {
    const sel = dragSelRef.current
    if (!sel) return
    const cur = parseLocalDate(cursorRef.current)
    if (date.getFullYear() !== cur.getFullYear() || date.getMonth() !== cur.getMonth()) return
    const iso = isoDay(date)
    if (iso !== sel.anchor) {
      draggedRef.current = true
      patch({ rangeStart: sel.anchor, rangeEnd: iso })
    }
  }
  const endRangeDrag = (): void => { dragSelRef.current = null; lastSwapRef.current = 0 }

  const inRange = (date: Date): boolean => {
    if (!tc.rangeStart || !tc.rangeEnd) return false
    const iso = isoDay(date)
    const days = rangeDays(tc.rangeStart, tc.rangeEnd)
    return days.includes(iso)
  }

  const openQuickAdd = (date: Date, startTime?: string, endTime?: string, kind?: 'todo' | 'event'): void => {
    setQuickAdd({ date: isoDay(date), startTime, endTime, kind })
  }

  const handleDayContextMenu = (e: React.MouseEvent, date: Date): void => {
    e.preventDefault()
    e.stopPropagation()
    if (quickAdd) return
    const day = isoDay(date)
    void api.ui.openMenu([
      { label: uiText('calendar.daily.open'), icon: <CalendarDays />, onSelect: () => void openDailyNote(day) },
      ...(!filePath && creatableSources().length ? [{ label: uiText('auto.ec42f1f55523'), icon: <Plus />, onSelect: () => openQuickAdd(date, undefined, undefined, 'todo') }] : []),
      { label: uiText('auto.7f8a6fad8b7c'), icon: <CalendarDays />, onSelect: () => openQuickAdd(date, undefined, undefined, 'event') },
      { type: 'separator' },
      { label: uiText('auto.22819a02167d'), icon: <Clock />, onSelect: goToday },
      { label: uiText('auto.4869ac12717f'), icon: <ChevronRight />, onSelect: () => pickWeek(parseLocalDate(day)) }
    ], { x: e.clientX, y: e.clientY })
  }

  const handleGridContextMenu = (e: React.MouseEvent, date: string, startTime?: string): void => {
    if (quickAdd) return
    e.preventDefault()
    e.stopPropagation()
    void api.ui.openMenu([
      { label: uiText('calendar.daily.open'), icon: <CalendarDays />, onSelect: () => void openDailyNote(date) },
      ...(!filePath && creatableSources().length ? [{ label: uiText('auto.ec42f1f55523'), icon: <Plus />, onSelect: () => openQuickAdd(parseLocalDate(date), startTime, undefined, 'todo') }] : []),
      { label: uiText('auto.7f8a6fad8b7c'), icon: <CalendarDays />, onSelect: () => openQuickAdd(parseLocalDate(date), startTime, undefined, 'event') },
      { type: 'separator' },
      { label: uiText('auto.22819a02167d'), icon: <Clock />, onSelect: goToday },
      { label: uiText('auto.4869ac12717f'), icon: <ChevronRight />, onSelect: () => pickWeek(parseLocalDate(date)) }
    ], { x: e.clientX, y: e.clientY })
  }

  const weekOf = startOfWeek(selected, weekStart)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekOf)
    d.setDate(weekOf.getDate() + i)
    return d
  })

  const periodKey =
    view === 'year' ? `y-${year}` : view === 'week' ? `w-${isoDay(weekOf)}` : `m-${year}-${month}`
  const previousPeriodRef = React.useRef(periodKey)
  React.useLayoutEffect(() => {
    if (previousPeriodRef.current === periodKey) return
    previousPeriodRef.current = periodKey
    const grid = rootRef.current?.querySelector<HTMLElement>('.calendar-grid-wrap')
    if (!grid?.animate || grid.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const animation = grid.animate([
      { transform: `translateX(${dir * 35}%)`, opacity: 0 },
      { transform: 'translateX(0)', opacity: 1 }
    ], { duration: 260, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' })
    return () => animation.cancel()
  }, [periodKey, dir])
  const title =
    view === 'year' ? (
      <h2><span>{year}</span></h2>
    ) : view === 'week' ? (
      <h2>W{isoWeek(weekOf)} <span>{weekOf.getFullYear()}</span></h2>
    ) : (
      <h2>{localizedMonth(month, api.ui.language())} <span>{year}</span></h2>
    )

  // The selected-day cards obey the shared source/group filters because `items`
  // is already the one filtered item layer used by every Calendar surface.
  const dayList = tc.selectedDate
    ? items
        .filter((item) => item.date.slice(0, 10) === tc.selectedDate)
        .sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'))
    : []

  // Compact week: single-day grid for the selected day, with a 7-day picker header.
  const compactWeekDays = [selected]
  const weekGridDays = compactLayout && view === 'week' ? compactWeekDays : weekDays
  const pickWeekDay = (d: Date): void =>
    patch({
      selectedDate: isoDay(d),
      rangeStart: null,
      rangeEnd: null,
      cursor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    })

  const switcherButtons = (['week', 'month', 'year'] as CalendarViewMode[]).map((mode) => (
    <button
      key={mode}
      role="tab"
      aria-selected={view === mode}
      className={`calendar-switcher-btn ${view === mode ? 'active' : ''}`}
      onClick={() => setView(mode)}
    >
      {mode === 'month' ? uiText('auto.082bc378cd60') : mode === 'week' ? uiText('auto.f82be68a7fb4') : uiText('auto.879e32326c52')}
    </button>
  ))

  const navActions = (
    <div className="calendar-actions">
      <button title={uiText('calendar.daily.open')} aria-label={uiText('calendar.daily.open')} onClick={() => void openDailyNote(tc.selectedDate ?? isoDay(today))}>＋</button>
      <button aria-label={uiText('auto.50f94286ba30')} onClick={() => step(-1)}>‹</button>
      <button aria-label={uiText('auto.24345a14377f')} onClick={goToday}>{uiText('auto.7a46866bc719')}</button>
      <button aria-label={uiText('auto.bc981983e7f5')} onClick={() => step(1)}>›</button>
    </div>
  )

  return (
    <div
      ref={rootRef}
      className={`calendar-view ${variant === 'main' ? 'calendar-view-main' : 'calendar-view-sidebar'}${compactLayout ? ' calendar-view-compact' : ''}`}
    >
      <div className="calendar-topbar">
        <div className="calendar-topbar-leading">
          {title}
        </div>
        <div className="calendar-topbar-actions">
          <div className="calendar-switcher calendar-switcher-inline" role="tablist">
            {switcherButtons}
          </div>
          {navActions}
        </div>
      </div>
      {/* Development-only source diagnostics:
      {sourceErrors.map(error => <div key={error.owner} className="agenda-day-empty" role="status">{error.message}</div>)} */}
      <div className="calendar-view-body" onPointerDownCapture={event => {
        const column = (event.target as Element).closest('.calendar-weekgrid-col')
        anchor.current = { x: column ? column.getBoundingClientRect().right + 8 : event.clientX, y: event.clientY }
      }}>
        <div className="calendar-scroll-area" data-view={view}>
      <div className="calendar-stage" onWheel={onStageWheel} onMouseMove={handleStageMouseMove} onMouseLeave={() => { lastSwapRef.current = 0 }}>
        <div className="calendar-grid-wrap" key={periodKey} data-dir={dir}>
          {view === 'month' && (
            <MonthGrid
              year={year}
              month={month}
              today={today}
              selected={selected}
              weekStart={weekStart}
              compact={compactLayout}
              itemsByDay={itemsByDay}
              colorFor={colorFor}
              onPick={pickDay}
              onPickWeek={pickWeek}
              selectedItemKey={selectedItemKey}
              onSelectItem={selectItem}
              onEditItem={editItem}
              onItemAction={handleItemAction}
              inRange={inRange}
              onRangeStart={startRangeDrag}
              onRangeOver={extendRangeDrag}
              onRangeEnd={endRangeDrag}
              onContextMenu={handleDayContextMenu}
              revealTarget={revealTarget}
            />
          )}
          {view === 'week' && (
            <WeekGrid
              days={weekGridDays}
              items={items.filter((it) => weekGridDays.some((d) => isoDay(d) === it.date))}
              dayStartHour={calendarDayStartHour}
              dayEndHour={calendarDayEndHour}
              colorFor={colorFor}
              selectedItemKey={selectedItemKey}
              onSelectItem={selectItem}
              onEditItem={editItem}
              onCommit={(item, date, start, end) => void persistItemMove(item, date, start, end)}
              onCreate={(date, startTime, endTime) => setQuickAdd({ date, startTime, endTime })}
              draft={quickAdd?.editItem ? null : quickAdd}
              onContextMenu={handleGridContextMenu}
              onItemAction={handleItemAction}
              compact={compactLayout}
              weekDays={weekDays}
              selectedDay={selected}
              selectedTime={tc.selectedTime}
              itemsByDay={itemsByDay}
              onPickDay={pickWeekDay}
              revealTarget={revealTarget}
            />
          )}
          {view === 'year' && <YearGrid year={year} today={today} weekStart={weekStart} revealTarget={revealTarget} onPickMonth={(m) => patch({ view: 'month', cursor: `${year}-${String(m + 1).padStart(2, '0')}-01` })} />}
        </div>
      </div>
      {compactLayout && view === 'month' && tc.selectedDate && (
        <div className="calendar-todos">
          {dayList.length === 0 ? (
            <div className="agenda-day-empty">{uiText('auto.d669db3f6b34')}</div>
          ) : (
            dayList.map((calendarItem) => {
              const sourceId = calendarItem.sourceId ?? ''
              const revealNonce = sourceId === revealTarget?.sourceId && calendarItem.id === revealTarget.itemId
                ? revealTarget.nonce
                : undefined
              return (
                <CalendarAgendaCard
                  key={`${sourceId}:${calendarItem.id}:${calendarItem.occurrenceKey ?? calendarItem.date}:${revealNonce ?? 0}`}
                  item={calendarItem}
                  sourceId={sourceId}
                  color={colorFor(calendarItem)}
                  revealNonce={revealNonce}
                  onClick={() => { selectCalendarProperties(calendarItem, surface); openItemInCalendarMain(calendarItem) }}
                  onDoubleClick={() => editItem(calendarItem)}
                  onContextMenu={(event) => void handleItemAction(calendarItem, event)}
                />
              )
            })
          )}
        </div>
      )}
      </div>
      </div>
      {/* The key carries the day and the kind, not just `new`: the composer reads
          both into `useState` on mount, so a shared key let a second open reuse
          the first one's instance and keep its tab — "Add event" straight after
          a to-do opened the To-Do form. */}
      {documentErrors.map(error => <div role="alert" key={error}>{error}</div>)}
      {quickAdd && (
        <QuickAdd
          key={quickAdd.editItem?.id ?? `new:${quickAdd.kind ?? ''}:${quickAdd.date}:${quickAdd.startTime ?? ''}`}
          state={quickAdd}
          groups={calendarGroups}

          onClose={() => setQuickAdd(null)}
          onAdded={() => { /* data hook reloads on change */ }}
        />
      )}
    </div>
  )
}
