// PRE-BETA orchestrator entry point. Keeps MCP setup out of the main package.

import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { handleMcpTool, startMcpServer } from './mcp.js'
import { registerAll } from './mcp-setup.js'
import { ORCHESTRATOR_VERSION } from './version.js'
import type { AgentRecord, RunRecord } from '../../../src/state/types.js'

const program = new Command()

program
  .name('reevesagents-orchestrator')
  .description('PRE-BETA ReevesAgents MCP orchestration tools')
  .version(ORCHESTRATOR_VERSION)

function callerAgentId(): string | null {
  return process.env.REEVES_SESSION_ID ?? process.env.REEVES_AGENT_ID ?? null
}

function parseToolJson(result: Awaited<ReturnType<typeof handleMcpTool>>, tool: string): unknown {
  const text = result.content[0]?.text ?? ''
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text
  }
  if ('isError' in result && result.isError) {
    const message = typeof parsed === 'object' && parsed !== null && 'error' in parsed
      ? String((parsed as { error: unknown }).error)
      : text
    throw new Error(`${tool}: ${message}`)
  }
  return parsed
}

function printPayload(payload: unknown): void {
  if (typeof payload === 'string') {
    console.log(payload)
    return
  }
  console.log(JSON.stringify(payload, null, 2))
}

function readJsonArgs(inlineJson: string | undefined, filePath: string | undefined): Record<string, unknown> {
  const source = filePath
    ? readFileSync(filePath, 'utf8')
    : inlineJson !== undefined
      ? inlineJson
      : process.stdin.isTTY
        ? '{}'
        : readFileSync(0, 'utf8')
  const trimmed = source.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('tool arguments must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

function printContext(payload: unknown): void {
  if (typeof payload !== 'object' || payload === null) {
    console.log(String(payload))
    return
  }

  const data = payload as {
    role?: string
    agent?: Partial<AgentRecord>
    run?: Partial<RunRecord>
    root?: Partial<AgentRecord> | null
    workers?: Array<Partial<AgentRecord>>
    runs?: Array<Partial<RunRecord>>
    approvals?: unknown[]
    controls?: Record<string, unknown>
  }

  console.log(`role        ${data.role ?? 'unknown'}`)
  if (data.agent) console.log(`agent       ${data.agent.id ?? '-'}  ${data.agent.nickname ?? '-'}  ${data.agent.task_status ?? '-'}`)
  if (data.run) console.log(`run         ${data.run.id ?? '-'}  ${data.run.status ?? '-'}  ${data.run.name ?? '-'}`)
  if (data.root) console.log(`root        ${data.root.id ?? '-'}  ${data.root.nickname ?? '-'}  ${data.root.task_status ?? '-'}`)
  if (data.workers) console.log(`workers     ${data.workers.length}`)
  if (data.approvals) console.log(`approvals   ${data.approvals.length}`)
  if (data.runs) console.log(`runs        ${data.runs.length}`)
  if (data.controls) {
    const controls = Object.entries(data.controls)
      .filter(([, enabled]) => enabled === true)
      .map(([name]) => name)
      .join(', ')
    if (controls) console.log(`controls    ${controls}`)
  }
}

function printSetupResults(): void {
  console.log('Orchestrator mode is PRE-BETA. This command writes MCP config entries.')
  for (const result of registerAll()) {
    const state = result.registered ? 'registered' : result.detected ? 'detected, not registered' : 'not found'
    console.log(`${result.cli.padEnd(14)} ${state}${result.note ? ` (${result.note})` : ''}`)
  }
}

program
  .command('mcp')
  .description('start the PRE-BETA MCP server over stdio')
  .action(async () => {
    await startMcpServer()
  })

program
  .command('call <tool> [json]')
  .description('call one PRE-BETA MCP tool using JSON arguments')
  .option('--file <path>', 'read JSON arguments from a file')
  .option('--caller <agent-id>', 'act as a root or worker agent caller')
  .action(async (tool, json, opts) => {
    try {
      const args = readJsonArgs(json, opts.file)
      const payload = parseToolJson(await handleMcpTool(tool, args, opts.caller ?? callerAgentId()), tool)
      printPayload(payload)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })

program
  .command('context')
  .description('show caller role, current run, agents, approvals, and controls')
  .option('--json', 'output JSON')
  .action(async (opts) => {
    try {
      const payload = parseToolJson(await handleMcpTool('context', {}, callerAgentId()), 'context')
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2))
        return
      }
      printContext(payload)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })

program
  .command('setup')
  .description('register MCP configs for Orchestrator PRE-BETA mode')
  .option('--json', 'output JSON array')
  .action((opts) => {
    const results = registerAll()
    if (opts.json) {
      console.log(JSON.stringify(results, null, 2))
      return
    }
    printSetupResults()
  })

program.parse()
