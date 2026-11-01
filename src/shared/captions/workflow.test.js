import { describe, expect, it } from 'vitest'
import { canOpenCaptionStep } from './workflow.js'

describe('canOpenCaptionStep', () => {
  it('allows Video and Words before transcription is complete', () => {
    expect(canOpenCaptionStep(1, false)).toBe(true)
    expect(canOpenCaptionStep(2, false)).toBe(true)
  })

  it('locks Style and export until captions exist', () => {
    expect(canOpenCaptionStep(3, false)).toBe(false)
    expect(canOpenCaptionStep(3, true)).toBe(true)
  })

  it('rejects invalid step values', () => {
    expect(canOpenCaptionStep(0, true)).toBe(false)
    expect(canOpenCaptionStep(4, true)).toBe(false)
  })
})
