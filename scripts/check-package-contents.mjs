// Verifies the published package contains only intended files.

import { execFileSync } from 'node:child_process'

const required = new Set([
  'dist/cli.js',
  'dist/index.js',
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  // Web client assets: the optional web UI is dead without them, so prove the
  // build step (build-web-client.mjs) ran and they shipped.
  'dist/web/index.html',
  'dist/web/app.js',
  'dist/web/app.css',
  'dist/web/xterm.js',
  'dist/web/xterm.css',
  'dist/web/addon-fit.js',
  'dist/web/brand-duck.json',
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
    fail(`package includes forbidden source path: ${path}`)
  }
}

console.log(`package contents ok (${files.length} files)`)
