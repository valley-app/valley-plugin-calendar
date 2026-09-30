import { React } from './runtime'
import type { ReactElement } from 'react'
import type { MainWorkspaceViewProps } from '@valley/plugin-sdk'
import { Calendar } from './Calendar'

/**
 * `main_workspace` view — the full Calendar (month/week/year grids + QuickAdd).
 * The group legend lives in the Calendar header beside the view switcher.
 */
export function Page({ navigation }: MainWorkspaceViewProps): ReactElement {
  return <Calendar variant="main" navigation={navigation} />
}
