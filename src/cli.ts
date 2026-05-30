import { Command } from 'commander'
import { execFileSync } from 'node:child_process'
import { handleMcpTool, startMcpServer } from './mcp.js'
import { runDoctor } from './launcher/doctor.js'
import { listRuns } from './state/runs.js'

const program = new Command()
program.name('reevesagents').description('local tmux-first run manager for AI CLI agents').version('0.8.0')
program.command('context').option('--json').action(async opts => {
  const result = await handleMcpTool('context', {}, null)
  const text = result.content[0]?.text ?? '{}'
  console.log(opts.json ? text : JSON.stringify(JSON.parse(text), null, 2))
})
program.command('runs').option('--json').action(opts => {
  const runs = listRuns()
  console.log(opts.json ? JSON.stringify(runs) : (runs.length ? runs.map(run => `${run.id} ${run.name}`).join('\n') : 'No runs'))
})
program.command('doctor').option('--json').action(opts => {
  const result = runDoctor()
  console.log(opts.json ? JSON.stringify(result) : result.checks.map(check => `${check.name}: ${check.status} ${check.detail}`).join('\n'))
})
program.command('open <target>').action(target => { execFileSync('tmux', ['attach', '-t', target], { stdio: 'inherit' }) })
program.command('mcp').description('start MCP server over stdio').action(async () => startMcpServer())
program.command('call <tool> [json]').action(async (tool, json = '{}') => {
  const result = await handleMcpTool(tool, JSON.parse(json), process.env.REEVES_SESSION_ID ?? process.env.REEVES_AGENT_ID ?? null)
  console.log(result.content[0]?.text ?? '')
})
program.parse(process.argv)
