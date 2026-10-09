import { React } from './runtime'
import { Calendar } from './Calendar'
import type { MountedPluginView } from '@valley/plugin-sdk'

export function CalendarFileView({ relPath, mountedView }: { relPath: string; mountedView?: MountedPluginView }): React.ReactElement {
  return <Calendar filePath={relPath} mountedView={mountedView} />
}
