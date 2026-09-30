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
import { React, api } from './runtime'
import type { ReactElement, ReactNode } from 'react'
import type { ValleyGroup } from '@valley/plugin-sdk/types'
import { groupKey } from '@valley/plugin-sdk/groups'
import { paletteCssValue } from '@valley/plugin-sdk/palette'
import type { CalItem } from './items'
import { EVENTS_SOURCE_ID, NOTE_DATES_SOURCE_ID, providerSourceKey } from './settingsStore'
import { useNoteIndex } from './noteIndex'
import { saveNoteDateSources, useNoteDateSources } from './noteDateStore'
import { sourceMatchStats } from './noteDates'
import { ChevronRight, GripVertical, NoteDateGlyph } from './icons'
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
}

/** Which source contributed an item — the id the sources filter switches off. */
export function itemSourceId(item: CalItem): string {
  if (item.kind === 'event' || item.kind === 'file') return EVENTS_SOURCE_ID
  if (item.kind === 'noteDate') return NOTE_DATES_SOURCE_ID
  return item.sourceOwner ? providerSourceKey(item.sourceOwner) : ''
}

/**
 * The group an item belongs to. Calendar events carry a `groupId`; everything
 * else references a group **by name**, which is how `@valley/plugin-sdk/groups` models it.
 */
function groupOf(item: CalItem, groups: readonly ValleyGroup[]): ValleyGroup | undefined {
  if (item.groupId) {
    const byId = groups.find((g) => g.id === item.groupId)
    if (byId) return byId
  }
  if (!item.group) return undefined
  const key = groupKey(item.group)
  return groups.find((g) => groupKey(g.name) === key)
}

/**
 * Apply both filters. An item with no group is never hidden by a group filter —
 * switching "Pixar" off must not quietly take every ungrouped todo with it.
 */
export function visibleItems(
  items: readonly CalItem[],
  groups: readonly ValleyGroup[],
  hiddenGroups: readonly string[],
  hiddenSources: readonly string[]
): CalItem[] {
  if (hiddenGroups.length === 0 && hiddenSources.length === 0) return items as CalItem[]
  const hiddenGroupIds = new Set(hiddenGroups)
  const hiddenSourceIds = new Set(hiddenSources)
  return items.filter((item) => {
    if (hiddenSourceIds.has(itemSourceId(item))) return false
    if (hiddenGroupIds.size === 0) return true
    const group = groupOf(item, groups)
    return !group || !hiddenGroupIds.has(group.id)
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
    <dl className="props-info-table calendar-filter-properties">{options.map((option) => <div className="props-info-row calendar-filter-property-row" key={option.id}>
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
                className={`calendar-filter-option${selectionRunClass(visiblySelected, index)}`}
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

export function CalendarFilterButton({
  label,
  icon,
  options,
  hidden,
  settingsKey,
  emptyText,
  onOpenSettings,
  saveHidden
}: {
  label: string
  icon: ReactNode
  options: readonly CalendarFilterOption[]
  hidden: readonly string[]
  settingsKey?: string
  emptyText: string
  onOpenSettings?: () => void
  saveHidden?: (next: string[]) => Promise<boolean>
}): ReactElement {
  const filtered = options.some((option) => hidden.includes(option.id))
  return (
    <button
      type="button"
      className={`calendar-filter-btn${filtered ? ' active' : ''}`}
      aria-label={label}
      aria-haspopup="dialog"
      title={label}
      onClick={(event) => {
        const anchor = event.currentTarget
        void api.ui.openPopover(
          ({ close }) => (
            <CalendarFilterList
              label={label}
              options={options}
              hidden={hidden}
              settingsKey={settingsKey}
              emptyText={emptyText}
              onOpenSettings={onOpenSettings ? () => { close(); onOpenSettings() } : undefined}
              saveHidden={saveHidden}
            />
          ),
          { anchor, align: 'end' },
          { className: 'calendar-filter-popover', ariaLabel: label }
        )
      }}
    >
      <span className="calendar-filter-icon">{icon}</span>
    </button>
  )
}

export function NoteDateSourceFilterList({ embedded = false, collapsible = false }: { embedded?: boolean; collapsible?: boolean }): ReactElement {
  const sources = useNoteDateSources()
  const entries = useNoteIndex(sources)
  const [open, setOpen] = React.useState(!collapsible)
  const [expanded, setExpanded] = React.useState<string[]>([])
  const [error, setError] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const shown = sources.filter(source => !source.hidden)
  const commit = (next: typeof sources): void => {
    setSaving(true)
    void saveNoteDateSources(next).then(() => setError(false)).catch(() => setError(true)).finally(() => setSaving(false))
  }
  const reorder = api.ui.settings.useReorderDrag({
    items: shown, getId: source => source.id, getLabel: source => source.title, indicatorOnly: true, isDisabled: saving,
    onReorder: next => { const ids = new Set(next.map(source => source.id)); let position = 0; commit(sources.map(source => ids.has(source.id) ? next[position++] : source)) }
  })
  return <div className={`notedate-sidebar-sources${embedded ? ' embedded' : ''}`}>
    <div className="notedate-sources-header">
      {collapsible ? <button type="button" className="notedate-sources-heading" aria-expanded={open} onClick={() => setOpen(value => !value)}><ChevronRight />{uiText('calendar.filter.noteDates')}</button> : <span>{uiText('calendar.filter.noteDates')}</span>}
      <api.ui.settings.Toggle label={uiText('sources.toggleAll')} checked={shown.length > 0 && shown.every(source => source.visible)} disabled={saving || !shown.length} onChange={visible => commit(sources.map(source => source.hidden ? source : { ...source, visible }))} />
    </div>
    {open && <div className="notedate-sidebar-list">
      {shown.map(source => <div key={source.id} className="notedate-sidebar-source notedate-source-sortable" {...reorder.getItemProps(source)}>
        <div className="notedate-sidebar-row">
          <button {...reorder.getHandleProps(source)} className="settings-reorder-handle notedate-source-grip" title={uiText('sources.reorder')}><GripVertical /></button>
          <button type="button" className="notedate-source-disclosure" aria-expanded={expanded.includes(source.id)} aria-label={uiText('sources.details', { title: source.title })} onClick={() => setExpanded(ids => ids.includes(source.id) ? ids.filter(id => id !== source.id) : [...ids, source.id])}><ChevronRight /></button>
          <span className="notedate-sidebar-glyph" style={source.color ? { color: paletteCssValue(source.color) } : undefined}><NoteDateGlyph id={source.icon || 'calendar'} /></span>
          <span className="notedate-sidebar-title">{source.title || uiText('calendar.noteDatePreset.blank')}</span>
          <span className="calendar-filter-option-count">{sourceMatchStats(entries, source).dated}</span>
          <api.ui.settings.Toggle checked={source.visible} label={source.title || uiText('calendar.noteDatePreset.blank')} disabled={saving} onChange={visible => commit(sources.map(item => item.id === source.id ? { ...item, visible } : item))} />
        </div>
        {expanded.includes(source.id) && <div className="notedate-sidebar-details"><span>{source.matchKey}: {source.matchValue}</span><span>{source.dateField} · {uiText(source.match === 'day-month' ? 'auto.dd4b99ddaf61' : source.match === 'day' ? 'auto.b6f727f0c520' : 'auto.fd303c72a405')}</span>{source.folder && <span>{source.folder}</span>}<button type="button" onClick={() => api.workspace.openOwnSettings('dates')}>{uiText('sources.edit')}</button></div>}
      </div>)}
      {!shown.length && <p className="notedate-sources-description">{uiText('calendar.filter.noSources')}</p>}
      {reorder.liveRegion}
    </div>}
    {error && <p role="alert" className="settings-path-error">{api.ui.t('error.commandFailed')}</p>}
  </div>
}
