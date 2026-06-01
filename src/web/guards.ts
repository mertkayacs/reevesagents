// Loopback request guards for the web UI: Host allowlist and Origin check.
// Input: raw HTTP header strings and the bound port. Output: allow/deny booleans.
// Invariant: there is no user login; these two checks are the only access gate,
// blocking DNS-rebinding (Host) and cross-site state changes (Origin).

import { URL } from 'node:url'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

// Returns the host portion of a `host[:port]` value, tolerating [ipv6]:port.
export function hostOnly(value: string): string {
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    return end >= 0 ? value.slice(0, end + 1) : value
  }
  const colon = value.lastIndexOf(':')
  return colon >= 0 ? value.slice(0, colon) : value
}

export function isAllowedHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false
  const host = stripBrackets(hostOnly(hostHeader.trim())).toLowerCase()
  return LOOPBACK_HOSTS.has(host)
}

export function isStateChangingMethod(method: string | undefined): boolean {
  const verb = (method ?? '').toUpperCase()
  return verb !== '' && verb !== 'GET' && verb !== 'HEAD' && verb !== 'OPTIONS'
}

// State-changing requests must carry an Origin that is one of our own loopback
// origins on the bound port. A cross-site form post would carry a foreign Origin.
export function isAllowedOrigin(originHeader: string | undefined, port: number): boolean {
  if (!originHeader) return false
  let url: URL
  try {
    url = new URL(originHeader)
  } catch {
    return false
  }
  const host = stripBrackets(url.hostname).toLowerCase()
  if (!LOOPBACK_HOSTS.has(host)) return false
  return url.port === String(port)
}
