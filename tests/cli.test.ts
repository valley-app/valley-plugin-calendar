import type { ValleyPluginManifest } from '@valley/plugin-sdk/types'
import { describe, expect, it } from 'vitest'
import { createMockValleyApi } from './harness'
import { initRuntime } from '../src/runtime'
import { registerCalendarCommands } from '../src/commands'
import config from '../config.json'

const ARGV_CASES: { args: string[]; flags: Record<string, string | boolean> }[] = [
  { args: [], flags: {} },
  { args: ['one two three'], flags: {} },
  { args: ['a', 'b', 'c'], flags: {} },
  { args: [''], flags: {} },
  { args: ['x'], flags: { exact: true, count: '3', q: 'hello world', unknown: 'y', neg: '-1' } },
  { args: ['--'], flags: { verbose: true } }
]

describe('command CLI mappings', () => {
  it('handles canonical argv shapes', () => {
    const mock = createMockValleyApi({ manifest: { id: 'calendar', datasets: config.datasets as unknown as ValleyPluginManifest['datasets'] }, datasets: { 'calendar.events': [] } })
    initRuntime(mock.api)
    registerCalendarCommands(mock.api)
    const swept: string[] = []
    for (const entry of mock.commands) {
      const fromCli = entry.input?.fromCli
      if (!fromCli) continue
      swept.push(entry.id)
      for (const c of ARGV_CASES) {
        let raw: unknown
        expect(() => {
          raw = fromCli(c.args, c.flags)
        }, `${entry.id} fromCli(${JSON.stringify(c)}) must not throw`).not.toThrow()
        try {
          entry.input!.parse(raw)
        } catch (err) {
          expect(err, `${entry.id} parse must throw a clean Error`).toBeInstanceOf(Error)
        }
      }
    }
    expect(swept.length).toBeGreaterThan(0)
  })

})
