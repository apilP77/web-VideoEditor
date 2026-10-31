import { describe, expect, it } from 'vitest'
import { calculateNewDuration } from './speed.js'

describe('calculateNewDuration', () => {
  it('scales the original duration by the selected speed', () => {
    expect(calculateNewDuration(120, 2)).toBe(60)
    expect(calculateNewDuration(120, 0.5)).toBe(240)
  })

  it('rejects invalid duration and speed values', () => {
    expect(() => calculateNewDuration(-1, 2)).toThrow(
      'Duration must be a non-negative finite number.',
    )
    expect(() => calculateNewDuration(60, 0)).toThrow(
      'Speed must be a positive finite number.',
    )
  })
})
