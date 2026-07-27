// Provider catalog command: providers.

import type { Command } from 'commander'
import { PROVIDERS, detectAvailable } from '../core/providers.js'
import { MODEL_CATALOG } from '../core/model-catalog.js'
import { providerDisplayName, providerColor } from '../utils/display.js'

export function registerProviders(program: Command): void {
  program
    .command('providers')
    .description('list providers with availability and known models')
    .option('--json', 'output JSON array')
    .option('--models', "also print each provider's known models")
    .action((opts) => {
      const available = detectAvailable()
      const providers = PROVIDERS.map(id => ({
        id,
        name: providerDisplayName(id),
        available: available[id],
        color: providerColor(id),
        models: [...MODEL_CATALOG[id].models],
      }))
      if (opts.json) {
        console.log(JSON.stringify(providers, null, 2))
        return
      }
      for (const provider of providers) {
        console.log(`${(provider.available ? 'ok' : '--').padEnd(3)} ${provider.id.padEnd(10)} ${provider.name}`)
        if (opts.models) {
          for (const model of provider.models) console.log(`      ${model}`)
        }
      }
    })
}
