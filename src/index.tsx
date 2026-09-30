import { initializeNoteDateIcons } from './noteDateIcons'
import { CalendarFileView } from './FileView'
/**
 * Calendar — the event planner and generic dated-item surface. Calendar owns
 * only its events; tasks and other dated records arrive through versioned
 * contracts and are mutated by their providers. The visible period and selected
 * day ride the shared time selection through `api.workspace.*TimeControl*`,
 * which also drives the dashboard timeframe takeover. The day window and
 * filters persist in plugin settings; groups come only from the app registry.
 *
 * Four views: `calendar.agenda` (left_sidebar — the chronological list),
 * `calendar.panel` (right_sidebar — the compact calendar), `calendar.page`
 * (main_workspace — month/week/year grids beside an agenda column) and
 * `calendar.settings` (the Settings → Plugins editor).
 */
import {
  CALENDAR_NAVIGATOR_V1,
  CALENDAR_PANEL_SELECTION_V1,
  AGENT_TOOL_PROVIDER_V1,
  type CalendarNavigator,
  type ValleyPluginApi,
  type ValleyPluginModule
} from '@valley/plugin-sdk'
import { initRuntime, revealCalendarItem, revealTargetStore } from './runtime'
import { injectStyles } from './styles'
import { registerCalendarCommands } from './commands'
import { registerCalendarFence } from './fence'
import { AgendaPanel } from './AgendaPanel'
import { Panel } from './Panel'
import { Page } from './Page'
import { Settings } from './Settings'
import { initLocalization, uiText } from './localization'
import { calendarAgentTools } from './agentTools'
import { startGroupUsageReporting } from './groups'
import { calendarLinkPatch } from './timeControl'
import { registerCalendarSurfaces } from './surfaces'

export function register(api: ValleyPluginApi): () => Promise<void> {
  initLocalization(api)
  const disposeReads = initRuntime(api)
  const disposeStyles = injectStyles()
  const disposeIcons = initializeNoteDateIcons(api)
  let deliveryWarningOpen = false
  const offDeliveryWarning = api.backend.on('records.eventDeliveryFailed', () => {
    if (deliveryWarningOpen) return
    deliveryWarningOpen = true
    void api.ui.confirm({ title: uiText('workflow.delivery.title'), message: uiText('workflow.delivery.message'), actions: [{ label: uiText('workflow.delivery.close'), value: 'close' }] }).catch(() => {}).finally(() => { deliveryWarningOpen = false })
  })
  const offNotification = api.notifications.onAction(event => {
    if (event.action !== 'click' || !event.targetItemId) return
    const target = event.targetItemId
    if (event.key.startsWith('reminder:file:')) { api.workspace.openFile(target); return }
    void api.data.dataset('calendar.events').query({ where: { id: target }, limit: 1 }).then(result => {
      const record = result.rows[0]
      if (record && typeof record.date === 'string') revealCalendarItem({ date: record.date, startTime: typeof record.startTime === 'string' ? record.startTime : undefined })
    }).catch(() => {})
  })
  const offLinks = api.workspace.onOpenOwnLink((state) => {
    const patch = calendarLinkPatch(state)
    if (patch) api.workspace.patchTimeControl(patch)
  })

  api.registerView('calendar.file', CalendarFileView)
  api.registerView('calendar.agenda', AgendaPanel)
  api.registerView('calendar.panel', Panel)
  api.registerView('calendar.page', Page)
  api.registerView('calendar.settings', Settings)


  // Tell the host which groups our events are in — a group is only deletable
  // once nothing anywhere is in it.
  const offGroupUsage = startGroupUsageReporting()

  const offCommands = registerCalendarCommands(api)
  const offSurfaces = registerCalendarSurfaces(api)
  const offAgentTools = api.interop.services.provide(AGENT_TOOL_PROVIDER_V1, calendarAgentTools(api))
  const offFence = registerCalendarFence()
  const reveals = revealTargetStore()
  const navigator: CalendarNavigator = {
    id: 'calendar',
    labelKey: 'manifest.name',
    // Preserves the current view mode, per the contract — the Agenda passes a
    // view of its own because clicking a timed item there means "show me the day".
    openDate: (request) => revealCalendarItem(request)
  }
  const offNavigator = api.interop.services.provide(CALENDAR_NAVIGATOR_V1, navigator)
  const offLinkHandler = api.links.register({
    id: 'reveal-date', label: api.ui.t('manifest.name'), version: '1.0.0', categories: ['date', 'datetime'],
    open: ({ category, value, context }) => {
      if (category === 'datetime') {
        const instant = new Date(value)
        const part = (n: number) => String(n).padStart(2, '0')
        revealCalendarItem({ date: `${instant.getFullYear()}-${part(instant.getMonth() + 1)}-${part(instant.getDate())}`, startTime: `${part(instant.getHours())}:${part(instant.getMinutes())}` })
      } else revealCalendarItem({ date: value, ...context })
      return { status: 'opened' }
    }
  })
  api.interop.state.publish(CALENDAR_PANEL_SELECTION_V1, null)
  reveals.publish(null)

  return async () => {
    try {
      offDeliveryWarning()
      offCommands()
      offSurfaces()
      offAgentTools()
      offFence()
      offNavigator()
      offLinkHandler()
      offGroupUsage()
      offLinks()
      offNotification()
      disposeIcons()
      disposeStyles()
      api.interop.state.publish(CALENDAR_PANEL_SELECTION_V1, null)
      reveals.publish(null)
    } finally { await disposeReads() }
  }
}

const plugin: ValleyPluginModule = { register }
export default plugin
