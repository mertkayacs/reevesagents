import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    cli: 'src/surfaces/cli/index.ts',
    index: 'src/index.ts',
    winmux: 'src/winmux-cli.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node22',
  platform: 'node',
  // Optional web extras: keep them as runtime imports so an absent native module
  // degrades gracefully instead of breaking the bundle. tsup only auto-externalizes
  // dependencies + peerDependencies, so optionalDependencies must be listed here.
  external: ['ws', '@lydell/node-pty', '@xterm/headless'],
  sourcemap: true,
  shims: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  esbuildOptions(options) {
    options.conditions = ['module']
  },
})
