// Re-copy the drift-guarded catalog files from the unix package's src/core into
// src/shared. These three are byte-identical copies (the provider catalog: types,
// registry, model data) and catalog-drift.test.ts fails if they diverge from the
// originals, so this is the one-command fix when the unix catalog changes.
//
// provider-build.ts and redact.ts are curated subsets kept by hand (they pull only
// the pure helpers we need); the drift test guards those too, but they are not
// mechanical copies, so this script does not touch them.

import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const srcCore = join(here, '..', '..', '..', 'src', 'core')
const dstShared = join(here, '..', 'src', 'shared')

const FILES = ['types.ts', 'provider-registry.ts', 'model-data.ts']

mkdirSync(dstShared, { recursive: true })
for (const file of FILES) {
  copyFileSync(join(srcCore, file), join(dstShared, file))
  console.log(`synced shared/${file}`)
}
