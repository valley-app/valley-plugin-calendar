import type { ReactElement } from 'react'
import { React } from './runtime'
import { Calendar } from './Calendar'

/** `right_sidebar` view — the compact Calendar that self-measures to its width. */
export function Panel(): ReactElement {
  return <Calendar variant="right" />
}
