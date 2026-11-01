import { describe, expect, it } from 'vitest'
import { isOutOfMemoryError } from './memoryErrors.js'

describe('isOutOfMemoryError', () => {
  it('recognises wasm and FFmpeg memory failures', () => {
    expect(isOutOfMemoryError(new Error('RuntimeError: memory access out of bounds'))).toBe(true)
    expect(isOutOfMemoryError(new Error('Aborted(OOM)'))).toBe(true)
    expect(isOutOfMemoryError(new RangeError('Array buffer allocation failed'))).toBe(true)
  })

  it('looks in technical details and the cause', () => {
    const logged = new Error('FFmpeg could not process this file (exit code 1).')
    logged.technicalDetails = 'FFmpeg log:\n[libx264] malloc of size 12441600 failed\nCannot allocate memory\nENOMEM'
    expect(isOutOfMemoryError(logged)).toBe(true)
    const wrapped = new Error('Preview failed', { cause: new Error('Out of memory') })
    expect(isOutOfMemoryError(wrapped)).toBe(true)
  })

  it('ignores ordinary failures', () => {
    expect(isOutOfMemoryError(new Error('Invalid data found when processing input'))).toBe(false)
    expect(isOutOfMemoryError(null)).toBe(false)
  })
})
