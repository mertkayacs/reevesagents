// Environment setup commands: setup (first-run wizard), skills, doctor.

import type { Command } from 'commander'
import { runDoctor } from '../../core/doctor.js'
import { installSkills, skillsStatus, removeSkills } from '../../core/skills.js'
import { buildOnboardingState, runOnboarding, suggestedAgentPrompt } from '../../core/onboard.js'
import { providerDisplayName } from '../../utils/display.js'

export function registerSetup(program: Command): void {
  program
    .command('setup')
    .description('check your setup and connect installed CLIs (the first-run wizard)')
    .option('--attach', 'connect reevesagents to every installed host CLI (default only reports)')
    .option('--json', 'print the onboarding state as JSON')
    .action(async (opts: { attach?: boolean; json?: boolean }) => {
      try {
        const state = buildOnboardingState()
        if (opts.json) {
          console.log(JSON.stringify(state, null, 2))
          return
        }
        console.log(`tmux       ${state.tmuxOk ? 'ok' : 'missing (required; install tmux 3.0+)'}`)
        console.log(`node       ${state.nodeOk ? 'ok' : 'too old (need >=20.19)'}`)
        console.log(`providers  ${state.installedProviders.length > 0 ? state.installedProviders.map(providerDisplayName).join(', ') : 'none installed'}`)

        if (state.installedProviders.length === 0) {
          console.log('\nInstall a provider CLI (for example Claude Code or Codex) and sign in, then run setup again.')
          return
        }

        console.log('\nTwo ways to use reevesagents:')
        console.log(`  1. Run agents yourself       reevesagents spawn ${state.installedProviders[0]}`)
        console.log('  2. Let one CLI drive others  connect the Agent control MCP (below)')

        const installedHosts = state.hosts.filter(host => host.installed)
        if (installedHosts.length > 0) {
          console.log('\nHost CLIs (can drive the others once connected):')
          for (const host of installedHosts) {
            const status = host.attached ? 'connected' : host.manual ? 'add manually' : 'not connected'
            console.log(`  ${host.key.padEnd(10)} ${status}`)
          }
        }

        if (!opts.attach) {
          if (state.attachable.length > 0) {
            console.log(`\nTo connect ${state.attachable.join(', ')}, run:  reevesagents setup --attach`)
          } else if (state.attachedHosts.length > 0) {
            console.log('\nAll installed host CLIs are already connected. Restart them to load the tools.')
          }
          return
        }

        console.log('\nSetting up...')
        const result = await runOnboarding()
        if (result.skills.some(skill => skill.ok)) {
          console.log('  ok  skill      installed for skill-aware CLIs (Claude, Codex, Kimi, OpenCode)')
        }
        for (const attached of result.attached) {
          console.log(`  ${(attached.ok ? 'ok' : '--').padEnd(3)} ${attached.key.padEnd(10)} ${attached.message}`)
        }
        if (result.verify?.ok) {
          console.log(`\nverified: ${result.verify.detail}.`)
          const keys = result.attached.filter(attached => attached.ok).map(attached => attached.key)
          console.log(`Restart ${keys.join(', ')} (start a new session), then ask it: "${suggestedAgentPrompt(state.installedProviders)}".`)
        } else if (result.verify) {
          console.log(`\nwarning: the server did not start here: ${result.verify.detail}`)
          console.log('a host CLI will hit the same error. check that reevesagents is installed and re-run setup --attach.')
        }
        if (!result.attached.some(attached => attached.ok) || result.verify?.ok === false) process.exitCode = 1
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}

export function registerSkills(program: Command): void {
  program
    .command('skills [action]')
    .description('install the reevesagents skill for skill-aware CLIs (action: status, install, remove)')
    .option('--json', 'output JSON')
    .action((action: string | undefined, opts: { json?: boolean }) => {
      const verb = action ?? 'status'
      try {
        if (verb === 'install') {
          const results = installSkills()
          if (opts.json) { console.log(JSON.stringify(results, null, 2)); return }
          for (const r of results) console.log(`${(r.ok ? 'ok' : '--').padEnd(3)} ${r.label.padEnd(24)} ${r.file}`)
          console.log('\nrestart your CLIs to pick up the skill.')
          if (results.some(r => !r.ok)) process.exitCode = 1
          return
        }
        if (verb === 'remove') {
          const results = removeSkills()
          if (opts.json) { console.log(JSON.stringify(results, null, 2)); return }
          for (const r of results) console.log(`${(r.ok ? 'ok' : '--').padEnd(3)} ${r.label.padEnd(24)} ${r.message}`)
          if (results.some(r => !r.ok)) process.exitCode = 1
          return
        }
        if (verb === 'status') {
          const rows = skillsStatus()
          if (opts.json) { console.log(JSON.stringify(rows, null, 2)); return }
          for (const r of rows) {
            const state = !r.present ? 'absent' : r.current ? 'installed' : 'outdated'
            console.log(`${state.padEnd(10)} ${r.label.padEnd(24)} ${r.file}`)
          }
          console.log('\nrun "reevesagents skills install" to (re)install.')
          return
        }
        throw new Error(`unknown action: ${verb} (use status, install, or remove)`)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('run setup and environment health checks')
    .option('--json', 'output JSON')
    .action((opts) => {
      const result = runDoctor()
      const anyFail = result.checks.some(check => check.status === 'fail')
      if (opts.json) {
        console.log(JSON.stringify({ ok: !anyFail, checks: result.checks }, null, 2))
      } else {
        for (const check of result.checks) {
          console.log(`${check.status.toUpperCase().padEnd(4)} ${check.name.padEnd(14)} ${check.detail}`)
        }
      }
      process.exit(anyFail ? 1 : 0)
    })
}
