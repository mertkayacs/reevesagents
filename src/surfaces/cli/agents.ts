// Agent I/O commands: peek, kill, send, key, interrupt, delete, agents.

import type { Command } from 'commander'
import { peekAgent, killAgent, sendText, sendKey, interrupt, type AllowedKey, ALLOWED_KEYS } from '../../core/runtime.js'
import { listAgents, deleteAgent } from '../../core/runs.js'
import { providerDisplayName } from '../../utils/display.js'
import { resolveAgent, resolveRun, requireDestructiveConfirmation } from './helpers.js'

export function registerPeek(program: Command): void {
  program
    .command('peek <agent-id>')
    .description('show recent output from one agent')
    .option('-n, --lines <n>', 'number of lines', '20')
    .option('--json', 'output JSON with lines array')
    .action((id, opts) => {
      const agent = resolveAgent(id)
      const lines = Number.parseInt(opts.lines, 10)
      const output = peekAgent(agent.id, Number.isFinite(lines) ? lines : 20)
      if (opts.json) {
        console.log(JSON.stringify({ agent_id: agent.id, lines: output ? output.split('\n') : [] }, null, 2))
        return
      }
      if (!output) {
        console.error(`no output for agent ${agent.id}`)
        process.exit(1)
      }
      console.log(output)
    })
}

export function registerKill(program: Command): void {
  program
    .command('kill <agent-id>')
    .description('stop one agent')
    .option('-y, --yes', 'confirm stop')
    .action((id, opts) => {
      requireDestructiveConfirmation(opts, 'stop agent')
      const agent = resolveAgent(id)
      const killed = killAgent(agent.id)
      console.log(`stopped ${killed.id.slice(0, 8)}  ${killed.nickname}`)
    })
}

export function registerSend(program: Command): void {
  program
    .command('send <agent-id> <text...>')
    .description('paste text into an agent')
    .action((id, textParts: string[]) => {
      try {
        const agent = resolveAgent(id)
        sendText(agent.id, textParts.join(' '))
        console.log(`sent to ${agent.id.slice(0, 8)}  ${agent.nickname}`)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}

export function registerKey(program: Command): void {
  program
    .command('key <agent-id> <key>')
    .description(`send a single keypress to an agent (${ALLOWED_KEYS.join(', ')})`)
    .action((id, key: string) => {
      try {
        const agent = resolveAgent(id)
        if (!ALLOWED_KEYS.includes(key as AllowedKey)) {
          throw new Error(`unsupported key: ${key} (allowed: ${ALLOWED_KEYS.join(', ')})`)
        }
        sendKey(agent.id, key as AllowedKey)
        console.log(`sent ${key} to ${agent.id.slice(0, 8)}  ${agent.nickname}`)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}

export function registerInterrupt(program: Command): void {
  program
    .command('interrupt <agent-id>')
    .description('send an interrupt (ctrl-c) to an agent')
    .action((id) => {
      try {
        const agent = resolveAgent(id)
        interrupt(agent.id)
        console.log(`interrupted ${agent.id.slice(0, 8)}  ${agent.nickname}`)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}

export function registerDelete(program: Command): void {
  program
    .command('delete <agent-id>')
    .description('delete an ended agent')
    .option('-y, --yes', 'confirm delete')
    .action((id, opts) => {
      requireDestructiveConfirmation(opts, 'delete agent')
      const agent = resolveAgent(id)
      const deleted = deleteAgent(agent.id)
      console.log(`deleted ${deleted.id.slice(0, 8)}  ${deleted.nickname}`)
    })
}

export function registerAgents(program: Command): void {
  program
    .command('agents [run-id]')
    .description('list agents, optionally only those in one run')
    .option('--json', 'output JSON array')
    .action((runId: string | undefined, opts) => {
      try {
        const run = runId ? resolveRun(runId) : undefined
        const agents = listAgents(run?.id)
        if (opts.json) {
          console.log(JSON.stringify(agents, null, 2))
          return
        }
        if (agents.length === 0) {
          console.log('no agents')
          return
        }
        for (const agent of agents) {
          const note = agent.task_note.trim()
          console.log(`${agent.id.slice(0, 8)}  ${agent.run_id.slice(0, 8)}  ${agent.role.padEnd(6)}  ${agent.task_status.padEnd(7)}  ${providerDisplayName(agent.provider).padEnd(14)}  ${(agent.model || 'default').padEnd(16)}  ${agent.nickname}${note ? `  ${note}` : ''}`)
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}
