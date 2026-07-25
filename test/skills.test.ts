import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  REEVESAGENTS_SKILL,
  SKILL_NAME,
  skillTargets,
  installSkills,
  skillsStatus,
  removeSkills,
} from '../src/core/skills.js'

let tmpHome: string
let savedHome: string | undefined

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'reeves-skills-test-'))
  savedHome = process.env.REEVES_HOME
  process.env.REEVES_HOME = tmpHome
})

afterEach(() => {
  if (savedHome === undefined) delete process.env.REEVES_HOME
  else process.env.REEVES_HOME = savedHome
  rmSync(tmpHome, { recursive: true, force: true })
})

describe('reevesagents skill', () => {
  it('has portable frontmatter: a valid name and a non-empty description', () => {
    const match = REEVESAGENTS_SKILL.match(/^---\n([\s\S]*?)\n---/)
    expect(match).not.toBeNull()
    const frontmatter = match![1]!
    const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim()
    const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim()
    expect(name).toBe(SKILL_NAME)
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(name!.length).toBeLessThanOrEqual(64)
    expect(description!.length).toBeGreaterThan(0)
    expect(description!.length).toBeLessThanOrEqual(1024)
  })

  it('the committed skills/reevesagents/SKILL.md matches the shipped content', () => {
    const committed = readFileSync(join(process.cwd(), 'skills', 'reevesagents', 'SKILL.md'), 'utf-8')
    expect(committed).toBe(REEVESAGENTS_SKILL)
  })

  it('targets the two convergent skill directories under the home dir', () => {
    const targets = skillTargets()
    expect(targets.map(t => t.key)).toEqual(['claude', 'agents'])
    expect(targets[0]!.file).toBe(join(tmpHome, '.claude', 'skills', 'reevesagents', 'SKILL.md'))
    expect(targets[1]!.file).toBe(join(tmpHome, '.agents', 'skills', 'reevesagents', 'SKILL.md'))
  })

  it('installs the skill to both locations, reports status, then removes it', () => {
    const installed = installSkills()
    expect(installed.every(r => r.ok)).toBe(true)
    for (const target of skillTargets()) {
      expect(existsSync(target.file)).toBe(true)
      expect(readFileSync(target.file, 'utf-8')).toBe(REEVESAGENTS_SKILL)
    }

    const status = skillsStatus()
    expect(status.every(r => r.present && r.current)).toBe(true)

    const removed = removeSkills()
    expect(removed.every(r => r.ok)).toBe(true)
    for (const target of skillTargets()) {
      expect(existsSync(target.file)).toBe(false)
    }
    expect(skillsStatus().every(r => !r.present)).toBe(true)
  })

  it('reports present-but-outdated when an installed file drifts from the shipped content', () => {
    installSkills()
    const target = skillTargets()[0]!
    writeFileSync(target.file, '---\nname: reevesagents\ndescription: stale\n---\nold\n', 'utf-8')
    const status = skillsStatus().find(r => r.key === target.key)!
    expect(status.present).toBe(true)
    expect(status.current).toBe(false)
  })

  it('remove is safe to run when nothing is installed', () => {
    const removed = removeSkills()
    expect(removed.every(r => r.ok && r.message === 'not installed')).toBe(true)
  })
})
