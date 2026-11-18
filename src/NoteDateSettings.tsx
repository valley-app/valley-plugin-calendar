import { React, api } from './runtime'
import type { FC, ReactNode } from 'react'
import { parseDatePattern } from '@valley/plugin-sdk/datePattern'
import { paletteCssContrast, paletteCssValue, paletteRef } from '@valley/plugin-sdk/palette'
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, GripVertical, noteDateGlyphs, NoteDateGlyph, Plus, Trash, X } from './icons'
import {
  MAX_RECURRENCE_LIMIT_YEARS,
  NOTE_DATE_PRESETS,
  defaultNoteDateSource,
  isSourceActive,
  presetNoteDateSource,
  sourceMatchStats,
  type NoteDateSource
} from './noteDates'
import { loadNoteDateSources, saveNoteDateSources, useNoteDateSources } from './noteDateStore'
import { useNoteIndex } from './noteIndex'
import type { NoteDateIndexEntry } from './noteDates'
import { CALENDAR_ICON_FOLDER, refreshNoteDateIcons, useNoteDateIcons } from './noteDateIcons'
import { uiText } from './localization'

const Button: typeof api.ui.settings.Button = (props) => React.createElement(api.ui.settings.Button, props)
const TextField: typeof api.ui.settings.TextField = (props) => React.createElement(api.ui.settings.TextField, props)

/** Two-click confirm delete (trash → red confirm), auto-disarming after a few seconds. */
const ConfirmRemove: FC<{ onDelete: () => void; label: string }> = ({ onDelete, label }) => {
  const [armed, setArmed] = React.useState(false)
  const timer = React.useRef<number | null>(null)
  const disarm = React.useCallback((): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setArmed(false)
  }, [])
  React.useEffect(() => disarm, [disarm])
  return (
    <Button
      className="notedate-source-toggle"
      variant={armed ? 'danger' : 'ghost'}
      size="small"
      onClick={() => {
        if (armed) { disarm(); onDelete(); return }
        setArmed(true)
        if (timer.current !== null) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setArmed(false), 3500)
      }}
      onBlur={disarm}
      title={armed ? uiText('auto.d75a293ea22a') : uiText('auto.c845e23963ef', { p0: label })}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Trash /> {armed ? uiText('auto.04a212215ef9') : uiText('sources.delete')}</span>
    </Button>
  )
}

/** A kit text field that drafts locally and saves on commit, so a save never re-renders it mid-word. */
const DraftTextField: FC<{
  value: string
  ariaLabel: string
  placeholder?: string
  invalid?: boolean
  onCommit: (value: string) => void
}> = ({ value, ariaLabel, placeholder, invalid, onCommit }) => {
  const [draft, setDraft] = React.useState(value)
  React.useEffect(() => setDraft(value), [value])
  return (
    <TextField
      value={draft}
      onChange={setDraft}
      onCommit={onCommit}
      onEscape={() => setDraft(value)}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      invalid={invalid}
    />
  )
}

const DraftFolderField: FC<{ value: string; onCommit: (value: string) => void }> = ({ value, onCommit }) => {
  const { RealmFolderField } = api.ui.settings
  const [draft, setDraft] = React.useState(value)
  React.useEffect(() => setDraft(value), [value])
  return (
    <RealmFolderField
      value={draft}
      onChange={setDraft}
      onCommit={onCommit}
      onEscape={() => setDraft(value)}
      placeholder={uiText('auto.ad980036b394')}
      ariaLabel={uiText('auto.0623bfa38c8f')}
    />
  )
}

/** The optional end of a recurring source, in whole years; empty means no end. */
const RangeField: FC<{ value: number | undefined; onCommit: (value: number | undefined) => void }> = ({ value, onCommit }) => {
  const { NumberField } = api.ui.settings
  const [draft, setDraft] = React.useState<number | null>(value ?? null)
  React.useEffect(() => setDraft(value ?? null), [value])
  return (
    <NumberField
      value={draft}
      onChange={setDraft}
      onCommit={(next) => {
        if (next === null || !Number.isFinite(next)) { setDraft(null); onCommit(undefined); return }
        const clamped = Math.max(0, Math.min(MAX_RECURRENCE_LIMIT_YEARS, Math.floor(next)))
        setDraft(clamped)
        onCommit(clamped)
      }}
      min={0}
      max={MAX_RECURRENCE_LIMIT_YEARS}
      step={1}
      allowEmpty
      placeholder={uiText('auto.48a7b8889e15')}
      ariaLabel={uiText('auto.1389fda4dae3')}
    />
  )
}

/**
 * One optional colour: `ring` draws the value as an outline, `fill` as a solid
 * chip. Unset renders the kit's "none" chip — the entry then inherits the
 * calendar's priority/status/neutral fallback — and a × clears it to unset.
 */
const ColorChip: FC<{
  variant: 'ring' | 'fill'
  value: string | undefined
  label: string
  onChange: (value: string | undefined) => void
}> = ({ variant, value, label, onChange }) => {
  const { ColorField } = api.ui.settings
  return (
    <span className="notedate-color-wrap">
      <ColorField
        variant={variant}
        unset={!value}
        value={value ?? paletteRef('primary-blue')}
        ariaLabel={label}
        onChange={onChange}
      />
      {value && (
        <button
          type="button"
          className="notedate-color-clear"
          aria-label={uiText('auto.f4a0d0857b02', { p0: label })}
          onClick={() => onChange(undefined)}
        >
          <X />
        </button>
      )}
    </span>
  )
}

/** Custom properties, not the colours themselves: an inline concrete colour outranks every stylesheet. */
function swatchStyle(source: NoteDateSource): Record<string, string> {
  return {
    ...(source.color ? { ['--swatch-fill' as string]: paletteCssValue(source.color), ['--swatch-on' as string]: paletteCssContrast(source.color) } : {}),
    ...(source.borderColor ? { ['--swatch-ring' as string]: paletteCssValue(source.borderColor) } : {})
  }
}

/** The source's entry look as a static disc: its glyph on its colour, inside its ring. */
const SourceDisc: FC<{ source: NoteDateSource }> = ({ source }) => (
  <span className={source.color ? 'notedate-source-disc' : 'notedate-source-disc unset'} aria-hidden="true" style={swatchStyle(source)}>
    {source.icon ? <NoteDateGlyph id={source.icon} /> : <span className="notedate-swatch-none">—</span>}
  </span>
)

/** The entry icons in a popover, with "No icon" first and the icon folder's actions below. */
export const NoteDateIconGrid: FC<{ selected: string | undefined; onSelect: (id: string | undefined) => void }> = ({ selected, onSelect }) => {
  const catalog = useNoteDateIcons()
  const label = (id: string): string => noteDateGlyphs().find(glyph => glyph.id === id)?.label ?? id.replace(/[-_]/g, ' ')
  return (
    <div className="notedate-icon-browser">
      <div className="notedate-glyph-grid">
        <button type="button" className={selected ? 'notedate-glyph-opt' : 'notedate-glyph-opt active'} aria-pressed={!selected}
          aria-label={uiText('auto.95553ba8a405')} title={uiText('auto.95553ba8a405')} onClick={() => onSelect(undefined)}>
          <span className="notedate-swatch-none">—</span>
        </button>
        {Object.keys(catalog.icons).map(id => (
          <button key={id} type="button" className={id === selected ? 'notedate-glyph-opt active' : 'notedate-glyph-opt'} aria-pressed={id === selected}
            aria-label={label(id)} title={`${id}.svg`} onClick={() => onSelect(id)}>
            <NoteDateGlyph id={id} />
          </button>
        ))}
      </div>
      <p className="notedate-icon-hint">{uiText('sources.icons.hint', { folder: CALENDAR_ICON_FOLDER })}</p>
      <div className="notedate-icon-actions">
        <Button variant="ghost" size="small" onClick={() => api.files.revealInFinder(CALENDAR_ICON_FOLDER)}>{uiText('sources.icons.open')}</Button>
        <Button variant="ghost" size="small" onClick={() => { void refreshNoteDateIcons() }}>{uiText('sources.icons.refresh')}</Button>
      </div>
      {catalog.error && <p role="alert" className="settings-path-error">{uiText('sources.icons.readError')}: {catalog.error}</p>}
    </div>
  )
}

/** The compact icon-only button that opens the entry icon grid. */
const IconPicker: FC<{ source: NoteDateSource; onChange: (id: string | undefined) => void }> = ({ source, onChange }) => {
  const ref = React.useRef<HTMLButtonElement>(null)
  return (
    <button ref={ref} type="button" className="notedate-source-icon-btn"
      aria-label={uiText('auto.92bcda7f379e')} title={uiText('auto.7bf74c2d99d6')}
      onClick={() => {
        if (!ref.current) return
        void refreshNoteDateIcons()
        void api.ui.openPopover(ctx => <NoteDateIconGrid selected={source.icon} onSelect={id => { onChange(id); ctx.close() }} />,
          { anchor: ref.current }, { className: 'notedate-icon-popover', ariaLabel: uiText('auto.92bcda7f379e') })
      }}>
      {source.icon ? <NoteDateGlyph id={source.icon} /> : <span className="notedate-swatch-none">—</span>}
    </button>
  )
}

interface SourceStatus {
  /** The full status sentence. */
  text: string
  /** Notes with a usable date, or null when the rule is unfinished or the source is off. */
  dated: number | null
  /** The rule matches notes but none has a usable date. */
  unusable: boolean
}

/**
 * What this source currently finds. A mistyped key, value or date property is
 * otherwise indistinguishable from an empty realm — nothing appears anywhere and
 * nothing says why. Zero matches stay neutral; only unusable dates are red.
 */
function useSourceStatus(source: NoteDateSource, entries: NoteDateIndexEntry[]): SourceStatus {
  const stats = React.useMemo(
    () => sourceMatchStats(entries, source),
    // Only the fields the predicate and the date parse actually read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, source.matchKey, source.matchValue, source.folder, source.dateField, source.dateFormat, source.match]
  )
  if (!isSourceActive(source)) return { text: uiText('sources.unfinished'), dated: null, unusable: false }
  const found = uiText(stats.matched === 1 ? 'sources.stats.foundOne' : 'sources.stats.found', { count: stats.matched })
  if (source.hidden) return { text: `${found} · ${uiText('sources.turnedOff')}`, dated: null, unusable: false }
  if (stats.matched === 0) return { text: found, dated: 0, unusable: false }
  if (stats.dated === 0) return { text: `${found} · ${uiText('sources.noUsableDate', { field: source.dateField })}`, dated: 0, unusable: true }
  return { text: `${found} · ${uiText('sources.stats.dated', { count: stats.dated })}`, dated: stats.dated, unusable: false }
}

const MatchStats: FC<{ status: SourceStatus }> = ({ status }) =>
  <span className={status.unusable ? 'notedate-source-stats warn' : 'notedate-source-stats'}>{status.text}</span>

const ruleSummary = (source: NoteDateSource): string =>
  isSourceActive(source) ? `${source.matchKey} = ${source.matchValue}` : uiText('sources.unfinished')

/** The one-line sub-line: rule, folder and an unusable-date warning. */
const SourceSubLine: FC<{ source: NoteDateSource; status: SourceStatus }> = ({ source, status }) => {
  if (source.hidden) return <span className="notedate-source-sub">{`${uiText('sources.turnedOff')} · ${ruleSummary(source)}`}</span>
  return (
    <span className="notedate-source-sub">
      {`${ruleSummary(source)} · ${source.folder || uiText('auto.ad980036b394')}`}
      {status.unusable && <> · <span className="notedate-source-warn">{uiText('sources.noUsableDate', { field: source.dateField })}</span></>}
    </span>
  )
}

/** One open-source section: a hairline above, a small title, then the form. */
const SourceGroup: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <section className="notedate-source-group">
    <h5 className="notedate-source-group-title">{title}</h5>
    <div className="notedate-source-form">{children}</div>
  </section>
)

/** A form line: the label column, then the control column right beside it. */
const FormRow: FC<{ label?: string; title?: string; children: ReactNode }> = ({ label, title, children }) => (
  <>
    <span className="settings-toggle-title notedate-source-form-label" title={title}>{label}</span>
    <div className="settings-row-control notedate-source-form-control">{children}</div>
  </>
)

/** A quiet line under the control it explains (status, hint). */
const FormNote: FC<{ children: ReactNode }> = ({ children }) => (
  <>
    <span className="notedate-source-form-label" aria-hidden="true" />
    <div className="notedate-source-form-note">{children}</div>
  </>
)

/**
 * One source. The head is identical open or closed — only the chevron turns —
 * so opening a source never moves its name, rule, count or switch. The whole
 * head except the grip and the switch opens and closes it.
 */
export const SourceRow: FC<{
  source: NoteDateSource
  entries: NoteDateIndexEntry[]
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<NoteDateSource>) => void
  onDelete: () => void
  handle?: ReactNode
}> = ({ source, entries, expanded, onToggle, onChange, onDelete, handle }) => {
  const { Toggle } = api.ui.settings
  const status = useSourceStatus(source, entries)
  const name = source.title || uiText('sources.untitled')
  const count = status.dated === null ? '–' : String(status.dated)
  return (
    <div className={`notedate-source-row${source.hidden ? ' is-off' : ''}${expanded ? ' is-open' : ''}`}>
      <div className="notedate-source-head" onClick={(event) => {
        if (!(event.target as Element).closest('.notedate-source-grip, [role=switch], [data-plugin-widget]')) onToggle()
      }}>
        {handle ?? <span aria-hidden="true" />}
        <SourceDisc source={source} />
        <span className="notedate-source-meta">
          <span className={source.title ? 'notedate-source-name' : 'notedate-source-name is-placeholder'}>{name}</span>
          <SourceSubLine source={source} status={status} />
        </span>
        <span className="notedate-source-count" title={status.text}>{count}</span>
        {/* A pointer press never focuses the chevron, so no ring is left behind after a click. */}
        <button type="button" className="notedate-source-disclosure" aria-expanded={expanded} aria-label={uiText('sources.details', { title: name })}
          onMouseDown={(event) => event.preventDefault()}><ChevronRight /></button>
        <Toggle checked={source.visible && !source.hidden} label={name} disabled={source.hidden} onChange={visible => onChange({ visible })} />
      </div>
      {expanded && <SourceEditor source={source} status={status} onChange={onChange} onDelete={onDelete} />}
    </div>
  )
}

/** The open source: name, then Notes, Date and Entry as one compact form, then use and delete. */
const SourceEditor: FC<{
  source: NoteDateSource
  status: SourceStatus
  onChange: (patch: Partial<NoteDateSource>) => void
  onDelete: () => void
}> = ({ source, status, onChange, onDelete }) => {
  const { ChipsField, Segmented, Toggle } = api.ui.settings
  // An unusable pattern marks the field but still parses through auto-detection, so nothing disappears.
  const formatValid = !source.dateFormat || parseDatePattern(source.dateFormat) !== null
  return (
    <div className="notedate-source-editor">
      <div className="notedate-source-form">
        <FormRow label={uiText('sources.form.name')} title={uiText('auto.4da8c4eff514')}>
          <DraftTextField
            value={source.title}
            placeholder={uiText('auto.35b023ecbb81')}
            ariaLabel={uiText('auto.475b6ce898d4')}
            onCommit={(value) => onChange({ title: value.trim() })}
          />
        </FormRow>
      </div>
      <SourceGroup title={uiText('sources.group.notes')}>
        <FormRow label={uiText('sources.folder')} title={uiText('sources.folderDescription')}>
          <DraftFolderField value={source.folder ?? ''} onCommit={(value) => onChange({ folder: value.trim() || undefined })} />
        </FormRow>
        <FormRow label={uiText('sources.matchProperty')}>
          <DraftTextField
            value={source.matchKey}
            placeholder="type"
            ariaLabel={uiText('auto.b82220d034e7')}
            onCommit={(value) => onChange({ matchKey: value.trim() })}
          />
          <span className="notedate-source-match-eq" aria-hidden="true">=</span>
          <DraftTextField
            value={source.matchValue}
            placeholder="contact"
            ariaLabel={uiText('auto.a3fa4c4a4715')}
            onCommit={(value) => onChange({ matchValue: value.trim() })}
          />
        </FormRow>
        <FormNote><MatchStats status={status} /></FormNote>
      </SourceGroup>
      <SourceGroup title={uiText('sources.group.date')}>
        <FormRow label={uiText('sources.matchProperty')} title={uiText('auto.7bf039eeb194')}>
          <DraftTextField
            value={source.dateField}
            placeholder="birthdate"
            ariaLabel={uiText('auto.691b674766e5')}
            onCommit={(value) => onChange({ dateField: value.trim() || 'date' })}
          />
        </FormRow>
        <FormRow label={uiText('sources.form.format')} title={uiText('auto.8bbc96d44546')}>
          <DraftTextField
            value={source.dateFormat ?? ''}
            placeholder={uiText('sources.form.formatPlaceholder')}
            ariaLabel={uiText('auto.94ee88690828')}
            invalid={!formatValid}
            onCommit={(value) => onChange({ dateFormat: value.trim() || undefined })}
          />
        </FormRow>
        <FormRow label={uiText('sources.form.repeats')}>
          <Segmented
            value={source.match}
            ariaLabel={uiText('auto.e10282ef1972')}
            options={[
              { value: 'exact', label: uiText('sources.match.exact') },
              { value: 'day-month', label: uiText('sources.match.yearly') },
              { value: 'day', label: uiText('sources.match.monthly') }
            ]}
            onChange={(v) => onChange({ match: v === 'day-month' || v === 'day' ? v : 'exact' })}
          />
        </FormRow>
        {source.match === 'day-month' && (
          <FormRow label={uiText('auto.9ddab8990070')} title={uiText('auto.5210c5c047ea')}>
            <Toggle checked={source.showCount} label={uiText('auto.9ddab8990070')} onChange={(checked) => onChange({ showCount: checked })} />
          </FormRow>
        )}
        {source.match !== 'exact' && (
          <FormRow label={uiText('auto.24bdcf2d51f8')} title={uiText('auto.6d07b3164ac0')}>
            <span className="notedate-source-range"><RangeField value={source.recurrenceLimitYears} onCommit={(value) => onChange({ recurrenceLimitYears: value })} /></span>
          </FormRow>
        )}
        <FormRow label={uiText('sources.form.time')} title={uiText('auto.519b42369442')}>
          <DraftTextField
            value={source.startTimeField ?? ''}
            placeholder={uiText('sources.form.start')}
            ariaLabel={uiText('auto.611f3791dc68')}
            onCommit={(value) => onChange({ startTimeField: value.trim() || undefined })}
          />
          <span className="notedate-source-match-eq" aria-hidden="true">–</span>
          <DraftTextField
            value={source.endTimeField ?? ''}
            placeholder={uiText('sources.form.end')}
            ariaLabel={uiText('auto.aee875c4edbf')}
            onCommit={(value) => onChange({ endTimeField: value.trim() || undefined })}
          />
        </FormRow>
        <FormNote><span className="notedate-source-hint">{uiText('sources.form.timeHint')}</span></FormNote>
      </SourceGroup>
      <SourceGroup title={uiText('sources.group.entry')}>
        <FormRow label={uiText('sources.form.look')}>
          <IconPicker source={source} onChange={(id) => onChange({ icon: id })} />
          <div className="notedate-source-color">
            <ColorChip variant="fill" value={source.color} label={uiText('auto.9fa90b203761')} onChange={(value) => onChange({ color: value })} />
            <ColorChip variant="ring" value={source.borderColor} label={uiText('auto.981f473aa731')} onChange={(value) => onChange({ borderColor: value })} />
          </div>
        </FormRow>
        <FormRow label={uiText('auto.768e0c1c6957')}>
          <Segmented
            value={source.labelMode}
            ariaLabel={uiText('auto.768e0c1c6957')}
            options={[
              { value: 'filename', label: uiText('auto.a3cbb98ddf5e') },
              { value: 'property', label: uiText('auto.9ae33a7d0ecb') }
            ]}
            onChange={(v) => onChange({ labelMode: v === 'property' ? 'property' : 'filename' })}
          />
        </FormRow>
        {source.labelMode === 'property' && (
          <FormRow>
            <DraftTextField
              value={source.labelField ?? ''}
              placeholder="firstName"
              ariaLabel={uiText('auto.55f1c767a3b1')}
              onCommit={(value) => onChange({ labelField: value.trim() || undefined })}
            />
          </FormRow>
        )}
        <FormRow label={uiText('auto.d97d1ee339e4')} title={uiText('sources.showFieldsDescription')}>
          <ChipsField
            items={source.showFields}
            ariaLabel={uiText('sources.showFields')}
            placeholder={uiText('sources.showFieldsPlaceholder')}
            reorderable
            removable
            normalize={(value) => value.trim()}
            onChange={(next) => onChange({ showFields: next.map((field) => field.trim()).filter(Boolean) })}
          />
        </FormRow>
      </SourceGroup>
      <div className="notedate-source-group notedate-source-footer">
        <span className="notedate-source-use" title={uiText('sources.useDescription')}>
          <span className="settings-toggle-title">{uiText('sources.use')}</span>
          <Toggle checked={!source.hidden} label={uiText('sources.use')} onChange={(on) => onChange({ hidden: !on })} />
        </span>
        <ConfirmRemove label={source.title || uiText('sources.untitled')} onDelete={onDelete} />
      </div>
    </div>
  )
}

/**
 * Settings → Calendar → Note dates: the sources that scrape notes for dates.
 * The section fills the pane (`layout: 'fill'` in config.json): the bar sits in
 * the ScrollPanel's header and never scrolls; everything else scrolls under it.
 */
export const NoteDatesSection: FC = () => {
  const { Toggle, useReorderDrag } = api.ui.settings
  const sources = useNoteDateSources()
  const indexEntries = useNoteIndex(sources)
  const [ready, setReady] = React.useState(false)
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set())
  const [added, setAdded] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [saveError, setSaveError] = React.useState(false)
  const top = React.useRef<HTMLParagraphElement>(null)
  // The menu hangs off this plugin-owned wrapper: the kit Button is a host widget, and its
  // event's currentTarget is no element the host can anchor a menu to.
  const addRow = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => { let alive = true; void loadNoteDateSources().then(() => { if (alive) setReady(true) }); return () => { alive = false } }, [])
  // A new source sits first: scroll the list back to its top, once. Clearing the mark keeps
  // later saves of that source (each one a new list) from scrolling the page up again.
  React.useEffect(() => {
    if (!added || sources[0]?.id !== added) return
    top.current?.ownerDocument.documentElement.scrollIntoView?.({ block: 'start' })
    setAdded('')
  }, [added, sources])
  const commit = (next: NoteDateSource[]): void => {
    void saveNoteDateSources(next).then(() => setSaveError(false)).catch(() => setSaveError(true))
  }
  const shownSources = sources.filter(source => `${source.title} ${source.folder ?? ''} ${source.matchKey} ${source.matchValue}`.toLowerCase().includes(query.trim().toLowerCase()))
  const anyOpen = shownSources.some(source => open.has(source.id))
  const reorder = useReorderDrag({
    items: shownSources, getId: source => source.id, getLabel: source => source.title, indicatorOnly: true,
    onReorder: next => { const ids = new Set(next.map(source => source.id)); let position = 0; commit(sources.map(source => ids.has(source.id) ? next[position++] : source)) }
  })
  const update = (id: string, patch: Partial<NoteDateSource>): void =>
    commit(sources.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const toggle = (id: string): void => setOpen(current => {
    const next = new Set(current)
    if (!next.delete(id)) next.add(id)
    return next
  })
  const add = (source: NoteDateSource): void => {
    setQuery('')
    setOpen(current => new Set(current).add(source.id))
    setAdded(source.id)
    commit([source, ...sources])
  }

  /**
   * The presets go through a menu rather than a row of buttons because a preset
   * is a *starting point*, not a mode — picking one adds an ordinary source the
   * user then edits, and nothing is created without the pick.
   */
  const addSource = (anchor: HTMLElement): void => {
    void api.ui.openMenu(
      [
        ...NOTE_DATE_PRESETS.map((preset) => ({
          id: preset.id,
          label: uiText(preset.labelKey) || preset.label,
          icon: <NoteDateGlyph id={preset.patch.icon} />,
          onSelect: () => add(presetNoteDateSource(preset.id, sources))
        })),
        { type: 'separator' as const },
        {
          id: 'blank',
          label: uiText('calendar.noteDatePreset.blank'),
          icon: <Plus />,
          onSelect: () => add(defaultNoteDateSource())
        }
      ],
      { anchor, align: 'start' }
    )
  }

  const bar = (
    <div className="settings-listpage-header notedate-sources-header"><span>{uiText('auto.958788fc103f')}</span><Toggle label={uiText('sources.toggleAll')} checked={sources.length > 0 && sources.every(source => source.visible)} disabled={!sources.length || !ready} onChange={visible => commit(sources.map(source => ({ ...source, visible })))} /></div>
  )
  return (
    <div className="notedate-settings-frame" data-plugin-widget-layout="fill">
      <api.ui.ScrollPanel fill className="notedate-settings-scroll" header={bar}>
        <section className="settings-section notedate-settings">
          <p ref={top} className="notedate-sources-description">{uiText('sources.description')}</p>
          {ready && <div className="notedate-sources-toolbar">
            {sources.length > 0 && <div className="search-field notedate-sources-search">
              <input className="search-field-input" value={query} onChange={event => setQuery(event.target.value)} placeholder={uiText('sources.search')} aria-label={uiText('sources.search')} />
            </div>}
            {sources.length > 0 && <button type="button" className="panel-tool-btn notedate-sources-fold" disabled={!shownSources.length}
              title={uiText(anyOpen ? 'sources.collapseAll' : 'sources.expandAll')} aria-label={uiText(anyOpen ? 'sources.collapseAll' : 'sources.expandAll')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setOpen(anyOpen ? new Set() : new Set(shownSources.map(source => source.id)))}>
              {anyOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
            </button>}
            <div ref={addRow} className="notedate-add-source-row">
              <Button
                variant="secondary"
                className="notedate-add-source"
                aria-haspopup="menu"
                onClick={() => { if (addRow.current) addSource(addRow.current) }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus /> {uiText('calendar.noteDate.addSource')}</span>
              </Button>
            </div>
          </div>}
          {saveError && <p role="alert" className="settings-path-error">{api.ui.t('error.commandFailed')}</p>}
          {ready && sources.length === 0 && <p className="settings-empty-text notedate-sources-empty">
            <span>{uiText('sources.empty')}</span><span>{uiText('sources.emptyHint')}</span>
          </p>}
          {sources.length > 0 && shownSources.length === 0 && <p className="settings-empty-text">{uiText('sources.noResults')}</p>}
          {ready && <div className="notedate-source-list">
            {shownSources.map((source) => (
              <div key={source.id} className="notedate-source-sortable" {...reorder.getItemProps(source)}>
                <SourceRow
                  source={source}
                  expanded={open.has(source.id)}
                  onToggle={() => toggle(source.id)}
                  handle={<button {...reorder.getHandleProps(source)} className="settings-reorder-handle notedate-source-grip" title={uiText('sources.reorder')}><GripVertical /></button>}
                  entries={indexEntries}
                  onChange={(patch) => update(source.id, patch)}
                  onDelete={() => commit(sources.filter((s) => s.id !== source.id))}
                />
              </div>
            ))}
            {reorder.liveRegion}
          </div>}
        </section>
      </api.ui.ScrollPanel>
    </div>
  )
}
