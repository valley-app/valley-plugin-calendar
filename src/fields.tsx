import { React, api } from './runtime'
import type { ReactElement } from 'react'
import type { EventRecord, ResourceSearchResult } from '@valley/plugin-sdk/types'
import { classifyFilePath, fileExtension, type FileKind } from '@valley/plugin-sdk/fileTypes'
import { AudioGlyph, FileGlyph, ImageGlyph, MapPin, Navigation, VideoGlyph, X } from './icons'
import { uiText } from './localization'

// ── FilePathInput ─────────────────────────────────────────────────────────────
// Linked-file picker shared by the Todo inline editor and the calendar quick-add.
// Search and ranking are owned by the host resource API.

export function FilePathInput({
  value,
  onChange,
  disabled,
  placeholder,
  ariaLabel
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  /** Two pickers on one form must not share an accessible name — pass both when
   *  the surface has more than one (a linked note beside an attachment). */
  placeholder?: string
  ariaLabel?: string
}): ReactElement {
  const ResourcePicker = api.ui.ResourcePicker
  return <ResourcePicker value={value} onChange={onChange} kinds={['attachment']} placeholder={placeholder ?? uiText('auto.e7de9576dc00')} disabled={disabled} ariaLabel={ariaLabel ?? uiText('auto.8410192cbb1f')} allowCustom={false} />
}


// ── AttachmentCard ────────────────────────────────────────────────────────────
// One attachment, drawn as a card: name, extension + human size, remove. Ported
// from the Todo detail view rather than imported — a plugin may not reach into
// another plugin — and deliberately lighter: this one lives in a 360px popover,
// where a thumbnail column would cost more width than it earns.

/** Bytes as a person reads them. The host's `formatBytes` is renderer-only. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  const digits = i === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[i]}`
}

const KIND_GLYPHS: Partial<Record<FileKind, (p: { className?: string }) => ReactElement>> = {
  image: ImageGlyph,
  audio: AudioGlyph,
  video: VideoGlyph
}

export const AttachmentCard = ({
  relPath,
  onRemove
}: {
  relPath: string
  onRemove?: () => void
}): ReactElement => {
  const [size, setSize] = React.useState<number | null>(null)
  const kind = classifyFilePath(relPath)
  const name = relPath.split('/').pop() ?? relPath
  const Glyph = KIND_GLYPHS[kind] ?? FileGlyph
  const ext = fileExtension(relPath).replace('.', '').toUpperCase()

  React.useEffect(() => {
    let cancelled = false
    void api.realm.fileInfo(relPath).then((info) => {
      if (!cancelled) setSize(info?.size ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [relPath])

  return (
    <div className="calendar-attach-card">
      <button
        className="calendar-attach-open"
        type="button"
        onClick={(e) => api.workspace.openFile(relPath, undefined, { newTab: api.ui.hasModKey(e) })}
        title={relPath}
      >
        <span className="calendar-attach-thumb"><Glyph /></span>
        <span className="calendar-attach-copy">
          <span className="calendar-attach-name">{name}</span>
          <span className="calendar-attach-meta">
            {ext}
            {size !== null && `${ext ? ' · ' : ''}${formatBytes(size)}`}
          </span>
        </span>
      </button>
      {onRemove && (
        <button
          className="calendar-attach-remove"
          type="button"
          onClick={onRemove}
          title={uiText('calendar.removeAttachment')}
          aria-label={uiText('calendar.removeAttachmentOf', { p0: name })}
        >
          <X />
        </button>
      )}
    </div>
  )
}

// ── LocationField ─────────────────────────────────────────────────────────────

export type EventLocation = NonNullable<EventRecord['location']>

/**
 * Looking a provider up **throws** when the plugin has not declared it in
 * `consumes`, and the throw would take the whole editor with it. A missing map
 * must cost the map button, never the form.
 */
/** A web plugin keeps the link in Valley; the host API remains the fallback. */
export function canOpenUrl(): boolean {
  return true
}

export function openUrl(url: string): void {
  void api.links.open(url)
}

/** Open the map at a place — coordinates when we have them, the label otherwise. */
export function openLocation(location: EventLocation): void {
  const query =
    location.lng !== undefined && location.lat !== undefined
      ? `${location.lat},${location.lng}`
      : location.name
  void api.links.open({ category: 'location', value: query })
}

/** Is there anything that could open a place? Drives the map affordances. */
export function canOpenLocation(): boolean {
  return true
}

/**
 * Where the event happens.
 *
 * Typing queries the Map plugin's geocoder through `api.resources.search` and
 * offers real places inline inside the popover; picking one stores its
 * coordinates alongside the label, which is what lets the ➤ open the map *at
 * the pin* rather than re-running a text search. Typing without picking updates
 * the label directly so clicking Save always keeps it — even with Map disabled.
 *
 * Rendered directly in the plugin document rather than through the host
 * ResourcePicker widget so typing never suffers bridge round-trip lag and
 * clicking a suggestion stays inside the popover DOM.
 */
export const LocationField = ({
  value,
  onChange,
  disabled = false
}: {
  value: EventLocation | undefined
  onChange: (next: EventLocation | undefined) => void
  disabled?: boolean
}): ReactElement => {
  const [text, setText] = React.useState(value?.name ?? '')
  const [hits, setHits] = React.useState<ResourceSearchResult[]>([])
  const [status, setStatus] = React.useState<'idle' | 'searching' | 'done' | 'failed'>('idle')
  const [active, setActive] = React.useState(-1)
  const [open, setOpen] = React.useState(false)
  const focused = React.useRef(false)
  const timer = React.useRef<number | null>(null)
  const token = React.useRef(0)

  React.useEffect(() => {
    if (!focused.current) setText(value?.name ?? '')
  }, [value?.name])
  React.useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])

  const search = (raw: string): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    const mine = ++token.current
    const query = raw.trim()
    if (query.length < 2) {
      setHits([])
      setActive(-1)
      setStatus('idle')
      setOpen(false)
      return
    }
    setOpen(true)
    setStatus('searching')
    timer.current = window.setTimeout(() => {
      void api.resources.search({ query, kinds: ['place'], limit: 8 }).then(
        (results) => {
          if (mine !== token.current) return
          setHits(results)
          setActive(results.length ? 0 : -1)
          setStatus('done')
        },
        () => {
          if (mine !== token.current) return
          setHits([])
          setActive(-1)
          setStatus('failed')
        }
      )
    }, 220)
  }

  const pick = (hit: ResourceSearchResult): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    token.current++
    const longitude = Number(hit.metadata?.longitude)
    const latitude = Number(hit.metadata?.latitude)
    const name = (hit.value || hit.label).trim()
    setText(name)
    setHits([])
    setActive(-1)
    setStatus('idle')
    setOpen(false)
    onChange(name ? {
      name,
      ...(Number.isFinite(longitude) && Number.isFinite(latitude) ? { lng: longitude, lat: latitude } : {})
    } : undefined)
  }

  const clear = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    token.current++
    setText('')
    setHits([])
    setActive(-1)
    setStatus('idle')
    setOpen(false)
    onChange(undefined)
  }

  return (
    <div className="calendar-location">
      <div className="calendar-location-row">
        <input
          className="calendar-location-input"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-label={uiText('calendar.location')}
          placeholder={uiText('calendar.locationPlaceholder')}
          value={text}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          onFocus={() => {
            focused.current = true
            if (text.trim().length >= 2 && hits.length > 0) setOpen(true)
          }}
          onBlur={() => {
            focused.current = false
            token.current++
            setOpen(false)
            const trimmed = text.trim()
            if (trimmed !== text) setText(trimmed)
          }}
          onChange={(event) => {
            const next = event.currentTarget.value
            setText(next)
            const trimmed = next.trim()
            if (!trimmed) onChange(undefined)
            else if (trimmed !== (value?.name ?? '')) onChange({ name: trimmed })
            search(next)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'ArrowDown' && hits.length > 0) {
              event.preventDefault()
              setOpen(true)
              setActive((index) => (index + 1) % hits.length)
            } else if (event.key === 'ArrowUp' && hits.length > 0) {
              event.preventDefault()
              setActive((index) => (index <= 0 ? hits.length - 1 : index - 1))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              if (open && hits[active]) pick(hits[active])
              else setOpen(false)
            } else if (event.key === 'Escape' && open) {
              event.preventDefault()
              event.stopPropagation()
              token.current++
              setOpen(false)
            }
          }}
        />
        {value && (
          <>
            {canOpenLocation() && (
              <button
                className="calendar-field-btn"
                type="button"
                disabled={disabled}
                title={uiText('calendar.openLocation')}
                aria-label={uiText('calendar.openLocationOf', { p0: value.name })}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => openLocation(value)}
              >
                <Navigation />
              </button>
            )}
            <button
              className="calendar-field-btn"
              type="button"
              disabled={disabled}
              title={uiText('calendar.removeLocation')}
              aria-label={uiText('calendar.removeLocation')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={clear}
            >
              <X />
            </button>
          </>
        )}
      </div>
      {open && (
        <ul className="calendar-location-hits" role="listbox" aria-label={uiText('calendar.location')}>
          {status === 'searching' && hits.length === 0 && (
            <li className="calendar-location-status" role="status">{uiText('calendar.location.searching')}</li>
          )}
          {status === 'done' && hits.length === 0 && (
            <li className="calendar-location-status" role="status">{uiText('calendar.location.noResults')}</li>
          )}
          {status === 'failed' && (
            <li className="calendar-location-status" role="status">{uiText('calendar.location.failed')}</li>
          )}
          {hits.map((hit, index) => (
            <li key={`${hit.kind}:${hit.id}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={index === active ? 'calendar-location-hit is-active' : 'calendar-location-hit'}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(hit)}
              >
                <span className="calendar-location-hit-name"><MapPin /> {hit.label}</span>
                {hit.description && <span className="calendar-location-hit-context">{hit.description}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
