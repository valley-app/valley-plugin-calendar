import { React, api } from './runtime'
import type { FC, ReactElement, ReactNode } from 'react'
import { parseDatePattern } from '@valley/plugin-sdk/datePattern'
import { paletteCssContrast, paletteCssValue, paletteRef } from '@valley/plugin-sdk/palette'
import { ChevronRight, GripVertical, Eye, EyeOff, noteDateGlyphs, NoteDateGlyph, Plus, Trash, X } from './icons'
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
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Trash /> {armed ? uiText('auto.04a212215ef9') : uiText('auto.f6fdbe48dc54')}</span>
    </Button>
  )
}

/** The "Show" list: one input per frontmatter key, with per-row remove and add. */
const ShowFieldsEditor: FC<{ value: string[]; onCommit: (next: string[]) => void }> = ({ value, onCommit }) => {
  const [rows, setRows] = React.useState<string[]>(value.length ? value : [''])
  const clean = (list: string[]): string[] => list.map((s) => s.trim()).filter(Boolean)
  return (
    <div className="notedate-source-show">
      {rows.map((row, i) => (
        <div className="notedate-source-show-row" key={i}>
          <input
            className="settings-path-input"
            value={row}
            aria-label={uiText('auto.ef5ea5a743b3')}
            placeholder="phone"
            onChange={(e) => setRows(rows.map((r, idx) => (idx === i ? e.target.value : r)))}
            onBlur={() => onCommit(clean(rows))}
          />
          <button
            type="button"
            className="notedate-source-show-remove"
            aria-label={uiText('auto.4fda04775bdc')}
            onClick={() => {
              const next = rows.filter((_, idx) => idx !== i)
              setRows(next.length ? next : [''])
              onCommit(clean(next))
            }}
          >
            ×
          </button>
        </div>
      ))}
      <Button variant="ghost" size="small" className="notedate-add-field" onClick={() => setRows([...rows, ''])}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus /> {uiText('calendar.noteDate.addField')}</span>
      </Button>
    </div>
  )
}

/**
 * One optional colour: `ring` draws the value as an outline, `fill` as a solid
 * chip. Unset renders a dashed "none" chip — the entry then inherits the
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

/** The optional glyph, shown as the source swatch; click opens a grid (incl. "None"). */
const GlyphPicker: FC<{
  icon: string | undefined
  color: string | undefined
  borderColor: string | undefined
  onChange: (id: string | undefined) => void
}> = ({ icon, color, borderColor, onChange }) => {
  const catalog = useNoteDateIcons()
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const document = ref.current?.ownerDocument
    document?.addEventListener('mousedown', onDoc, true)
    return () => document?.removeEventListener('mousedown', onDoc, true)
  }, [open])
  return (
    <div className="notedate-glyph-picker" ref={ref}>
      <button
        type="button"
        className={icon ? 'notedate-source-swatch' : 'notedate-source-swatch unset'}
        // Custom properties, not the colours themselves: an inline concrete
        // colour outranks every stylesheet, including a user's design override.
        style={{
          ...(color
            ? {
                ['--swatch-fill' as string]: paletteCssValue(color),
                ['--swatch-on' as string]: paletteCssContrast(color)
              }
            : undefined),
          ...(borderColor ? { ['--swatch-ring' as string]: paletteCssValue(borderColor) } : undefined)
        }}
        aria-label={uiText('auto.92bcda7f379e')}
        title={uiText('auto.7bf74c2d99d6')}
        onClick={() => setOpen((o) => !o)}
      >
        {icon ? <NoteDateGlyph id={icon} /> : <span className="notedate-swatch-none">—</span>}
      </button>
      {open && (
        <div className="notedate-glyph-grid">
          <button
            type="button"
            className={icon ? 'notedate-glyph-opt' : 'notedate-glyph-opt active'}
            aria-label={uiText('auto.95553ba8a405')}
            title={uiText('auto.95553ba8a405')}
            onClick={() => { onChange(undefined); setOpen(false) }}
          >
            —
          </button>
          {catalog.error && <p role="alert" className="notedate-icon-error">{uiText('sources.icons.readError')}: {catalog.error}</p>}
          {Object.keys(catalog.icons).map(id => ({ id, label: noteDateGlyphs().find(g => g.id === id)?.label ?? id })).map((g) => (
            <button
              key={g.id}
              type="button"
              className={g.id === icon ? 'notedate-glyph-opt active' : 'notedate-glyph-opt'}
              aria-label={g.label}
              title={g.label}
              onClick={() => { onChange(g.id); setOpen(false) }}
            >
              <NoteDateGlyph id={g.id} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * What this rule currently finds. A mistyped key, value or date property is
 * otherwise indistinguishable from an empty vault — nothing appears anywhere and
 * nothing says why. Silent on an unfinished rule.
 */
const MatchStats: FC<{ source: NoteDateSource; entries: NoteDateIndexEntry[] }> = ({ source, entries }) => {
  const stats = React.useMemo(
    () => sourceMatchStats(entries, source),
    // Only the fields the predicate and the date parse actually read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, source.matchKey, source.matchValue, source.folder, source.dateField, source.dateFormat, source.match]
  )
  if (!isSourceActive(source)) return null
  if (stats.matched === 0) {
    return (
      <div className="notedate-source-stats">
        {uiText('auto.257ff123e390')}
      </div>
    )
  }
  if (stats.dated === 0) {
    return (
      <div className="notedate-source-stats warn">
        {uiText('auto.e6ffec68b5ae', { p0: stats.matched, p1: source.dateField })}
      </div>
    )
  }
  return (
    <div className="notedate-source-stats">
      {uiText('auto.d4ea5b59b68b', { p0: stats.matched, p1: stats.dated })}
    </div>
  )
}

const SourceRow: FC<{
  source: NoteDateSource
  entries: NoteDateIndexEntry[]
  onChange: (patch: Partial<NoteDateSource>) => void
  onDelete: () => void
  handle?: ReactNode
  initiallyExpanded?: boolean
}> = ({ source, entries, onChange, onDelete, handle, initiallyExpanded = false }) => {
  const { VaultFolderField, SelectField, Toggle } = api.ui.settings
  const [expanded, setExpanded] = React.useState(initiallyExpanded)
  const [advanced, setAdvanced] = React.useState(false)
  const advancedId = React.useId()
  // Commit-on-blur, like every sibling field: an unusable pattern turns the
  // input red but still parses through auto-detection, so nothing disappears.
  const formatValid = !source.dateFormat || parseDatePattern(source.dateFormat) !== null
  const field = (label: string, node: ReactElement, wide = false): ReactElement => (
    <div className={wide ? 'notedate-source-field wide' : 'notedate-source-field'}>
      <label>{label}</label>
      {node}
    </div>
  )
  return (
    <div className="notedate-source-row">
      <div className="notedate-source-head">
        {handle}
        <button type="button" className="notedate-source-disclosure" aria-expanded={expanded} aria-label={uiText('sources.details', { title: source.title })} onClick={() => setExpanded(value => !value)}><ChevronRight /></button>
        <GlyphPicker
          icon={source.icon}
          color={source.color}
          borderColor={source.borderColor}
          onChange={(id) => onChange({ icon: id })}
        />
        {expanded ? <input
          className="settings-path-input notedate-source-title"
          defaultValue={source.title}
          placeholder={uiText('auto.35b023ecbb81')}
          aria-label={uiText('auto.475b6ce898d4')}
          title={uiText('auto.4da8c4eff514')}
          onBlur={(e) => onChange({ title: e.target.value.trim() })}
        />
        : <button type="button" className="notedate-source-summary" onClick={() => setExpanded(true)}>
          <span>{source.title || uiText('calendar.noteDatePreset.blank')}</span>
          <small>{source.folder || uiText('auto.ad980036b394')}</small>
        </button>}
        <Toggle checked={source.visible} label={source.title || uiText('calendar.noteDatePreset.blank')} onChange={visible => onChange({ visible })} />
      </div>
      <MatchStats source={source} entries={entries} />
      {expanded && <div className="notedate-source-details">
      <div className="notedate-source-tools">
        <div className="notedate-source-color">
          <ColorChip
            variant="fill"
            value={source.color}
            label={uiText('auto.9fa90b203761')}
            onChange={(value) => onChange({ color: value })}
          />
          <ColorChip
            variant="ring"
            value={source.borderColor}
            label={uiText('auto.981f473aa731')}
            onChange={(value) => onChange({ borderColor: value })}
          />
        </div>
        <div className="notedate-source-actions">
          <Button
            className="notedate-source-toggle"
            variant="ghost"
            size="small"
            onClick={() => onChange({ hidden: !source.hidden })}
            title={
              source.hidden
                ? uiText('auto.408a0d16a8ba')
                : uiText('auto.736a07e01797')
            }
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{source.hidden ? <Eye /> : <EyeOff />}{source.hidden ? uiText('auto.d97d1ee339e4') : uiText('auto.34d8b60fe253')}</span>
          </Button>
          <ConfirmRemove label={source.title || 'source'} onDelete={onDelete} />
        </div>
      </div>
      <div className="notedate-source-grid">
        {field(
          uiText('auto.b82220d034e7'),
          <input
            className="settings-path-input"
            defaultValue={source.matchKey}
            placeholder="type"
            aria-label={uiText('auto.b82220d034e7')}
            onBlur={(e) => onChange({ matchKey: e.target.value.trim() })}
          />
        )}
        {field(
          uiText('auto.2bc9464d49e9'),
          <input
            className="settings-path-input"
            defaultValue={source.matchValue}
            placeholder="contact"
            aria-label={uiText('auto.a3fa4c4a4715')}
            onBlur={(e) => onChange({ matchValue: e.target.value.trim() })}
          />
        )}
        {field(
          uiText('auto.691b674766e5'),
          <input
            className="settings-path-input"
            defaultValue={source.dateField}
            placeholder="birthdate"
            aria-label={uiText('auto.691b674766e5')}
            title={uiText('auto.7bf039eeb194')}
            onBlur={(e) => onChange({ dateField: e.target.value.trim() || 'date' })}
          />
        )}
        {field(
          uiText('auto.94ee88690828'),
          <input
            className={formatValid ? 'settings-path-input' : 'settings-path-input invalid'}
            defaultValue={source.dateFormat ?? ''}
            placeholder="dd-mm-yyyy"
            aria-label={uiText('auto.94ee88690828')}
            title={uiText('auto.8bbc96d44546')}
            onBlur={(e) => onChange({ dateFormat: e.target.value.trim() || undefined })}
          />
        )}
        {field(
          // Deliberately not the bare "Match" string — that key is shared with
          // the base-view filter conjunction label and translates differently.
          uiText('auto.e10282ef1972'),
          <div className="notedate-source-inline">
            <SelectField
              value={source.match}
              onChange={(v) => onChange({ match: v === 'day-month' || v === 'day' ? v : 'exact' })}
              options={[
                { value: 'exact', label: uiText('auto.fd303c72a405') },
                { value: 'day-month', label: uiText('auto.dd4b99ddaf61') },
                { value: 'day', label: uiText('auto.b6f727f0c520') }
              ]}
              ariaLabel={uiText('auto.e10282ef1972')}
            />
            {source.match === 'day-month' && (
              <label className="notedate-source-inline-toggle" title={uiText('auto.5210c5c047ea')}>
                <Toggle
                  checked={source.showCount}
                  onChange={(checked) => onChange({ showCount: checked })}
                  label={uiText('auto.9ddab8990070')}
                />
                <span>{uiText('auto.9ddab8990070')}</span>
              </label>
            )}
          </div>
        )}
        {source.match !== 'exact' && field(
          uiText('auto.24bdcf2d51f8'),
          <input
            type="number"
            min={0}
            max={MAX_RECURRENCE_LIMIT_YEARS}
            className="settings-path-input notedate-source-limit"
            defaultValue={source.recurrenceLimitYears ?? ''}
            placeholder={uiText('auto.48a7b8889e15')}
            aria-label={uiText('auto.1389fda4dae3')}
            title={uiText('auto.6d07b3164ac0')}
            onBlur={(e) => {
              const raw = e.target.value.trim()
              if (!raw) {
                e.currentTarget.value = ''
                onChange({ recurrenceLimitYears: undefined })
                return
              }
              const value = Math.max(0, Math.min(MAX_RECURRENCE_LIMIT_YEARS, Math.floor(Number(raw))))
              e.currentTarget.value = String(value)
              onChange({ recurrenceLimitYears: value })
            }}
          />
        )}
        {field(
          uiText('auto.611f3791dc68'),
          <input
            className="settings-path-input"
            defaultValue={source.startTimeField ?? ''}
            placeholder={uiText('auto.48a7b8889e15')}
            aria-label={uiText('auto.611f3791dc68')}
            title={uiText('auto.519b42369442')}
            onBlur={(e) => onChange({ startTimeField: e.target.value.trim() || undefined })}
          />
        )}
        {field(
          uiText('auto.aee875c4edbf'),
          <input
            className="settings-path-input"
            defaultValue={source.endTimeField ?? ''}
            placeholder={uiText('auto.48a7b8889e15')}
            aria-label={uiText('auto.aee875c4edbf')}
            onBlur={(e) => onChange({ endTimeField: e.target.value.trim() || undefined })}
          />
        )}
        {field(
          uiText('auto.768e0c1c6957'),
          <div className="notedate-source-inline">
            <SelectField
              value={source.labelMode}
              onChange={(v) => onChange({ labelMode: v === 'property' ? 'property' : 'filename' })}
              options={[
                { value: 'filename', label: uiText('auto.a3cbb98ddf5e') },
                { value: 'property', label: uiText('auto.9ae33a7d0ecb') }
              ]}
              ariaLabel={uiText('auto.768e0c1c6957')}
            />
            {source.labelMode === 'property' && (
              <input
                className="settings-path-input"
                defaultValue={source.labelField ?? ''}
                placeholder="firstName"
                aria-label={uiText('auto.55f1c767a3b1')}
                onBlur={(e) => onChange({ labelField: e.target.value.trim() || undefined })}
              />
            )}
          </div>,
          true
        )}
        {field(
          uiText('auto.d97d1ee339e4'),
          <ShowFieldsEditor
            value={source.showFields}
            onCommit={(next) => onChange({ showFields: next })}
          />,
          true
        )}
      </div>
      <div className="notedate-source-advanced">
      <button
        type="button"
        className="notedate-source-advanced-toggle"
        aria-expanded={advanced}
        aria-controls={advancedId}
        onClick={() => setAdvanced((a) => !a)}
      >
        <ChevronRight /><span>{uiText('auto.4d064726954a')}</span>
      </button>
      {advanced && (
        <div className="notedate-source-grid notedate-source-advanced-body" id={advancedId}>
          {field(
            uiText('auto.0623bfa38c8f'),
            <VaultFolderField
              value={source.folder ?? ''}
              onChange={(v) => onChange({ folder: v.trim() || undefined })}
              onCommit={(v) => onChange({ folder: v.trim() || undefined })}
              placeholder={uiText('auto.ad980036b394')}
              ariaLabel={uiText('auto.0623bfa38c8f')}
            />,
            true
          )}
        </div>
      )}
      </div>
      </div>}
    </div>
  )
}

/** Settings → Calendar → Note dates: the sources that scrape notes for dates. */
export const NoteDatesSection: FC = () => {
  const { Toggle, useReorderDrag } = api.ui.settings
  const sources = useNoteDateSources()
  const indexEntries = useNoteIndex(sources)
  const [ready, setReady] = React.useState(false)
  const [newSourceId, setNewSourceId] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [saveError, setSaveError] = React.useState(false)
  React.useEffect(() => { let alive = true; void loadNoteDateSources().then(() => { if (alive) setReady(true) }); return () => { alive = false } }, [])
  const commit = (next: NoteDateSource[]): void => {
    void saveNoteDateSources(next).then(() => setSaveError(false)).catch(() => setSaveError(true))
  }
  const shownSources = sources.filter(source => `${source.title} ${source.folder ?? ''} ${source.matchKey} ${source.matchValue}`.toLowerCase().includes(query.trim().toLowerCase()))
  const reorder = useReorderDrag({
    items: shownSources, getId: source => source.id, getLabel: source => source.title, indicatorOnly: true,
    onReorder: next => { const ids = new Set(next.map(source => source.id)); let position = 0; commit(sources.map(source => ids.has(source.id) ? next[position++] : source)) }
  })
  if (!ready) return <div className="notedate-settings" />
  const update = (id: string, patch: Partial<NoteDateSource>): void =>
    commit(sources.map((s) => (s.id === id ? { ...s, ...patch } : s)))

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
          onSelect: () => { const source = presetNoteDateSource(preset.id, sources); setQuery(''); setNewSourceId(source.id); commit([...sources, source]) }
        })),
        { type: 'separator' as const },
        {
          id: 'blank',
          label: uiText('calendar.noteDatePreset.blank'),
          icon: <Plus />,
          onSelect: () => { const source = defaultNoteDateSource(); setQuery(''); setNewSourceId(source.id); commit([...sources, source]) }
        }
      ],
      { anchor, align: 'start' }
    )
  }

  return (
    <section className="settings-section notedate-settings">
      <div className="settings-listpage-header notedate-sources-header"><span>{uiText('auto.958788fc103f')}</span><Toggle label={uiText('sources.toggleAll')} checked={sources.length > 0 && sources.every(source => source.visible)} disabled={!sources.length} onChange={visible => commit(sources.map(source => ({ ...source, visible })))} /></div>
      <p className="notedate-sources-description">{uiText('sources.description')}</p>
      <div className="settings-path-row notedate-icon-folder"><span className="settings-toggle-text"><span className="settings-toggle-title">{uiText('sources.icons.title')}</span><span className="settings-toggle-desc">{CALENDAR_ICON_FOLDER}</span></span><Button variant="ghost" onClick={() => api.files.revealInFinder(CALENDAR_ICON_FOLDER)}>{uiText('sources.icons.open')}</Button><Button variant="ghost" onClick={() => { void refreshNoteDateIcons() }}>{uiText('sources.icons.refresh')}</Button></div>
      {saveError && <p role="alert" className="settings-path-error">{api.ui.t('error.commandFailed')}</p>}
      {sources.length === 0 && <p className="notedate-sources-description">{uiText('auto.65c01f7ba330')}</p>}
      {sources.length > 0 && <div className="search-field notedate-sources-search">
        <input className="search-field-input" value={query} onChange={event => setQuery(event.target.value)} placeholder={uiText('sources.search')} aria-label={uiText('sources.search')} />
      </div>}
      {sources.length > 0 && shownSources.length === 0 && <p className="notedate-sources-description">{uiText('sources.noResults')}</p>}
      <div className="notedate-source-list">
      {shownSources.map((source) => (
        <div key={source.id} className="notedate-source-sortable" {...reorder.getItemProps(source)}>
        <SourceRow
          key={source.id}
          source={source}
          initiallyExpanded={source.id === newSourceId}
          handle={<button {...reorder.getHandleProps(source)} className="settings-reorder-handle notedate-source-grip" title={uiText('sources.reorder')}><GripVertical /></button>}
          entries={indexEntries}
          onChange={(patch) => update(source.id, patch)}
          onDelete={() => commit(sources.filter((s) => s.id !== source.id))}
        />
        </div>
      ))}
      {reorder.liveRegion}
      </div>
      <div className="notedate-add-source-row">
      <Button
        variant="secondary"
        className="notedate-add-source"
        aria-haspopup="menu"
        onClick={(e) => addSource(e.currentTarget as HTMLElement)}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus /> {uiText('calendar.noteDate.addSource')}</span>
      </Button>
      </div>
    </section>
  )
}
