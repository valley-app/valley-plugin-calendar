import { api } from './runtime'
import {
  countGroupUsage,
  normalizeGroups
} from '@valley/plugin-sdk/groups'
import { loadEvents, onChanged } from './events'
import type { ValleyGroup } from '@valley/plugin-sdk/types'
import { subscribeHostField } from './hooks'
import { LOCAL_GROUPS_KEY, normalizeLocalGroups, type LocalGroup } from './localGroups'

export function globalGroups(): ValleyGroup[] {
  return normalizeGroups(api.getState().groups)
}

export function getLocalGroups(): LocalGroup[] {
  return normalizeLocalGroups(api.settings.get()[LOCAL_GROUPS_KEY], globalGroups())
}

export async function setLocalGroups(groups: LocalGroup[]): Promise<boolean> {
  return (await api.settings.set(LOCAL_GROUPS_KEY, normalizeLocalGroups(groups, globalGroups()))).ok
}

/**
 * Report how many events sit in each **shared** group — the tally the host's
 * delete gate reads. Calendar's own groups are invisible to the host and to
 * other plugins, so events in them count for nothing here, even under a parent.
 */
export function startGroupUsageReporting(): () => void {
  let cancelled = false
  const push = (): void => {
    void loadEvents().then((events) => {
      if (cancelled) return
      const known = globalGroups()
      const names = events.map((event) => known.find((group) => group.id === event.groupId)?.name)
      api.workspace.reportGroupUsage(countGroupUsage(names))
    }).catch((error) => { if (!cancelled) console.error('[calendar] group usage read failed', error) })
  }
  push()
  const offEvents = onChanged(push)
  const offState = subscribeHostField('groups', push)
  const offSettings = api.settings.subscribe(push)
  return () => {
    cancelled = true
    offEvents()
    offState()
    offSettings()
    api.workspace.reportGroupUsage({})
  }
}
