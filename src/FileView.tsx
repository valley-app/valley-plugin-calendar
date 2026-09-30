import { React } from './runtime'
import { Calendar } from './Calendar'

export function CalendarFileView({ relPath }: { relPath: string }): React.ReactElement {
  return <Calendar filePath={relPath} />
}
