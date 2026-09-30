import { PluginGlyph } from './CalendarPreview'
import { CalendarCompletion } from './items'
import { React, api } from './runtime'
import { paletteCssValue } from '@valley/plugin-sdk/palette'
import type { ReactElement } from 'react'
import type { } from '@valley/plugin-sdk/types'
import type { CalendarRevealTarget } from '@valley/plugin-sdk'
import { isoDay, isoWeek, localizedMonth, localizedWeekday, monthGrid, orderedWeekdayIndices, sameDay } from './dateMath'

import { calendarItemKey, itemTooltip, type CalItem } from './items'
import { ItemBadges, NoteDateGlyph } from './icons'
import { uiText } from './localization'

// ── month / day chips ────────────────────────────────────────────────────────

export function DayChips({
  items,
  colorFor,
  selectedItemKey,
  onSelectItem,
  onEditItem,
  onItemAction,
  revealTarget
}: {
  items: CalItem[]
  colorFor: (item: CalItem) => string
  selectedItemKey: string | null
  onSelectItem: (item: CalItem) => void
  onEditItem: (item: CalItem) => void
  onItemAction: (item: CalItem, e: React.MouseEvent) => void
  revealTarget: CalendarRevealTarget | null
}): ReactElement | null {
  if (items.length === 0) return null
  const shown = items.slice(0, 3)
  const extra = items.length - shown.length
  return (
    <div className="calendar-chips">
      {shown.map((it) => {
        const revealed = isRevealTarget(it, revealTarget)
        const selected = calendarItemKey(it) === selectedItemKey
        return (
        <div role="button" tabIndex={0}
          onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelectItem(it) } }}
          key={`${it.occurrenceKey ?? it.id}:${revealed ? revealTarget?.nonce : 0}`}
          className={`calendar-chip${it.completed ? ' completed' : ''}${it.borderColor ? ' outlined' : ''}${selected ? ' selected' : ''}${revealed ? ' calendar-reveal-target' : ''}`}
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
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onItemAction(it, e) }}
        >
          <CalendarCompletion item={it} />
          {!(it.kind === 'sourced' && typeof it.completed === 'boolean') && (it.sourceOwner ? <PluginGlyph owner={it.sourceOwner} /> : it.icon && <NoteDateGlyph id={it.icon} className="calendar-chip-glyph" />)}
          {it.startTime && <span className="calendar-chip-time">{it.startTime}</span>}
          <span className="calendar-chip-title">{it.title}</span>
          <ItemBadges badges={it.badges} />
        </div>
        )
      })}
      {extra > 0 && <span className="calendar-chip-more">+{extra}</span>}
    </div>
  )
}

export function MonthGrid({
  year,
  month,
  today,
  selected,
  weekStart,
  compact,
  itemsByDay,
  colorFor,
  onPick,
  onPickWeek,
  selectedItemKey,
  onSelectItem,
  onEditItem,
  onItemAction,
  inRange,
  onRangeStart,
  onRangeOver,
  onRangeEnd,
  onContextMenu,
  revealTarget
}: {
  year: number
  month: number
  today: Date
  selected: Date
  weekStart: number
  compact: boolean
  itemsByDay: Map<string, CalItem[]>
  colorFor: (item: CalItem) => string
  onPick: (d: Date, e?: React.MouseEvent) => void
  onPickWeek: (d: Date) => void
  selectedItemKey: string | null
  onSelectItem: (item: CalItem) => void
  onEditItem: (item: CalItem) => void
  onItemAction: (item: CalItem, e: React.MouseEvent) => void
  inRange: (d: Date) => boolean
  onRangeStart: (d: Date) => void
  onRangeOver: (d: Date) => void
  onRangeEnd: () => void
  onContextMenu: (e: React.MouseEvent, date: Date) => void
  revealTarget: CalendarRevealTarget | null
}): ReactElement {
  const days = monthGrid(year, month, weekStart)
  return (
    <div className="calendar-grid" onMouseUp={onRangeEnd}>
      <div className="calendar-week-heading">W</div>
      {orderedWeekdayIndices(weekStart).map((day) => (
        <div className="calendar-day-heading" key={day}>{localizedWeekday(day, api.ui.language())}</div>
      ))}
      {Array.from({ length: 6 }, (_, week) => (
        <React.Fragment key={week}>
          <button
            type="button"
            className="calendar-week-number"
            onClick={() => onPickWeek(days[week * 7])}
            title={uiText('auto.4869ac12717f')}
          >
            {isoWeek(days[week * 7])}
          </button>
          {days.slice(week * 7, week * 7 + 7).map((date) => {
            const dayItems = itemsByDay.get(isoDay(date)) ?? []
            const revealed = dayItems.some((item) => isRevealTarget(item, revealTarget))
            return (
            <DayCell
              key={`${date.toISOString()}:${revealed ? revealTarget?.nonce : 0}`}
              date={date}
              outside={date.getMonth() !== month}
              today={today}
              selected={selected}
              compact={compact}
              items={dayItems}
              colorFor={colorFor}
              inRange={inRange(date)}
              onPick={onPick}
              selectedItemKey={selectedItemKey}
              onSelectItem={onSelectItem}
              onEditItem={onEditItem}
              onItemAction={onItemAction}
              onRangeStart={onRangeStart}
              onRangeOver={onRangeOver}
              onContextMenu={onContextMenu}
              revealTarget={revealTarget}
            />
            )
          })}
        </React.Fragment>
      ))}
    </div>
  )
}

export function YearGrid({
  year,
  today,
  weekStart,
  onPickMonth,
  revealTarget
}: {
  year: number
  today: Date
  weekStart: number
  onPickMonth: (m: number) => void
  revealTarget: CalendarRevealTarget | null
}): ReactElement {
  const headings = orderedWeekdayIndices(weekStart)
  return (
    <div className="calendar-year">
      {Array.from({ length: 12 }, (_, m) => {
        const days = monthGrid(year, m, weekStart)
        const name = localizedMonth(m, api.ui.language())
        return (
          <button className="calendar-mini" key={m} onClick={() => onPickMonth(m)}>
            <div className="calendar-mini-name">{name}</div>
            <div className="calendar-mini-grid">
              {headings.map((day) => (
                <div className="calendar-mini-heading" key={day}>{localizedWeekday(day, api.ui.language(), 'narrow')}</div>
              ))}
              {days.map((date) => {
                const outside = date.getMonth() !== m
                const isToday = sameDay(date, today)
                const revealed = !outside && isoDay(date) === revealTarget?.date
                return (
                  <div
                    key={`${date.toISOString()}:${revealed ? revealTarget?.nonce : 0}`}
                    className={`calendar-mini-day ${outside ? 'outside' : ''} ${isToday ? 'today' : ''}${revealed ? ' calendar-reveal-target' : ''}`}
                  >
                    {date.getDate()}
                  </div>
                )
              })}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function DayCell({
  date,
  outside,
  today,
  selected,
  compact,
  items,
  colorFor,
  inRange,
  onPick,
  selectedItemKey,
  onSelectItem,
  onEditItem,
  onItemAction,
  onRangeStart,
  onRangeOver,
  onContextMenu,
  revealTarget
}: {
  date: Date
  outside: boolean
  today: Date
  selected: Date
  compact: boolean
  items: CalItem[]
  colorFor: (item: CalItem) => string
  inRange: boolean
  onPick: (d: Date, e?: React.MouseEvent) => void
  selectedItemKey: string | null
  onSelectItem: (item: CalItem) => void
  onEditItem: (item: CalItem) => void
  onItemAction: (item: CalItem, e: React.MouseEvent) => void
  onRangeStart: (d: Date) => void
  onRangeOver: (d: Date) => void
  onContextMenu: (e: React.MouseEvent, date: Date) => void
  revealTarget: CalendarRevealTarget | null
}): ReactElement {
  const isToday = sameDay(date, today)
  const isSelected = sameDay(date, selected)
  const revealIndex = items.findIndex((item) => isRevealTarget(item, revealTarget))
  const revealCell = revealIndex >= 0 && (compact || revealIndex >= 3)
  return (
    <div
      className={`calendar-day-cell ${outside ? 'outside' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${inRange ? 'in-range' : ''}${revealCell ? ' calendar-reveal-target calendar-reveal-day' : ''}`}
      onMouseDown={() => onRangeStart(date)}
      onMouseEnter={() => onRangeOver(date)}
      onContextMenu={(e) => onContextMenu(e, date)}
      onClick={(e) => {
        if ((e.target as Element).closest('.calendar-chip')) return
        onPick(date, e)
      }}
    >
      <div className="calendar-day-cell-head">
        <span className="calendar-day-num">{date.getDate()}</span>
      </div>
      {!compact && (
        <DayChips
          items={items}
          colorFor={colorFor}
          selectedItemKey={selectedItemKey}
          onSelectItem={onSelectItem}
          onEditItem={onEditItem}
          onItemAction={onItemAction}
          revealTarget={revealTarget}
        />
      )}
      {compact && items.length > 0 && (
        <div className="calendar-day-dots">
          {items.slice(0, 4).map((it) => (
            <span
              key={it.occurrenceKey ?? it.id}
              className={`calendar-day-dot${isRevealTarget(it, revealTarget) ? ' calendar-reveal-dot' : ''}`}
              style={{ background: paletteCssValue(colorFor(it)) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function isRevealTarget(item: CalItem, target: CalendarRevealTarget | null): boolean {
  // An empty `sourceId` is the Calendar's own event — the reveal addresses items
  // by owner, and the Calendar owns the ones no provider contributed.
  return !!target && (item.sourceId ?? '') === target.sourceId && item.id === target.itemId
}
