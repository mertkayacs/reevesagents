import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

// Guards the copied-from-the-unix-package files so the two provider catalogs and the
// secret redaction can never silently drift. Three catalog files are byte-identical
// copies (run `pnpm sync:shared` to refresh them); provider-build.ts and redact.ts
// are curated subsets, so we extract each copied declaration from the original and
// assert it is present verbatim in the copy.

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
}

// A named `export function foo(` ... up to the first column-0 closing brace.
function extractFunction(src: string, name: string): string {
  const start = src.indexOf(`export function ${name}(`)
  if (start < 0) throw new Error(`function not found in original: ${name}`)
  const end = src.indexOf('\n}\n', start)
  if (end < 0) throw new Error(`function end not found: ${name}`)
  return src.slice(start, end + 2)
}

// A const/interface declaration from its start marker to the newline where its
// bracket depth first returns to zero (handles single-line and multi-line forms).
function extractDeclaration(src: string, marker: string): string {
  const start = src.indexOf(marker)
  if (start < 0) throw new Error(`declaration not found in original: ${marker}`)
  let depth = 0
  let opened = false
  let i = src.indexOf('=', start)
  if (i < 0) i = start
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '(' || c === '[' || c === '{') { depth++; opened = true }
    else if (c === ')' || c === ']' || c === '}') { depth-- }
    if (c === '\n' && (opened ? depth === 0 : true)) break
  }
  return src.slice(start, i)
}

describe('catalog drift', () => {
  describe('byte-identical catalog copies', () => {
    for (const file of ['types.ts', 'provider-registry.ts', 'model-data.ts']) {
      it(`shared/${file} is byte-identical to src/core/${file}`, () => {
        const original = read(`../../../src/core/${file}`)
        const copy = read(`../src/shared/${file}`)
        expect(copy).toBe(original)
      })
    }
  })

  describe('pure helpers copied verbatim from providers.ts', () => {
    const original = () => read('../../../src/core/providers.ts')
    const copy = () => read('../src/shared/provider-build.ts')

    for (const name of ['coerceExtraArgs', 'isProvider', 'normalizeProvider', 'buildCommand']) {
      it(`provider-build.ts contains ${name} verbatim`, () => {
        expect(copy()).toContain(extractFunction(original(), name))
      })
    }

    for (const marker of ['export const BIN', 'export const PROVIDERS', 'const PROVIDER_ALIASES']) {
      it(`provider-build.ts contains "${marker}" verbatim`, () => {
        expect(copy()).toContain(extractDeclaration(original(), marker))
      })
    }
  })

  describe('secret redaction copied verbatim from core/redact.ts', () => {
    const original = () => read('../../../src/core/redact.ts')
    const copy = () => read('../src/shared/redact.ts')

    it('redact.ts contains redactSecrets verbatim', () => {
      expect(copy()).toContain(extractFunction(original(), 'redactSecrets'))
    })

    it('redact.ts contains the SECRET_PATTERNS list verbatim', () => {
      expect(copy()).toContain(extractDeclaration(original(), 'const SECRET_PATTERNS'))
    })
  })
})
