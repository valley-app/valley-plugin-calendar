import { cleanup, render, screen } from '@testing-library/react'
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createMockValleyApi } from './harness'
import { initRuntime } from '../src/runtime'
import { initLocalization } from '../src/localization'
import { Settings } from '../src/Settings'

afterEach(cleanup)

describe('calendar settings', () => {
  it('hands group management to the central Groups page', () => {
    const mock = createMockValleyApi({ manifest: { id: 'calendar' } })
    initLocalization(mock.api)
    initRuntime(mock.api)
    render(React.createElement(Settings))

    // Calendar colours its items by group but owns no group editor of its own —
    // one registry, one page, reached the same way from every plugin's pane.
    expect(screen.getByTestId('shared-groups-editor')).toBeInTheDocument()

    expect(mock.api.workspace.openSettings).not.toHaveBeenCalled()
  })
})
