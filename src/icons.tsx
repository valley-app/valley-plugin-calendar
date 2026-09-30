import { React } from './runtime'
import type { ReactElement, ReactNode } from 'react'
import { uiText } from './localization'
import { noteDateIconSvg, useNoteDateIcons } from './noteDateIcons'

/**
 * Inline SVG icons — hand-rolled Lucide-style glyphs, kept local (rather than
 * pulling in `react-icons`) so the Todo views stay self-contained.
 */
type IconProps = { className?: string; title?: string }

const Svg = (props: IconProps & { children: ReactNode }): ReactElement =>
  React.createElement(
    'svg',
    {
      className: props.className,
      width: '1em',
      height: '1em',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true
    },
    props.title ? <title>{props.title}</title> : null,
    props.children
  )

export const GripVertical = (p: IconProps): ReactElement => <Svg {...p}><circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" /></Svg>

export const X = (p: IconProps): ReactElement => (
  <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
)

export const Search = (p: IconProps): ReactElement => (
  <Svg {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Svg>
)

export const ChevronRight = (p: IconProps): ReactElement => (
  <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>
)

/** Header filter: which sources feed the surface (events, To-Do, note dates). */
export const Layers = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </Svg>
)

/** Header filter: same counted-group glyph used by To-Do. */
export const GroupGlyph = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="M3 7V5c0-1.1.9-2 2-2h2M17 3h2c1.1 0 2 .9 2 2v2M21 17v2c0 1.1-.9 2-2 2h-2M7 21H5c-1.1 0-2-.9-2-2v-2" />
    <rect width="7" height="5" x="7" y="5" rx="1" />
    <rect width="7" height="5" x="10" y="14" rx="1" />
  </Svg>
)

export const Tags = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h5.1a2 2 0 0 1 1.4.6l7.4 7.4a2 2 0 0 1 0 2.8l-5.1 5.1a2 2 0 0 1-2.8 0L3.6 11.5a2 2 0 0 1-.6-1.4V4.5Z" />
    <path d="M7 7h.01" />
  </Svg>
)

export const Plus = (p: IconProps): ReactElement => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
)


/* The note-date source row's actions. Identical paths to the Map's pin-source
   row (`plugins/map/src/icons.tsx`) on purpose: the two settings surfaces are
   the same editor over different data, and a different eye or bin on one of
   them reads as a different control. */
export const Eye = (p: IconProps): ReactElement => (
  <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Svg>
)

export const EyeOff = (p: IconProps): ReactElement => (
  <Svg {...p}><path d="m3 3 18 18" /><path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.3 3.9" /><path d="M6.6 6.6A17 17 0 0 0 2 12s3.5 6 10 6a9.7 9.7 0 0 0 3.4-.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Svg>
)

export const Trash = (p: IconProps): ReactElement => (
  <Svg {...p}><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></Svg>
)

/** The quick-add "When" section: the day, or the first day of a span. */
export const CalendarDays = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="M8 2v4M16 2v4" />
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M3 10h18" />
  </Svg>
)

/** The quick-add time row. */
export const Clock = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
)

/** The quick-add tag row. `Tags` already means "group" everywhere in this
 *  plugin (it is the group filter's glyph), so tags get the hash. */
export const Hash = (p: IconProps): ReactElement => (
  <Svg {...p}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></Svg>
)

/** The quick-add priority row (contributed items only). */
export const Flag = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="M4 22V4h11l-1 3h6l-2 4 2 4h-9l-1-3H4" />
  </Svg>
)

/** A contributed "Edit…" entry — same glyph the To-Do rows use for it. */
export const Pencil = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="M21.2 6.2a2.8 2.8 0 0 0-4-4L4 15.5 3 21l5.5-1L21.2 6.2Z" />
    <path d="m15 5 4 4" />
  </Svg>
)

export const Checklist = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="m3 6 2 2 4-4M3 12l2 2 4-4M3 18l2 2 4-4" />
    <path d="M13 6h8M13 12h8M13 18h8" />
  </Svg>
)

/* ── Item badges ──────────────────────────────────────────────────────────── */
/* What an item carries, drawn on the item itself so it is legible without
   opening its context menu. Same glyphs the To-Do rows use, so a link is one
   shape app-wide. */

export const Link = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </Svg>
)


export const Paperclip = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="M21.4 11.05 12.25 20.2a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48" />
  </Svg>
)

export const MapPin = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
    <circle cx="12" cy="10" r="3" />
  </Svg>
)

/** Material Design `MdOutlinePushPin`, used for the Note Dates filter. */
export const PushPin = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path fill="currentColor" stroke="none" d="M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4zm3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1" />
  </Svg>
)

/** The ➤ beside a location: lucide `navigation`, the same glyph the map uses. */
export const Navigation = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="M3 11l19-9-9 19-2-8-8-2z" />
  </Svg>
)

export const FileText = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M9 13h6M9 17h4" />
  </Svg>
)

/* Attachment-card glyphs — one per file family the cards can show. */
export const FileGlyph = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </Svg>
)

export const ImageGlyph = (p: IconProps): ReactElement => (
  <Svg {...p}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-4.6-4.6a2 2 0 0 0-2.8 0L3 21" />
  </Svg>
)

export const AudioGlyph = (p: IconProps): ReactElement => (
  <Svg {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></Svg>
)

export const VideoGlyph = (p: IconProps): ReactElement => (
  <Svg {...p}><path d="m22 8-6 4 6 4V8z" /><rect width="14" height="12" x="2" y="6" rx="2" /></Svg>
)

const BADGE_GLYPHS: Record<string, (p: IconProps) => ReactElement> = {
  note: FileText,
  attachment: Paperclip,
  link: Link,
  location: MapPin
}

/** Human names for the badge row's hover text, resolved at render time. */
const BADGE_LABEL_KEYS: Record<string, string> = {
  note: 'calendar.badge.note',
  attachment: 'calendar.badge.attachment',
  link: 'calendar.badge.link',
  location: 'calendar.badge.location'
}

/** The badge names, for a surface that folds them into its own hover text. */
export function badgeLabels(badges: readonly string[] | undefined): string[] {
  return (badges ?? []).filter((id) => id in BADGE_LABEL_KEYS).map((id) => uiText(BADGE_LABEL_KEYS[id]))
}

/**
 * The glyph row for what an item carries — a linked note, attachments, links, a
 * place. Unknown ids render nothing, so a provider on a newer contract can send
 * badges this build has never heard of.
 *
 * `aria-hidden`: the same information reaches assistive tech through the item's
 * own hover text (`itemTooltip`), and two accessible names on one chip is worse
 * than one complete one.
 */
export const ItemBadges = ({
  badges,
  className
}: {
  badges?: readonly string[]
  className?: string
}): ReactElement | null => {
  const known = (badges ?? []).filter((id) => id in BADGE_GLYPHS)
  if (known.length === 0) return null
  return (
    <span className={className ? `calendar-badges ${className}` : 'calendar-badges'} aria-hidden="true">
      {known.map((id) => {
        const Glyph = BADGE_GLYPHS[id]
        return <Glyph key={id} />
      })}
    </span>
  )
}

/** Pickable glyphs for the Note dates settings row — a function so the labels
 *  localize at render time (and never call uiText before initLocalization). */
export function noteDateGlyphs(): { id: string; label: string }[] {
  return [
    { id: 'cake', label: uiText('auto.9c6e5a3f44fc') },
    { id: 'gift', label: uiText('auto.8d0a32ed6339') },
    { id: 'heart', label: uiText('auto.2a37335eebda') },
    { id: 'star', label: uiText('auto.85a7de6e2705') },
    { id: 'flag', label: uiText('auto.a774409a00c2') },
    { id: 'bell', label: uiText('auto.d4198662a72f') },
    { id: 'pin', label: uiText('auto.9c918414710c') },
    { id: 'person', label: uiText('auto.8c41ae88467f') },
    { id: 'clock', label: uiText('auto.04f6b3ea183e') },
    { id: 'calendar', label: uiText('auto.adab5090ac6a') }
  ]
}

export const NoteDateGlyph = ({ id, className }: { id?: string; className?: string }): ReactElement | null => {
  useNoteDateIcons()
  const svg = id ? noteDateIconSvg(id) : undefined
  return svg ? <span className={`notedate-asset-glyph ${className ?? ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} /> : null
}

export const ValleyIcon = (p: IconProps): ReactElement => (
  <svg className={p.className} width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true"
    style={{ mask: 'var(--icon-open-in-new) center / contain no-repeat' }}>
    {p.title ? <title>{p.title}</title> : null}
    <rect width="24" height="24" fill="currentColor" />
  </svg>
)
