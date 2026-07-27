import { describe, it, expect } from 'vitest'

describe('redactSecrets', () => {
  it('replaces anthropic keys with [REDACTED]', async () => {
    const { redactSecrets } = await import('../src/core/redact.js')
    const input = 'auth: sk-ant-api03-abcdef1234567890abcdef1234567890 trailing'
    expect(redactSecrets(input)).toBe('auth: [REDACTED] trailing')
  })

  it('replaces openai-shaped keys with [REDACTED]', async () => {
    const { redactSecrets } = await import('../src/core/redact.js')
    const input = 'token=sk-proj1234567890abcdefghij1234567890'
    expect(redactSecrets(input)).toContain('[REDACTED]')
    expect(redactSecrets(input)).not.toContain('sk-proj')
  })

  it('replaces google api keys with [REDACTED]', async () => {
    const { redactSecrets } = await import('../src/core/redact.js')
    // pattern requires exactly 35 chars after AIza
    const input = 'key=AIzaSyA1234567890abcdefghijklmnopqrstuv'
    expect(redactSecrets(input)).toBe('key=[REDACTED]')
  })

  it('replaces groq keys with [REDACTED]', async () => {
    const { redactSecrets } = await import('../src/core/redact.js')
    const input = 'GROQ=gsk_abcdefghij1234567890abcdef'
    expect(redactSecrets(input)).toContain('[REDACTED]')
  })

  it('leaves clean text alone', async () => {
    const { redactSecrets } = await import('../src/core/redact.js')
    const input = 'just a normal task description'
    expect(redactSecrets(input)).toBe(input)
  })

  it('is idempotent on already-redacted text', async () => {
    const { redactSecrets } = await import('../src/core/redact.js')
    const once = redactSecrets('sk-ant-abcdefghij1234567890abcd')
    const twice = redactSecrets(once)
    expect(twice).toBe(once)
  })
})
