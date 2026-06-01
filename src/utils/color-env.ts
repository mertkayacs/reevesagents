// Prepares process env before Ink/Chalk load. Must not import Chalk.
// Inputs: process.env. Outputs: env vars that make interactive TUI color visible.

export function prepareTuiColorEnv(): void {
  if (process.env.REEVES_NO_COLOR === '1') {
    delete process.env.FORCE_COLOR
    process.env.NO_COLOR = '1'
    return
  }

  if (!process.env.TERM || process.env.TERM === 'dumb') {
    process.env.TERM = 'xterm-256color'
  }

  if (process.env.FORCE_COLOR === undefined) {
    delete process.env.NO_COLOR
    process.env.FORCE_COLOR = '3'
  }
}
