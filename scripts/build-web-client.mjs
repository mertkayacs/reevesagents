// Copies the web client assets into dist/web/ after tsup builds the server.
// Input: xterm UMD files from node_modules + the hand-written client and brand asset in src/surfaces/webui/client.
// Output: a flat dist/web/ the server serves from a fixed allowlist.
// Invariant: xterm ships from devDependencies, so end users install nothing extra.

import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = join(root, 'dist', 'web')

const copies = [
  ['node_modules/@xterm/xterm/lib/xterm.js', 'xterm.js'],
  ['node_modules/@xterm/xterm/css/xterm.css', 'xterm.css'],
  ['node_modules/@xterm/addon-fit/lib/addon-fit.js', 'addon-fit.js'],
  ['src/surfaces/webui/client/index.html', 'index.html'],
  ['src/surfaces/webui/client/app.css', 'app.css'],
  ['src/surfaces/webui/client/app.js', 'app.js'],
  ['src/surfaces/webui/client/brand-duck.json', 'brand-duck.json'],
]

mkdirSync(outDir, { recursive: true })
for (const [from, to] of copies) {
  const src = join(root, from)
  if (!existsSync(src)) {
    console.error(`build-web-client: missing source ${from}`)
    process.exit(1)
  }
  copyFileSync(src, join(outDir, to))
  console.log(`web client: ${from} -> dist/web/${to}`)
}
console.log(`web client assets written to ${outDir}`)
