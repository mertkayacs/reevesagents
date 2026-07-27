// Config command: show, get, or set one value.

import type { Command } from 'commander'
import { loadConfig, setConfigValues, parseConfigValue, CONFIG_FIELDS } from '../core/config.js'

export function registerConfig(program: Command): void {
  program
    .command('config [key] [value]')
    .description(`show config, get one value, or set one (keys: ${CONFIG_FIELDS.map(field => field.key).join(', ')})`)
    .option('--json', 'output JSON for show or get')
    .action((key: string | undefined, value: string | undefined, opts) => {
      try {
        if (key !== undefined && value !== undefined) {
          const cfg = setConfigValues({ [key]: parseConfigValue(key, value) })
          const saved = cfg.global as unknown as Record<string, unknown>
          console.log(`${key} = ${String(saved[key])}`)
          return
        }
        const cfg = loadConfig()
        const global = cfg.global as unknown as Record<string, unknown>
        if (key !== undefined) {
          if (!CONFIG_FIELDS.some(field => field.key === key)) throw new Error(`unknown config field: ${key}`)
          console.log(opts.json ? JSON.stringify(global[key]) : String(global[key]))
          return
        }
        if (opts.json) {
          console.log(JSON.stringify(cfg.global, null, 2))
          return
        }
        for (const field of CONFIG_FIELDS) {
          console.log(`${field.key.padEnd(20)} ${String(global[field.key])}`)
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}
