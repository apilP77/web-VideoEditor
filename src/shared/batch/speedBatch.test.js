import { describe, expect, it } from 'vitest'
import { BATCH_MODES } from './batchMode.js'
import {
  clampSpeed,
  estimateLength,
  getBlockingReason,
  getItemSpeed,
} from './speedBatch.js'

describe('clampSpeed', () => {
  it('limits the range and handles bad input', () => {
    expect(clampSpeed(10)).toBe(4)
    expect(clampSpeed(0.01)).toBe(0.25)
    expect(clampSpeed('2')).toBe(2)
    expect(clampSpeed('fast', 1.5)).toBe(1.5)
  })
})

describe('getItemSpeed', () => {
  it('uses the shared speed in "same for all" mode, ignoring per-video speeds', () => {
    expect(getItemSpeed({ mode: BATCH_MODES.all, sharedSpeed: 2, itemSpeeds: { a: 3 }, itemId: 'a' })).toBe(2)
  })

  it('uses the video\'s own speed in "each video" mode, else the shared one', () => {
    const input = { mode: BATCH_MODES.each, sharedSpeed: 2, itemSpeeds: { a: 3 } }
    expect(getItemSpeed({ ...input, itemId: 'a' })).toBe(3)
    expect(getItemSpeed({ ...input, itemId: 'b' })).toBe(2)
  })
})

describe('getBlockingReason', () => {
  const items = [
    { id: 'a', name: 'one.mp4', status: 'queued' },
    { id: 'b', name: 'two.mp4', status: 'queued' },
    { id: 'c', name: 'three.mp4', status: 'done' },
  ]

  it('blocks a shared speed of 1x', () => {
    expect(getBlockingReason({ items, mode: BATCH_MODES.all, sharedSpeed: 1, itemSpeeds: {} })).toMatch(/1x/)
    expect(getBlockingReason({ items, mode: BATCH_MODES.all, sharedSpeed: 2, itemSpeeds: {} })).toBe('')
  })

  it('names the videos still at 1x in "each video" mode, ignoring finished ones', () => {
    const one = getBlockingReason({ items, mode: BATCH_MODES.each, sharedSpeed: 1, itemSpeeds: { a: 2 } })
    expect(one).toContain('two.mp4')
    const both = getBlockingReason({ items, mode: BATCH_MODES.each, sharedSpeed: 1, itemSpeeds: {} })
    expect(both).toContain('2 videos')
    expect(getBlockingReason({ items, mode: BATCH_MODES.each, sharedSpeed: 1, itemSpeeds: { a: 2, b: 0.5 } })).toBe('')
  })

  it('has nothing to block when nothing is waiting', () => {
    expect(getBlockingReason({ items: [items[2]], mode: BATCH_MODES.all, sharedSpeed: 1, itemSpeeds: {} })).toBe('')
  })
})

describe('estimateLength', () => {
  it('divides by the speed and returns null for unknown lengths', () => {
    expect(estimateLength(60, 2)).toBe(30)
    expect(estimateLength(60, 0.5)).toBe(120)
    expect(estimateLength(0, 2)).toBeNull()
    expect(estimateLength(undefined, 2)).toBeNull()
  })
})
