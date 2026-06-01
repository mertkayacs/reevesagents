// Verifies the published PRE-BETA orchestrator package stays separate and focused.

import { execFileSync } from 'node:child_process'

const required = new Set([
  'dist/cli.js',
  'dist/index.js',
  'package.json',
  'README.md',
  'docs/mcp-tools.md',
])

const forbiddenPrefixes = [
  'src/',
  'test/',
  'scripts/',
  '.github/',
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
  if (path.startsWith('docs/') && path !== 'docs/mcp-tools.md') {
    fail(`package includes non-runtime doc: ${path}`)
  }
  if (forbiddenPrefixes.some(prefix => path.startsWith(prefix))) {
    fail(`package includes forbidden path: ${path}`)
  }
}

console.log(`orchestrator package contents ok (${files.length} files)`)
