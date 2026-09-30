import { React } from './runtime'
import type { EventRecord } from '@valley/plugin-sdk/types'
import { loadEvents, onChanged as onEventsChanged } from './events'
import { useSourcedItems, type SourcedItem, type CalendarSourceError } from './itemSources'
import { createReloadQueue } from './reloadQueue'

export function useCalendarData(startDate: string, endDate: string): {
  sourced: SourcedItem[]
  events: EventRecord[]
  sourceErrors: CalendarSourceError[]
  reload: () => void
} {
  const [localEvents, setLocalEvents] = React.useState<EventRecord[]>([])
  const { items: sourced, errors: sourceErrors, reload: reloadSourced } = useSourcedItems(startDate, endDate)
  const localQueue = React.useRef<ReturnType<typeof createReloadQueue<EventRecord[]>> | null>(null)
  const reload = React.useCallback(() => {
    reloadSourced()
    void localQueue.current?.reload()
  }, [reloadSourced])
  React.useEffect(() => {
    const current = createReloadQueue(() => loadEvents(startDate, endDate), setLocalEvents, (error) => console.error('[calendar] events reload failed', error))
    localQueue.current = current
    void current.reload()
    const offEvents = onEventsChanged(() => { void current.reload() })
    return () => {
      current.dispose()
      if (localQueue.current === current) localQueue.current = null
      offEvents()
    }
  }, [endDate, reload, startDate])
  return { sourced, events: localEvents, sourceErrors, reload }
}
