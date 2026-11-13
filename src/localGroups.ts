/**
 * Calendar's own groups: groups only Calendar uses, beside the app-wide shared
 * groups (Settings → Appearance → Groups) that every plugin reads.
 *
 * They live in Calendar's plugin settings under `localGroups`, in the same shape
 * To-Do uses for its own groups. An event references one by its `local-…` id in
 * the ordinary `groupId` field. An own group is a plain group, edited like the
 * shared ones; it never sits under a shared group (a `parent` saved by 3.3.17 is
 * dropped on read). Other plugins never see these groups: items they contribute
 * still resolve by name against the shared groups only.
 */
import type { ValleyGroup } from '@valley/plugin-sdk/types'
import { groupKey } from '@valley/plugin-sdk/groups'

export interface LocalGroup {
  id: string
  name: string
  color: string
  aliases?: string[]
}

/** A group as Calendar's pickers, filters and colours see it. */
export interface CalendarGroup extends ValleyGroup {
  /** Set on Calendar's own groups. */
  local?: true
}

export const LOCAL_GROUPS_KEY = 'localGroups'
export const LOCAL_GROUP_LIMIT = 200
export const LOCAL_GROUP_NAME_MAX = 60

const clean = (value: unknown, max: number): string => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : ''

export function newLocalGroupId(): string {
  return `local-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export function isLocalGroupId(id: string | undefined): boolean {
  return typeof id === 'string' && /^local-[a-z0-9]{1,32}$/.test(id)
}

/** Valid, uniquely named groups; a name a shared group already uses is dropped, so a name never means two groups. */
export function normalizeLocalGroups(value: unknown, shared: readonly ValleyGroup[] = []): LocalGroup[] {
  if (!Array.isArray(value)) return []
  const taken = new Set(shared.flatMap((group) => [group.name, ...(group.aliases ?? [])]).map(groupKey))
  const ids = new Set<string>()
  const out: LocalGroup[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const id = clean(raw.id, 64)
    const name = clean(raw.name, LOCAL_GROUP_NAME_MAX)
    const color = clean(raw.color, 64)
    if (!isLocalGroupId(id) || ids.has(id) || !name || taken.has(groupKey(name)) || !color) continue
    const aliases = Array.isArray(raw.aliases)
      ? [...new Set(raw.aliases.map((alias) => clean(alias, LOCAL_GROUP_NAME_MAX)).filter((alias) => alias && groupKey(alias) !== groupKey(name) && !taken.has(groupKey(alias))))].slice(0, 20)
      : []
    ids.add(id)
    taken.add(groupKey(name))
    aliases.forEach((alias) => taken.add(groupKey(alias)))
    out.push({ id, name, color, ...(aliases.length ? { aliases } : {}) })
    if (out.length >= LOCAL_GROUP_LIMIT) break
  }
  return out
}

/** A renamed group keeps its old name as an alias, the same rule the shared groups follow. */
export function renameLocalGroup(group: LocalGroup, name: string): LocalGroup {
  const next = clean(name, LOCAL_GROUP_NAME_MAX)
  if (!next || next === group.name) return group
  const aliases = [...new Set([...(group.aliases ?? []), group.name])].filter((alias) => groupKey(alias) !== groupKey(next))
  return { ...group, name: next, ...(aliases.length ? { aliases } : {}) }
}

/** Shared groups first, then Calendar's own groups, as one list the pickers, filters and colours use. */
export function mergedGroups(shared: readonly ValleyGroup[], local: readonly LocalGroup[]): CalendarGroup[] {
  return [
    ...shared,
    ...local.map((group): CalendarGroup => ({
      id: group.id,
      name: group.name,
      color: group.color,
      local: true,
      ...(group.aliases ? { aliases: group.aliases } : {})
    }))
  ]
}

/**
 * The group an item belongs to. Calendar events carry a `groupId`, which may name
 * a shared group or one of Calendar's own. Everything else references a group by
 * **name**, and only a shared group can be meant: other plugins do not know
 * Calendar's own groups.
 */
export function groupOfItem(item: { groupId?: string; group?: string }, groups: readonly CalendarGroup[]): CalendarGroup | undefined {
  if (item.groupId) {
    const byId = groups.find((group) => group.id === item.groupId)
    if (byId) return byId
  }
  const key = groupKey(item.group ?? '')
  if (!key) return undefined
  return groups.find((group) => !group.local && (groupKey(group.name) === key || (group.aliases ?? []).some((alias) => groupKey(alias) === key)))
}

/** The id an event should store for a group given by id or by name; unknown values are kept as given. */
export function resolveGroupId(value: string | undefined, groups: readonly CalendarGroup[]): string | undefined {
  const text = value?.trim()
  if (!text) return undefined
  if (groups.some((group) => group.id === text)) return text
  const key = groupKey(text)
  return groups.find((group) => groupKey(group.name) === key || (group.aliases ?? []).some((alias) => groupKey(alias) === key))?.id ?? text
}

/** How many events use each own group, keyed by id. */
export function localGroupUsage(events: readonly { groupId?: string }[], local: readonly LocalGroup[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(local.map((group) => [group.id, 0]))
  for (const event of events) if (event.groupId && Object.hasOwn(out, event.groupId)) out[event.groupId]++
  return out
}
