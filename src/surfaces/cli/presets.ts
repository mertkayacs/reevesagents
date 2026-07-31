// Preset commands: presets, save-preset, delete-preset, start-preset.

import type { Command } from 'commander'
import { listPresets, savePresetFromRun, deletePreset } from '../../core/store.js'
import { startRunFromPreset } from '../../core/runtime.js'
import { resolveRun, requireDestructiveConfirmation } from './helpers.js'

export function registerPresets(program: Command): void {
  program
    .command('presets')
    .description('list saved presets')
    .option('--json', 'output JSON array')
    .action((opts) => {
      const presets = listPresets()
      if (opts.json) {
        console.log(JSON.stringify(presets, null, 2))
        return
      }
      if (presets.length === 0) {
        console.log('no presets')
        return
      }
      for (const preset of presets) {
        console.log(`${preset.name.padEnd(24)}  ${String(1 + preset.workers.length).padStart(2)} agents  ${preset.description}`)
      }
    })
}

export function registerSavePreset(program: Command): void {
  program
    .command('save-preset <run-id> <name> [description...]')
    .description('save a run as a reusable preset')
    .action((runId: string, name: string, description: string[]) => {
      try {
        const run = resolveRun(runId)
        const tree = savePresetFromRun(run.id, name, description.join(' '))
        console.log(`saved preset ${tree.name}  ${1 + tree.workers.length} agents`)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}

export function registerDeletePreset(program: Command): void {
  program
    .command('delete-preset <name>')
    .description('delete a saved preset')
    .option('-y, --yes', 'confirm delete')
    .action((name: string, opts) => {
      requireDestructiveConfirmation(opts, 'delete preset')
      if (!listPresets().some(preset => preset.name === name)) throw new Error(`preset not found: ${name}`)
      deletePreset(name)
      console.log(`deleted preset ${name}`)
    })
}

export function registerStartPreset(program: Command): void {
  program
    .command('start-preset <name>')
    .description('start a run from a saved preset')
    .option('--name <name>', 'override the run name')
    .option('--cwd <dir>', 'working directory', process.cwd())
    .action((name: string, opts) => {
      try {
        if (!listPresets().some(preset => preset.name === name)) throw new Error(`preset not found: ${name}`)
        const result = startRunFromPreset(name, { name: opts.name, working_dir: opts.cwd })
        console.log(`started ${result.run.id.slice(0, 8)}  ${result.run.name}  ${result.agents.length} agents`)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}
