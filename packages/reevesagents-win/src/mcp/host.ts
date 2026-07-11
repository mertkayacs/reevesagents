// Detect which host CLI launched this MCP server. The unix version reads
// /proc/<ppid>/comm and /proc/<ppid>/cmdline, neither of which exists on native
// Windows. A reliable Windows parent probe needs CIM/WMI (e.g. Get-CimInstance
// Win32_Process -Filter "ProcessId=<ppid>"), which we do not ship for MVP.
//
// Returning null is safe: the server just starts a normal session run on the first
// spawn instead of making the host the head of a shared run. sessionRunId reuse does
// not need the host identity. Future: add the CIM probe to enable host-as-head.

import type { Provider } from '../shared/types.js'

export function detectHostProvider(): Provider | null {
  return null
}
