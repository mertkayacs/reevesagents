// Built-in starter presets seeded on first run when the presets directory
// is empty. After seeding the presets are regular user data — editable,
// deletable, and renamable. Re-seeding is suppressed once any preset exists,
// so deleted samples stay deleted.

import { existsSync, readdirSync } from 'node:fs'
import { savedTreesDir, saveSavedTree } from './store.js'
import { nowIso } from './runs.js'
import type { SavedTree, SavedTreeSlot } from './types.js'

function slot(overrides: Partial<SavedTreeSlot>): SavedTreeSlot {
  return {
    nickname_template: 'worker',
    provider: 'cc',
    model: '',
    auth_mode: 'default',
    effort: 'default',
    initial_prompt: '',
    working_dir: '',
    permissions: 'ask',
    rc_enabled: false,
    ...overrides,
  }
}

// Preset 1: hermes-led implementation team using all four providers.
function makeResearchTeam(createdAt: string): SavedTree {
  return {
    name: 'research-team',
    description: 'Hermes leads; cc analyzes, codex builds, opencode reviews.',
    working_dir_pattern: '',
    root: slot({
      nickname_template: 'hermes-lead',
      provider: 'hermes',
      initial_prompt:
        'Coordinate the team. Delegate review work to opencode, code analysis to cc, ' +
        'and implementation to codex. Summarize findings.',
    }),
    workers: [
      slot({
        nickname_template: 'cc-analyst',
        provider: 'cc',
        initial_prompt: 'Analyze code, reason about the problem, and report findings to the lead.',
      }),
      slot({
        nickname_template: 'codex-builder',
        provider: 'codex',
        initial_prompt: 'Implement code changes as directed by the lead.',
      }),
      slot({
        nickname_template: 'opencode-review',
        provider: 'opencode',
        initial_prompt: 'Review implementation plans and report risks as the lead requests.',
      }),
    ],
    created_at: createdAt,
    updated_at: createdAt,
  }
}

// Preset 2: cc-led pair, with a second cc executing and codex coding.
function makeCcPair(createdAt: string): SavedTree {
  return {
    name: 'cc-pair',
    description: 'Claude Code plans; a second cc plus codex implement.',
    working_dir_pattern: '',
    root: slot({
      nickname_template: 'cc-planner',
      provider: 'cc',
      initial_prompt:
        'Plan the work, then delegate concrete steps to the two workers. Review their output.',
    }),
    workers: [
      slot({
        nickname_template: 'cc-worker',
        provider: 'cc',
        initial_prompt: 'Execute the steps the planner gives you and report results back.',
      }),
      slot({
        nickname_template: 'codex-coder',
        provider: 'codex',
        initial_prompt: 'Write or modify code as the planner directs.',
      }),
    ],
    created_at: createdAt,
    updated_at: createdAt,
  }
}

export function defaultPresets(): SavedTree[] {
  // Distinct timestamps so the second preset sorts above the first by updated_at desc.
  const t1 = nowIso()
  const t2 = new Date(new Date(t1).getTime() + 1).toISOString()
  return [makeResearchTeam(t1), makeCcPair(t2)]
}

// Seed the presets dir with the default presets if and only if it has no
// presets yet. Returns the names that were written, empty when nothing happened.
export function seedDefaultPresetsIfEmpty(): string[] {
  const dir = savedTreesDir()
  let hasAny = false
  try {
    if (existsSync(dir)) {
      hasAny = readdirSync(dir).some(f => f.endsWith('.json'))
    }
  } catch {
    /* unreadable dir: fall through and try to seed */
  }
  if (hasAny) return []
  const written: string[] = []
  for (const preset of defaultPresets()) {
    try {
      saveSavedTree(preset)
      written.push(preset.name)
    } catch {
      /* skip on write failure; leave the rest */
    }
  }
  return written
}
