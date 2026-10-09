import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The Claude Code plugin in plugin/ ships its own copy of the skill, because
// plugin directories cannot follow symlinks. These checks keep the copy and
// the manifests in step with the package.
const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const json = (path: string) => JSON.parse(read(path))

describe('Claude Code plugin', () => {
  it('ships the same skill as the npm package', () => {
    expect(read('plugin/skills/reevesagents/SKILL.md')).toBe(read('skills/reevesagents/SKILL.md'))
  })

  it('has the package version', () => {
    expect(json('plugin/.claude-plugin/plugin.json').version).toBe(json('package.json').version)
  })

  it('starts the MCP server from the installed CLI', () => {
    expect(json('plugin/.mcp.json')).toEqual({ reevesagents: { command: 'reevesagents', args: ['mcp'] } })
  })

  it('is listed in the repository marketplace', () => {
    const marketplace = json('.claude-plugin/marketplace.json')
    expect(marketplace.plugins).toEqual([expect.objectContaining({ name: 'reevesagents', source: './plugin' })])
  })
})
