import { describe, expect, it } from 'vitest'
import { nodeVersionCheck } from '../src/core/doctor.js'

describe('doctor', () => {
  it('node check enforces package minimum 22.12.0', () => {
    expect(nodeVersionCheck('v20.19.0').status).toBe('fail')
    expect(nodeVersionCheck('v22.11.0').status).toBe('fail')
    expect(nodeVersionCheck('v22.11.0').detail).toBe('22.11.0 (need >=22.12.0)')
    expect(nodeVersionCheck('v22.12.0').status).toBe('ok')
    expect(nodeVersionCheck('v24.0.0').status).toBe('ok')
  })
})
