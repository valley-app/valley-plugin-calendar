import { calendarStyles } from './styles/calendar'
import { eventEditorStyles } from './styles/eventEditor'
import { itemStyles } from './styles/items'
import { agendaStyles } from './styles/agenda'
import { weekGridStyles } from './styles/weekGrid'
import { headerFilterStyles, inlineFilterStyles } from './styles/filters'
import { integrationStyles, noteDateStyles } from './styles/settings'

export const calendarCss = calendarStyles + eventEditorStyles + itemStyles + agendaStyles + weekGridStyles + headerFilterStyles + integrationStyles + inlineFilterStyles + noteDateStyles


const STYLE_ID = "notes-calendar-styles"

/** Inject (or refresh, on hot reload) the plugin stylesheet. */
export function injectStyles(): () => void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement("style")
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = calendarCss
  return () => {
    if (document.getElementById(STYLE_ID) === el) el.remove()
  }
}
