// Verifies the published root package stays spawner-only.

import { execFileSync } from 'node:child_process'

const required = new Set([
  'dist/cli.js',
  'dist/index.js',
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
])

const forbiddenPrefixes = [
  'packages/',
  'src/',
  'test/',
  'docs/',
  'scripts/',
  '.github/',
]

const forbiddenSubstrings = [
  'orchestrator',
  'mcp-setup',
  'mcp-tools',
  'approvals',
]

function fail(message) {
  console.error(message)
  process.exit(1)
}

const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' })
const [pack] = JSON.parse(raw)
if (!pack || !Array.isArray(pack.files)) fail('npm pack --dry-run returned no file list')

const files = pack.files.map(file => file.path).sort()
for (const path of required) {
  if (!files.includes(path)) fail(`package missing required file: ${path}`)
}

for (const path of files) {
  if (forbiddenPrefixes.some(prefix => path.startsWith(prefix))) {
    fail(`package includes forbidden path: ${path}`)
  }
  if (forbiddenSubstrings.some(value => path.includes(value))) {
    fail(`package includes forbidden orchestrator-related path: ${path}`)
  }
}

console.log(`package contents ok (${files.length} files)`)
