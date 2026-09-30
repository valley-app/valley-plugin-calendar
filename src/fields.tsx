import { React, api } from './runtime'
import type { ReactElement } from 'react'
import type { EventRecord } from '@valley/plugin-sdk/types'
import { classifyFilePath, fileExtension, type FileKind } from '@valley/plugin-sdk/fileTypes'
import { AudioGlyph, FileGlyph, ImageGlyph, Navigation, VideoGlyph, X } from './icons'
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
    void api.vault.fileInfo(relPath).then((info) => {
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
 * Typing queries the Map plugin's geocoder through `geo.search` and offers real
 * places; picking one stores its coordinates alongside the label, which is what
 * lets the ➤ open the map *at the pin* rather than re-running a text search.
 * Committing without picking stores the label alone — the field stays fully
 * usable when the Map plugin is disabled and there is no geocoder at all.
 */
export const LocationField = ({
  value,
  onChange
}: {
  value: EventLocation | undefined
  onChange: (next: EventLocation | undefined) => void
}): ReactElement => {
  const ResourcePicker = api.ui.ResourcePicker

  return (
    <div className="calendar-location">
      <div className="calendar-location-row">
        <ResourcePicker
          className="calendar-location-input"
          value={value?.name ?? ''}
          placeholder={uiText('calendar.locationPlaceholder')}
          ariaLabel={uiText('calendar.location')}
          kinds={['place']}
          allowCustom
          onChange={(name, result) => {
            const longitude = Number(result?.metadata?.longitude)
            const latitude = Number(result?.metadata?.latitude)
            onChange(name ? {
              name,
              ...(Number.isFinite(longitude) && Number.isFinite(latitude) ? { lng: longitude, lat: latitude } : {})
            } : undefined)
          }}
        />
        {value && (
          <>
            {canOpenLocation() && (
              <button
                className="calendar-field-btn"
                type="button"
                title={uiText('calendar.openLocation')}
                aria-label={uiText('calendar.openLocationOf', { p0: value.name })}
                onClick={() => openLocation(value)}
              >
                <Navigation />
              </button>
            )}
            <button
              className="calendar-field-btn"
              type="button"
              title={uiText('calendar.removeLocation')}
              aria-label={uiText('calendar.removeLocation')}
              onClick={() => {
                onChange(undefined)
              }}
            >
              <X />
            </button>
          </>
        )}
      </div>

    </div>
  )
}
