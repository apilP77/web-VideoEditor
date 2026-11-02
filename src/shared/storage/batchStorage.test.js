import { describe, expect, it } from 'vitest'
import { isRecentBatch, serializeBatch } from './batchStorage.js'

describe('serializeBatch', () => {
  const items = [
    { name: 'a.mp4', size: 10, duration: 5, status: 'done', file: new File(['x'], 'a.mp4'), result: { captions: [1] }, percent: 100 },
    { name: 'b.mp4', size: 20, duration: null, status: 'failed', file: new File(['x'], 'b.mp4'), result: null, error: 'bad' },
    { name: 'c.mp4', size: 30, status: 'running', result: { stale: true } },
  ]

  it('keeps names, sizes, statuses and results of finished items, never files', () => {
    const saved = serializeBatch(items, { presetId: 'bold', model: 'fast', language: 'auto', pace: 3 })
    expect(saved.items).toEqual([
      { name: 'a.mp4', size: 10, duration: 5, status: 'done', result: { captions: [1] } },
      { name: 'b.mp4', size: 20, duration: null, status: 'failed', result: null },
      { name: 'c.mp4', size: 30, duration: null, status: 'running', result: null },
    ])
    expect(saved.settings).toEqual({ presetId: 'bold', model: 'fast', language: 'auto', pace: 3 })
    expect(JSON.stringify(saved)).not.toContain('"file"')
  })
})

describe('isRecentBatch', () => {
  it('accepts a batch within 14 days and rejects older or invalid ones', () => {
    const now = 1_000_000_000_000
    const day = 24 * 60 * 60 * 1000
    expect(isRecentBatch({ savedAt: now - 13 * day }, now)).toBe(true)
    expect(isRecentBatch({ savedAt: now - 15 * day }, now)).toBe(false)
    expect(isRecentBatch({}, now)).toBe(false)
    expect(isRecentBatch(null, now)).toBe(false)
  })
})
