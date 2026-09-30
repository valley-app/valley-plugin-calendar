/**
 * Tiny helpers copied from the renderer's `lib/` (plugins bundle standalone and
 * cannot import `@renderer/*`).
 */

/** Generate a reasonably-unique local record id. */
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Map a lowercase weekday-name preference to a 0=Sunday…6=Saturday index. */
export { WEEK_START_INDEX } from '@valley/plugin-sdk/dateGrid'
