import { describe, it, expect } from 'vitest'
import { ApprovalDeny } from '../../src/screens/approval/Deny.js'

describe('ApprovalDeny', () => {
  it('exports ApprovalDeny as a React component function', () => {
    expect(typeof ApprovalDeny).toBe('function')
  })

  it('ApprovalDeny has component display name or is callable', () => {
    expect(ApprovalDeny).toBeDefined()
    expect(ApprovalDeny).toBeInstanceOf(Function)
  })
})
