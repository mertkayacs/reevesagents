import { Command } from 'commander'
import { startMcpServer } from './mcp.js'

const program = new Command()
program.name('reevesagents').description('local tmux-first run manager for AI CLI agents').version('0.4.0')
program.command('mcp').description('start MCP server over stdio').action(async () => startMcpServer())
program.parse(process.argv)
