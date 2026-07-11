import { describe, expect, it } from 'vitest'
import { RingBuffer } from '../src/core/buffer.js'

describe('RingBuffer', () => {
  it('treats a trailing newline as a final empty line', () => {
    const buf = new RingBuffer()
    buf.push('one\ntwo\nthree\nfour\n')
    // split yields [..., 'four', ''] so the newest two "lines" are 'four' and ''.
    expect(buf.tail(2)).toBe('four\n')
  })

  it('slices from the end when asked for fewer lines than it holds', () => {
    const buf = new RingBuffer()
    buf.push('a\nb\nc\nd\ne')
    expect(buf.tail(3)).toBe('c\nd\ne')
    expect(buf.tail(1)).toBe('e')
  })

  it('returns everything when asked for more lines than it holds', () => {
    const buf = new RingBuffer()
    buf.push('x\ny')
    expect(buf.tail(50)).toBe('x\ny')
  })

  it('accumulates across pushes', () => {
    const buf = new RingBuffer()
    buf.push('first ')
    buf.push('second\n')
    buf.push('third')
    expect(buf.tail(2)).toBe('first second\nthird')
  })

  it('evicts oldest bytes once the cap is exceeded', () => {
    const buf = new RingBuffer(10)
    buf.push('0123456789ABCDE')
    // Only the last 10 chars survive.
    expect(buf.tail(1)).toBe('56789ABCDE')
  })

  it('coerces a non-positive line count to one line', () => {
    const buf = new RingBuffer()
    buf.push('p\nq\nr')
    expect(buf.tail(0)).toBe('r')
    expect(buf.tail(-4)).toBe('r')
  })
})
