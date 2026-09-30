import { api } from './runtime'
import {
  countGroupUsage,
  normalizeGroups
} from '@valley/plugin-sdk/groups'
import { loadEvents, onChanged } from './events'
import type { ValleyGroup } from '@valley/plugin-sdk/types'
import { subscribeHostField } from './hooks'

export function globalGroups(): ValleyGroup[] {
  return normalizeGroups(api.getState().groups)
}

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
