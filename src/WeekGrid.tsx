import { PluginGlyph } from './CalendarPreview'
import { CalendarCompletion } from './items'
import { React, api } from './runtime'
import type { ReactElement } from 'react'
import type { } from '@valley/plugin-sdk/types'
import type { CalendarRevealTarget } from '@valley/plugin-sdk'
import { paletteCssValue } from '@valley/plugin-sdk/palette'
import { isoDay, localizedWeekday, minutesToTime, sameDay, timeToMinutes } from './dateMath'

import { calendarItemKey, itemTooltip, type CalItem } from './items'
import { layoutOverlaps, type BlockLayout } from './overlap'
import { ItemBadges, NoteDateGlyph } from './icons'
import type { } from './QuickAdd'
import { uiText } from './localization'

// ── Week time-grid with drag / resize / create / move ───────────────────────

export const HOUR_PX = 44
export const SNAP_MIN = 15
export const END_HOUR = 24

/**
 * The hours the grid actually paints.
 *
 * `dayStartHour`/`dayEndHour` are the user's ordinary day — the window the grid
 * opens on. They are not a clamp: an item outside it would otherwise be
 * invisible with no hint that anything was there, so the window widens to
 * whatever the visible days hold. A 06:30 stand-up pulls the top down to 06:00
 * and a 23:30 release pushes the bottom to midnight, and both snap back once
 * you scroll to a week without them.
 */
export function gridHourWindow(
  items: readonly CalItem[],
  dayStartHour: number,
  dayEndHour: number
): { startHour: number; endHour: number } {
  let startHour = Math.max(0, Math.min(dayStartHour, END_HOUR - 1))
  let endHour = Math.min(END_HOUR, Math.max(dayEndHour, startHour + 1))
  for (const item of items) {
    if (!item.startTime) continue
    const startMin = timeToMinutes(item.startTime)
    // An item with no end still occupies its starting hour; `endTime` may also
    // land exactly on the hour, which needs no extra row.
    const endMin = item.endTime ? timeToMinutes(item.endTime) : startMin
    startHour = Math.min(startHour, Math.max(0, Math.floor(startMin / 60)))
    endHour = Math.max(endHour, Math.min(END_HOUR, Math.ceil(endMin / 60)))
  }
  return { startHour, endHour }
}

export interface DragState {
  id: string  // '__create__' for in-progress creation drags
  mode: 'move' | 'resize' | 'create'
  startX: number
  startY: number
  origDateIndex: number
  origStartMin: number
  origEndMin: number
  // live preview
  dateIndex: number
  startMin: number
  endMin: number
}

export function WeekGrid({
  days,
  items,
  dayStartHour,
  dayEndHour,
  colorFor,
  selectedItemKey,
  onSelectItem,
  onEditItem,
  onCommit,
  onCreate,
  onContextMenu,
  onItemAction,
  compact,
  weekDays,
  selectedDay,
  selectedTime,
  itemsByDay,
  onPickDay,
  revealTarget,
  draft
}: {
  days: Date[]
  items: CalItem[]
  dayStartHour: number
  dayEndHour: number
  colorFor: (item: CalItem) => string
  selectedItemKey: string | null
  onSelectItem: (item: CalItem) => void
  onEditItem: (item: CalItem) => void
  onCommit: (item: CalItem, date: string, start: string, end: string) => void
  onCreate: (date: string, startTime: string, endTime: string) => void
  draft?: { date: string; startTime?: string; endTime?: string } | null
  onContextMenu?: (e: React.MouseEvent, date: string, startTime?: string) => void
  onItemAction?: (item: CalItem, e: React.MouseEvent) => void
  // Compact (sidebar) mode: render a single-day grid with a 7-day picker header.
  compact?: boolean
  weekDays?: Date[]
  selectedDay?: Date
  selectedTime?: string | null
  itemsByDay?: Map<string, CalItem[]>
  onPickDay?: (d: Date) => void
  revealTarget: CalendarRevealTarget | null
}): ReactElement {
  const today = new Date()
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const [colWidth, setColWidth] = React.useState(0)
  const [drag, setDrag] = React.useState<DragState | null>(null)
  const dragRef = React.useRef<DragState | null>(null)
  dragRef.current = drag
  const movedRef = React.useRef(false)

  // Live "now" indicator — tick every minute so the red line tracks the clock.
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const dayCount = days.length

  React.useEffect(() => {
    const el = bodyRef.current
    const Observer = (el?.ownerDocument.defaultView as typeof window | null)?.ResizeObserver ?? globalThis.ResizeObserver
    if (!el || !Observer) return
    const ro = new Observer(() => {
      setColWidth(Math.max(0, (el.clientWidth - 48) / dayCount))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [dayCount])

  const dayKeys = days.map(isoDay)
  const { startHour, endHour } = React.useMemo(
    () => gridHourWindow(items, dayStartHour, dayEndHour),
    [items, dayStartHour, dayEndHour]
  )
  const startBound = startHour * 60
  const endBound = endHour * 60
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)

  React.useEffect(() => {
    const el = bodyRef.current
    if (!el || !selectedTime) return
    const target = Math.max(0, ((timeToMinutes(selectedTime) - startBound) / 60) * HOUR_PX - HOUR_PX)
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: target, behavior: 'smooth' })
    else el.scrollTop = target
  }, [selectedTime, startBound])

  const timed = items.filter((it) => it.startTime)
  // The all-day strip always tracks the hour grid below it — in compact mode that
  // is the single selected day, one full-width chip per item. Spreading the whole
  // week over seven sidebar columns clipped every chip to three letters; the day
  // picker's presence dot is what surfaces all-day items on the other days.
  const allDayDays = days
  const allDay = items.filter((it) => !it.startTime)

  // Horizontal geometry for overlapping blocks, one cluster pass per day. Keyed
  // by day *and* id, because a recurrence can land on two days of the same week
  // and needs its own lane on each.
  const laneLayout = React.useMemo(() => {
    const byDay = new Map<string, CalItem[]>()
    for (const it of items) {
      if (!it.startTime) continue
      const list = byDay.get(it.date) ?? []
      list.push(it)
      byDay.set(it.date, list)
    }
    const out = new Map<string, BlockLayout>()
    for (const [date, list] of byDay) {
      for (const [id, geometry] of layoutOverlaps(list)) out.set(`${date}:${id}`, geometry)
    }
    return out
  }, [items])

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const todayIndex = days.findIndex((d) => sameDay(d, now))
  const showNow = todayIndex >= 0 && nowMin >= startBound && nowMin <= endBound
  const nowTop = ((nowMin - startBound) / 60) * HOUR_PX

  const beginDrag = (e: React.PointerEvent, item: CalItem, mode: 'move' | 'resize'): void => {
    e.preventDefault()
    e.stopPropagation()
    // Remote events and note-scraped dates can't be written back — don't let
    // them drag at all rather than snapping back after persistItemMove refuses.
    if (item.readOnly) return
    const dateIndex = dayKeys.indexOf(item.date)
    if (dateIndex === -1) return
    movedRef.current = false
    const startMin = item.startTime ? timeToMinutes(item.startTime) : startBound
    const endMin = item.endTime ? timeToMinutes(item.endTime) : startMin + 60
    setDrag({
      id: item.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origDateIndex: dateIndex,
      origStartMin: startMin,
      origEndMin: endMin,
      dateIndex,
      startMin,
      endMin
    })
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = dragRef.current
    if (!d) return
    if (Math.abs(e.clientX - d.startX) > 3 || Math.abs(e.clientY - d.startY) > 3) movedRef.current = true
    const dy = e.clientY - d.startY
    const minutesDelta = Math.round(dy / HOUR_PX * 60 / SNAP_MIN) * SNAP_MIN

    if (d.mode === 'create') {
      const rawCurrent = d.origStartMin + minutesDelta
      const lo = Math.max(startBound, Math.min(d.origStartMin, rawCurrent))
      const hi = Math.min(endBound, Math.max(d.origStartMin, rawCurrent))
      setDrag({ ...d, startMin: lo, endMin: hi > lo ? hi : lo + SNAP_MIN })
    } else if (d.mode === 'move') {
      const dx = e.clientX - d.startX
      const dayDelta = colWidth ? Math.round(dx / colWidth) : 0
      const duration = d.origEndMin - d.origStartMin
      const dateIndex = Math.max(0, Math.min(dayCount - 1, d.origDateIndex + dayDelta))
      const startMin = Math.max(startBound, Math.min(endBound - duration, d.origStartMin + minutesDelta))
      setDrag({ ...d, dateIndex, startMin, endMin: startMin + duration })
    } else {
      const endMin = Math.max(d.origStartMin + SNAP_MIN, Math.min(endBound, d.origEndMin + minutesDelta))
      setDrag({ ...d, endMin })
    }
  }

  const endDrag = (): void => {
    const d = dragRef.current
    if (!d) return
    setDrag(null)

    if (d.mode === 'create') {
      const date = dayKeys[d.dateIndex]
      onCreate(date, minutesToTime(d.startMin), minutesToTime(d.endMin))
      return
    }

    const item = timed.find((it) => it.id === d.id)
    if (!item) return
    const moved =
      d.dateIndex !== d.origDateIndex || d.startMin !== d.origStartMin || d.endMin !== d.origEndMin
    if (moved) {
      onCommit(item, dayKeys[d.dateIndex], minutesToTime(d.startMin), minutesToTime(d.endMin))
    }
  }

  const onColumnPointerDown = (e: React.PointerEvent, dayIndex: number): void => {
    if (dragRef.current) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetY = e.clientY - rect.top
    const raw = startBound + (offsetY / HOUR_PX) * 60
    const snapped = Math.round(raw / SNAP_MIN) * SNAP_MIN
    const startMin = Math.max(startBound, Math.min(endBound - SNAP_MIN, snapped))
    movedRef.current = false
    setDrag({
      id: '__create__',
      mode: 'create',
      startX: e.clientX,
      startY: e.clientY,
      origDateIndex: dayIndex,
      origStartMin: startMin,
      origEndMin: startMin + 60,
      dateIndex: dayIndex,
      startMin,
      endMin: startMin + 60
    })
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const timeFromPointerY = (e: React.MouseEvent, el: Element): string => {
    const rect = el.getBoundingClientRect()
    const offsetY = e.clientY - rect.top
    const raw = startBound + (offsetY / HOUR_PX) * 60
    return minutesToTime(Math.round(raw / SNAP_MIN) * SNAP_MIN)
  }

  return (
    <div className="calendar-weekgrid" style={{ ['--week-cols' as string]: dayCount }}>
      {compact && weekDays && onPickDay ? (
        <div className="calendar-weekgrid-daypicker">
          {weekDays.map((d) => {
            const isSel = selectedDay ? sameDay(d, selectedDay) : false
            const isToday = sameDay(d, today)
            const hasItems = (itemsByDay?.get(isoDay(d))?.length ?? 0) > 0
            return (
              <button
                key={isoDay(d)}
                type="button"
                className={`calendar-daypick${isSel ? ' selected' : ''}${isToday ? ' today' : ''}`}
                onClick={() => onPickDay(d)}
              >
                <span className="calendar-daypick-dow">{localizedWeekday(d.getDay(), api.ui.language())}</span>
                <span className="calendar-daypick-num">{d.getDate()}</span>
                <span className={`calendar-daypick-dot${hasItems ? ' on' : ''}`} />
              </button>
            )
          })}
        </div>
      ) : (
        <div className="calendar-weekgrid-head">
          <div className="calendar-weekgrid-gutter calendar-weekgrid-headgutter" />
          {days.map((d) => {
            const isSel = selectedDay ? sameDay(d, selectedDay) : false
            return (
              <button
                key={isoDay(d)}
                type="button"
                className={`calendar-weekgrid-dayhead${sameDay(d, today) ? ' today' : ''}${isSel ? ' selected' : ''}`}
                onClick={() => onPickDay?.(d)}
              >
                <span className="calendar-weekgrid-dow">{localizedWeekday(d.getDay(), api.ui.language())}</span>
                <span className="calendar-weekgrid-dom">{d.getDate()}</span>
              </button>
            )
          })}
        </div>
      )}

      {allDay.length > 0 && (
        <div className={`calendar-weekgrid-allday${compact ? ' calendar-weekgrid-allday--compact' : ''}`}>
          <div className="calendar-weekgrid-gutter">{uiText('auto.1ac1ff7616a6')}</div>
          {allDayDays.map((d) => {
            const key = isoDay(d)
            const here = allDay.filter((it) => it.date === key)
            return (
              <div key={key} className="calendar-weekgrid-alldaycol">
                {here.map((it) => {
                  const revealed = isRevealTarget(it, revealTarget)
                  const selected = calendarItemKey(it) === selectedItemKey
                  return (
                  <div role="button" tabIndex={0}
                    onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelectItem(it) } }}
                    key={`${it.occurrenceKey ?? it.id}:${revealed ? revealTarget?.nonce : 0}`}
                    className={`calendar-chip${it.borderColor ? ' outlined' : ''}${selected ? ' selected' : ''}${revealed ? ' calendar-reveal-target' : ''}`}
                    aria-pressed={selected}
                    data-calendar-source-id={it.sourceId}
                    data-calendar-item-id={it.id}
                    style={{
                      ['--chip-color' as string]: paletteCssValue(colorFor(it)),
                      ...(it.borderColor ? { ['--chip-border' as string]: paletteCssValue(it.borderColor) } : {})
                    }}
                    title={itemTooltip(it)}
                    onClick={(e) => { e.stopPropagation(); onSelectItem(it) }}
                    onDoubleClick={(e) => { e.stopPropagation(); onEditItem(it) }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onItemAction?.(it, e) }}
                  >
                    <CalendarCompletion item={it} />
          {!(it.kind === 'sourced' && typeof it.completed === 'boolean') && (it.sourceOwner ? <PluginGlyph owner={it.sourceOwner} /> : it.icon && <NoteDateGlyph id={it.icon} className="calendar-chip-glyph" />)}
                    <span className="calendar-chip-title">{it.title}</span>
                    <ItemBadges badges={it.badges} />
                  </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      <div
        className="calendar-weekgrid-body"
        ref={bodyRef}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="calendar-weekgrid-gutter calendar-weekgrid-hours">
          {hours.map((h) => (
            <div key={h} className="calendar-weekgrid-hour" style={{ height: HOUR_PX }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {days.map((d, dayIndex) => {
          const key = isoDay(d)
          const here = timed.filter((it) => it.date === key)
          const creation = drag?.mode === 'create' && drag.dateIndex === dayIndex
            ? { start: drag.startMin, end: drag.endMin }
            : !drag && draft?.date === key && draft.startTime && draft.endTime
              ? { start: timeToMinutes(draft.startTime), end: timeToMinutes(draft.endTime) }
              : null
          return (
            <div
              key={key}
              className="calendar-weekgrid-col"
              style={{ height: hours.length * HOUR_PX }}
              onPointerDown={(e) => onColumnPointerDown(e, dayIndex)}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onContextMenu?.(e, key, timeFromPointerY(e, e.currentTarget))
              }}
            >
              {hours.map((h) => (
                <div key={h} className="calendar-weekgrid-cell" style={{ height: HOUR_PX }} />
              ))}
              {here.map((it) => {
                const revealed = isRevealTarget(it, revealTarget)
                const selected = calendarItemKey(it) === selectedItemKey
                const dragging = drag?.id === it.id
                const startMin = dragging ? drag!.startMin : timeToMinutes(it.startTime!)
                const endMin = dragging
                  ? drag!.endMin
                  : it.endTime ? timeToMinutes(it.endTime) : startMin + 60
                const top = (startMin - startBound) / 60 * HOUR_PX
                const height = Math.max(18, (endMin - startMin) / 60 * HOUR_PX)
                const isMovingHere = drag?.mode === 'move' && drag.id === it.id && drag.dateIndex === dayIndex
                const isElsewhere = drag?.mode === 'move' && drag.id === it.id && drag.dateIndex !== dayIndex
                // Overlapping blocks share the column — except the one being
                // dragged, which takes it all back: you cannot read what you are
                // moving through a neighbour lapping over it.
                const lane = dragging ? undefined : laneLayout.get(`${key}:${it.id}`)
                return (
                  <div
                    key={`${it.occurrenceKey ?? it.id}:${revealed ? revealTarget?.nonce : 0}`}
                    className={`calendar-weekgrid-block${it.borderColor ? ' outlined' : ''}${it.completed ? ' completed' : ''}${selected ? ' selected' : ''}${(dragging && drag.mode !== 'move') || isMovingHere ? ' dragging' : ''}${isElsewhere ? ' drag-ghost' : ''}${revealed ? ' calendar-reveal-target' : ''}`}
                    aria-selected={selected}
                    data-calendar-source-id={it.sourceId}
                    data-calendar-item-id={it.id}
                    style={{
                      top: isElsewhere ? (it.startTime ? (timeToMinutes(it.startTime) - startBound) / 60 * HOUR_PX : 0) : top,
                      height: isElsewhere ? Math.max(18, ((it.endTime ? timeToMinutes(it.endTime) : (it.startTime ? timeToMinutes(it.startTime) : 0) + 60) - (it.startTime ? timeToMinutes(it.startTime) : 0)) / 60 * HOUR_PX) : height,
                      ['--chip-color' as string]: paletteCssValue(colorFor(it)),
                      ...(it.borderColor ? { ['--chip-border' as string]: paletteCssValue(it.borderColor) } : {}),
                      zIndex: (dragging && drag.mode !== 'move') || isMovingHere ? 9 : selected ? 7 : lane?.z,
                      ...(lane
                        ? {
                            ['--block-left' as string]: `${lane.left * 100}%`,
                            ['--block-width' as string]: `${lane.width * 100}%`
                          }
                        : {})
                    }}
                    onPointerDown={(e) => beginDrag(e, it, 'move')}
                    onClick={(e) => { e.stopPropagation(); if (!movedRef.current) onSelectItem(it) }}
                    onDoubleClick={(e) => { e.stopPropagation(); if (!movedRef.current) onEditItem(it) }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onItemAction?.(it, e) }}
                    title={`${itemTooltip(it)} · ${minutesToTime(startMin)}–${minutesToTime(endMin)}`}
                  >
                    <span className="calendar-weekgrid-block-time">{minutesToTime(startMin)}{it.timeZone && it.timeZone !== 'floating' ? ` ${it.timeZone}` : ''}</span>
                    <span className="calendar-weekgrid-block-title">
                      <CalendarCompletion item={it} />
          {!(it.kind === 'sourced' && typeof it.completed === 'boolean') && (it.sourceOwner ? <PluginGlyph owner={it.sourceOwner} /> : it.icon && <NoteDateGlyph id={it.icon} className="calendar-chip-glyph" />)}
                      <span className="calendar-weekgrid-block-name">{it.title}</span>
                      <ItemBadges badges={it.badges} />
                    </span>
                    {!it.readOnly && (
                      <div
                        className="calendar-weekgrid-resize"
                        onPointerDown={(e) => beginDrag(e, it, 'resize')}
                      />
                    )}
                  </div>
                )
              })}
              {creation && (
                <div
                  className="calendar-weekgrid-block calendar-weekgrid-block--create"
                  style={{
                    top: (creation.start - startBound) / 60 * HOUR_PX,
                    height: Math.max(18, (creation.end - creation.start) / 60 * HOUR_PX),
                    ['--chip-color' as string]: 'var(--accent-color)'
                  }}
                >
                  <span className="calendar-weekgrid-block-title">{uiText('auto.ad8919ace091')}</span>
                  <span className="calendar-weekgrid-block-time">{minutesToTime(creation.start)}–{minutesToTime(creation.end)}</span>
                </div>
              )}
              {/* Ghost block showing move destination in a different day */}
              {drag?.mode === 'move' && drag.dateIndex === dayIndex && drag.id !== '__create__' && (
                (() => {
                  const movingItem = timed.find((it) => it.id === drag.id)
                  if (!movingItem || dayKeys.indexOf(movingItem.date) === dayIndex) return null
                  const top2 = (drag.startMin - startBound) / 60 * HOUR_PX
                  const duration = drag.endMin - drag.startMin
                  const height2 = Math.max(18, duration / 60 * HOUR_PX)
                  return (
                    <div
                      className="calendar-weekgrid-block calendar-weekgrid-block--ghost"
                      style={{
                        top: top2,
                        height: height2,
                        ['--chip-color' as string]: paletteCssValue(colorFor(movingItem))
                      }}
                    >
                      <span className="calendar-weekgrid-block-time">{minutesToTime(drag.startMin)}</span>
                      <span className="calendar-weekgrid-block-title">{movingItem.title}</span>
                    </div>
                  )
                })()
              )}
            </div>
          )
        })}
        {showNow && (
          <div className="calendar-weekgrid-now" style={{ top: nowTop }}>
            <span className="calendar-weekgrid-now-time">{minutesToTime(nowMin)}</span>
            <span className="calendar-weekgrid-now-line" />
            <span
              className="calendar-weekgrid-now-line calendar-weekgrid-now-line--today"
              style={{ left: 48 + todayIndex * colWidth, width: colWidth }}
            />
            <span
              className="calendar-weekgrid-now-dot"
              style={{ left: 48 + todayIndex * colWidth }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function isRevealTarget(item: CalItem, target: CalendarRevealTarget | null): boolean {
  // An empty `sourceId` is the Calendar's own event — the reveal addresses items
  // by owner, and the Calendar owns the ones no provider contributed.
  return !!target && (item.sourceId ?? '') === target.sourceId && item.id === target.itemId
}
