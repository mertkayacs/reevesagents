// Helper tool catalogue command: tools.

import type { Command } from 'commander'
import { detectToolStatuses } from '../../core/tool-registry.js'

export function registerTools(program: Command): void {
  program
    .command('tools')
    .description('list helper tool CLIs (search, runtimes, model hub, local models) with install, sign-in or reachability state')
    .option('--json', 'output JSON array')
    .action((opts) => {
      const tools = detectToolStatuses()
      if (opts.json) {
        console.log(JSON.stringify(tools, null, 2))
        return
      }
      for (const tool of tools) {
        // A missing binary has no meaningful sign-in state; only installed
        // tools get their probed state printed.
        const stateText = tool.installed ? `${tool.state_means}: ${tool.state}` : 'not installed'
        console.log(`${(tool.installed ? 'ok' : '--').padEnd(3)} ${tool.id.padEnd(7)} ${tool.display_name.padEnd(18)} ${stateText}`)
        console.log(`      ${tool.purpose}`)
        console.log(`      ${tool.example}`)
      }
    })
}
