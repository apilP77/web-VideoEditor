import { describe, expect, it } from 'vitest'
import { removePreset, sanitizePreset, upsertPreset } from './batchPresets.js'

const base = { name: 'Podcast', presetId: 'classic', model: 'balanced', language: 'auto', pace: 5 }

describe('sanitizePreset', () => {
  it('keeps a valid preset and trims the name', () => {
    expect(sanitizePreset({ ...base, name: '  Podcast  ', extra: 1 })).toEqual(base)
  })

  it('accepts the sentence pace and numeric strings', () => {
    expect(sanitizePreset({ ...base, pace: 'sentence' }).pace).toBe('sentence')
    expect(sanitizePreset({ ...base, pace: '3' }).pace).toBe(3)
  })

  it('rejects unusable values', () => {
    expect(sanitizePreset(null)).toBeNull()
    expect(sanitizePreset({ ...base, name: '   ' })).toBeNull()
    expect(sanitizePreset({ ...base, model: 7 })).toBeNull()
    expect(sanitizePreset({ ...base, pace: 'fast' })).toBeNull()
  })

  it('limits the name length', () => {
    expect(sanitizePreset({ ...base, name: 'x'.repeat(100) }).name).toHaveLength(40)
  })
})

describe('upsertPreset and removePreset', () => {
  it('puts the newest preset first', () => {
    const list = upsertPreset([base], { ...base, name: 'Shorts' })
    expect(list.map((entry) => entry.name)).toEqual(['Shorts', 'Podcast'])
  })

  it('replaces a preset with the same name, ignoring case', () => {
    const list = upsertPreset([base], { ...base, name: 'podcast', pace: 1 })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'podcast', pace: 1 })
  })

  it('ignores an invalid preset and caps the list at 12', () => {
    expect(upsertPreset([base], { name: '' })).toEqual([base])
    let list = []
    for (let index = 0; index < 20; index += 1) list = upsertPreset(list, { ...base, name: `Set ${index}` })
    expect(list).toHaveLength(12)
    expect(list[0].name).toBe('Set 19')
  })

  it('removes by name', () => {
    expect(removePreset([base, { ...base, name: 'Shorts' }], 'Podcast').map((entry) => entry.name)).toEqual(['Shorts'])
  })
})
