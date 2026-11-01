import { describe, expect, it } from 'vitest'
import { getMediaDuration } from './duration.js'

describe('getMediaDuration', () => {
  it('prefers the first valid duration', () => {
    expect(getMediaDuration(60.7, 61)).toBe(60.7)
  })

  it('falls back when browser metadata is invalid', () => {
    expect(getMediaDuration(Number.NaN, Number.POSITIVE_INFINITY, 60.7)).toBe(60.7)
  })

  it('returns zero when no duration is valid', () => {
    expect(getMediaDuration(0, -1, Number.NaN, Number.POSITIVE_INFINITY)).toBe(0)
  })
})
