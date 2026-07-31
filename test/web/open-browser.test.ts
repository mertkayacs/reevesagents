import { describe, it, expect } from 'vitest'
import { browserOpenCommand } from '../../src/surfaces/webui/open-browser.js'

describe('browserOpenCommand', () => {
  it('uses open on macOS', () => {
    expect(browserOpenCommand('http://x', {}, 'darwin')).toEqual({ cmd: 'open', args: ['http://x'] })
  })
  it('uses start on Windows', () => {
    expect(browserOpenCommand('http://x', {}, 'win32')).toEqual({ cmd: 'cmd', args: ['/c', 'start', '', 'http://x'] })
  })
  it('uses xdg-open on plain Linux', () => {
    expect(browserOpenCommand('http://x', {}, 'linux')).toEqual({ cmd: 'xdg-open', args: ['http://x'] })
  })
  it('uses wslview under WSL2', () => {
    expect(browserOpenCommand('http://x', { WSL_DISTRO_NAME: 'Ubuntu' }, 'linux')).toEqual({ cmd: 'wslview', args: ['http://x'] })
    expect(browserOpenCommand('http://x', { WSL_INTEROP: '/run/x' }, 'linux')).toEqual({ cmd: 'wslview', args: ['http://x'] })
  })
})
