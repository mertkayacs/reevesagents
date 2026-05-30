import { Command } from 'commander'

const program = new Command()
program.name('reevesagents').description('local tmux-first run manager for AI CLI agents').version('0.1.0')
program.parse(process.argv)
