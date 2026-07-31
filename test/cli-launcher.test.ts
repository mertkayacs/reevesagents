import { describe, it, expect } from 'vitest'
import { tuiNewWindowArgs } from '../src/surfaces/cli/tui-launcher.js'

// Regression guard for the "index 1 in use" launch failure: the app names the TUI session AND its
// window "reeves", and every leftover reeves-* session also has an index-1 window named "reeves".
// A bare `new-window -t reeves` resolves to that window and pins index 1; the exact-session + trailing
// colon form forces tmux to append at the next free index in the app-owned session only.
describe('tui launcher tmux target', () => {
  it('appends via an exact-session target, never a bare or prefix-matchable name', () => {
    const args = tuiNewWindowArgs('reeves', 'reeves', 'node cli.js')
    const target = args[args.indexOf('-t') + 1]
    expect(target).toBe('=reeves:')
    expect(target).not.toBe('reeves')
    expect(args).toEqual([
      'new-window', '-d', '-P', '-F', '#{window_id}', '-t', '=reeves:', '-n', 'reeves', 'node cli.js',
    ])
  })
})
