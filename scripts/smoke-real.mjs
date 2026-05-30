// Real MCP smoke. Starts reevesagents mcp in an isolated state root and
// checks the v1 tool surface without launching provider CLIs or tmux windows.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const EXPECTED_TOOLS = [
  'start_run',
  'list_runs',
  'context',
  'list_agents',
  'tree',
  'get_run',
  'open_reeves',
  'open_agent',
  'peek',
  'wait',
  'send_text',
  'send_key',
  'interrupt',
  'spawn_worker',
  'kill_agent',
  'stop_run',
  'update_task',
  'send_message',
  'check_messages',
  'request_approval',
  'check_approval',
  'list_approvals',
  'resolve_approval',
  'poll_approval',
  'get_inbox',
  'doctor',
]

function ok(label) { console.log(`  ok  ${label}`) }
function fail(label, err) {
  console.error(`  FAIL ${label}: ${err?.message ?? err}`)
  process.exitCode = 1
}

async function main() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'reeves-smoke-real-'))
  const reevesConfig = join(tmpDir, 'config.json')
  const cliPath = resolve(new URL(import.meta.url).pathname, '..', '..', 'dist', 'cli.js')

  console.log(`smoke dir: ${tmpDir}`)
  console.log(`cli:       ${cliPath}`)

  const transport = new StdioClientTransport({
    command: 'node',
    args: [cliPath, 'mcp'],
    env: {
      ...process.env,
      REEVES_REGISTRY: tmpDir,
      REEVES_CONFIG: reevesConfig,
    },
  })

  const client = new Client(
    { name: 'reevesagents-smoke', version: '1.0' },
    { capabilities: {} },
  )

  try {
    await client.connect(transport)
    ok('connected over stdio')

    const list = await client.listTools()
    const names = list.tools.map(t => t.name).sort()
    const expected = [...EXPECTED_TOOLS].sort()
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      fail('tools/list returned wrong set', { message: `got ${names.join(',')}` })
    } else {
      ok(`tools/list returned all ${expected.length} tools`)
    }

    const startRun = list.tools.find(t => t.name === 'start_run')
    const providers = startRun?.inputSchema?.properties?.root?.properties?.provider?.enum
    const wantedProviders = ['cc', 'codex', 'opencode', 'hermes'].sort()
    if (!providers || JSON.stringify([...providers].sort()) !== JSON.stringify(wantedProviders)) {
      fail('start_run root provider enum mismatch', { message: JSON.stringify(providers) })
    } else {
      ok(`start_run schema lists providers: ${[...providers].join(', ')}`)
    }

    const runsResult = await client.callTool({ name: 'list_runs', arguments: {} })
    const runs = JSON.parse(runsResult.content[0].text)
    if (Array.isArray(runs) && runs.length === 0) {
      ok('list_runs returned [] on empty state')
    } else {
      fail('list_runs should be empty on fresh state', { message: JSON.stringify(runs).slice(0, 200) })
    }

    const treeResult = await client.callTool({ name: 'tree', arguments: {} })
    const trees = JSON.parse(treeResult.content[0].text)
    if (Array.isArray(trees) && trees.length === 0) {
      ok('tree returned [] on empty state')
    } else {
      fail('tree should be empty on fresh state', { message: JSON.stringify(trees).slice(0, 200) })
    }
  } catch (err) {
    fail('smoke aborted', err)
  } finally {
    try { await client.close() } catch { /* ignore */ }
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

main().catch(err => {
  fail('uncaught', err)
  process.exit(1)
})
