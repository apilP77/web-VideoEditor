import { describe, expect, it } from 'vitest'
import { getWeightedProgress } from './processingStages.js'

const stages = [
  { id: 'model', weight: 25 },
  { id: 'audio', weight: 15 },
  { id: 'transcribing', weight: 55 },
  { id: 'finishing', weight: 5 },
]

describe('getWeightedProgress', () => {
  it('uses completed stage weights and actual active-stage progress', () => {
    expect(getWeightedProgress(stages, 'audio', 50)).toBe(33)
    expect(getWeightedProgress(stages, 'transcribing', 50)).toBe(68)
    expect(getWeightedProgress(stages, 'finishing', 0)).toBe(95)
  })

  it('stays indeterminate when the active stage has no real percentage', () => {
    expect(getWeightedProgress(stages, 'model', null)).toBeNull()
    expect(getWeightedProgress(stages, 'missing', 50)).toBeNull()
  })

  it('clamps a reported percentage to the active stage range', () => {
    expect(getWeightedProgress(stages, 'model', 150)).toBe(25)
  })
})
