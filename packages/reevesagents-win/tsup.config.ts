import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
  },
  format: ['esm'],
  dts: false,
  clean: true,
  target: 'node20',
  platform: 'node',
  // Native ConPTY addon: never bundle it, resolve at runtime so the prebuilt
  // win32 binary loads on the target machine.
  external: ['@lydell/node-pty'],
  sourcemap: true,
  shims: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  esbuildOptions(options) {
    options.conditions = ['module']
  },
})
