/**
 * Calendar fallback colors after explicit item and shared-group colors have
 * been considered by the caller.
 *
 * Frontmatter comes from the vault's `IndexEntry`, so there are no file reads
 * at render time.
 */
import { paletteRef } from '@valley/plugin-sdk/palette'

/* Palette references, not hexes — an event's colour follows the theme and any
   `--color-*` the user overrode in .valley/design/*.css. Render them through
   `paletteCssValue`. */
const PRIORITY_COLORS: Record<string, string> = {
  high: paletteRef('red'),
  medium: paletteRef('amber'),
  low: paletteRef('green'),
  normal: paletteRef('gray')
}

const STATUS_COLORS: Record<string, string> = {
  active: paletteRef('primary-blue'),
  paused: paletteRef('amber'),
  suspended: paletteRef('violet'),
  completed: paletteRef('green'),
  open: paletteRef('gray')
}

const DEFAULT_COLOR = paletteRef('gray')

/** Context used by the color resolver; built by the caller from item + IndexEntry. */
export interface ColorCtx {
  /** Item's priority — used as the last-resort fallback. */
  priority?: string
  /** Item's status — used as the last-resort fallback. */
  status?: string
}

export function resolveItemColor(ctx: ColorCtx): string {
  if (ctx.priority && PRIORITY_COLORS[ctx.priority]) return PRIORITY_COLORS[ctx.priority]
  if (ctx.status && STATUS_COLORS[ctx.status]) return STATUS_COLORS[ctx.status]
  return DEFAULT_COLOR
}
