import { describe, it, expect } from 'vitest'
import { hostOnly, isAllowedHostHeader, isAllowedOrigin, isStateChangingMethod } from '../../src/surfaces/webui/guards.js'

describe('hostOnly', () => {
  it('strips the port from host:port', () => {
    expect(hostOnly('127.0.0.1:8080')).toBe('127.0.0.1')
  })
  it('keeps bracketed ipv6 and drops its port', () => {
    expect(hostOnly('[::1]:8080')).toBe('[::1]')
  })
  it('returns a bare host unchanged', () => {
    expect(hostOnly('localhost')).toBe('localhost')
  })
})

describe('isAllowedHostHeader', () => {
  it('accepts loopback hosts', () => {
    expect(isAllowedHostHeader('127.0.0.1:8080')).toBe(true)
    expect(isAllowedHostHeader('localhost:8081')).toBe(true)
    expect(isAllowedHostHeader('[::1]:8080')).toBe(true)
    expect(isAllowedHostHeader('127.0.0.1')).toBe(true)
  })
  it('rejects foreign and empty hosts', () => {
    expect(isAllowedHostHeader('evil.com')).toBe(false)
    expect(isAllowedHostHeader('attacker.local:8080')).toBe(false)
    expect(isAllowedHostHeader(undefined)).toBe(false)
    expect(isAllowedHostHeader('')).toBe(false)
  })
})

describe('isStateChangingMethod', () => {
  it('treats read methods as safe', () => {
    expect(isStateChangingMethod('GET')).toBe(false)
    expect(isStateChangingMethod('HEAD')).toBe(false)
    expect(isStateChangingMethod('OPTIONS')).toBe(false)
    expect(isStateChangingMethod(undefined)).toBe(false)
  })
  it('treats write methods as state-changing', () => {
    expect(isStateChangingMethod('POST')).toBe(true)
    expect(isStateChangingMethod('delete')).toBe(true)
    expect(isStateChangingMethod('PUT')).toBe(true)
  })
})

describe('isAllowedOrigin', () => {
  it('accepts our loopback origin on the bound port', () => {
    expect(isAllowedOrigin('http://127.0.0.1:8080', 8080)).toBe(true)
    expect(isAllowedOrigin('http://localhost:8080', 8080)).toBe(true)
    expect(isAllowedOrigin('http://[::1]:8080', 8080)).toBe(true)
  })
  it('rejects wrong port, foreign host, and malformed origins', () => {
    expect(isAllowedOrigin('http://127.0.0.1:9999', 8080)).toBe(false)
    expect(isAllowedOrigin('http://evil.com:8080', 8080)).toBe(false)
    expect(isAllowedOrigin(undefined, 8080)).toBe(false)
    expect(isAllowedOrigin('not a url', 8080)).toBe(false)
  })
})
