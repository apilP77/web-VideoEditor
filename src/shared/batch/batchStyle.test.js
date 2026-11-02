import { describe, expect, it } from 'vitest'
import { createCaptionStyle, CAPTION_PRESETS } from '../captions/styles.js'
import { BATCH_TEXT_SIZE, createBatchCaptionStyle } from './batchStyle.js'

describe('createBatchCaptionStyle', () => {
  it('uses one font, size and box-free look for every preset', () => {
    for (const preset of CAPTION_PRESETS) {
      const style = createBatchCaptionStyle(preset.id)
      expect(style.fontFamily).toBe('Poppins')
      expect(style.fontWeight).toBe(700)
      expect(style.size).toBe(BATCH_TEXT_SIZE)
      expect(style.backgroundOpacity).toBe(0)
      expect(style.allCaps).toBe(false)
      expect(style.strokeWidth).toBe(0)
      expect(style.shadow).toBe(true)
      expect(style.preset).toBe('pill')
    }
  })

  it('lets the preset pick the highlight colour and animation', () => {
    expect(createBatchCaptionStyle('classic').highlightColor).toBe('#1f6bff')
    expect(createBatchCaptionStyle('neon').highlightColor).toBe(createCaptionStyle('neon').highlightColor)
    expect(createBatchCaptionStyle('bold').animation).toBe(createCaptionStyle('bold').animation)
  })

  it('does not change the shared preset data', () => {
    const before = createCaptionStyle('bold').size
    createBatchCaptionStyle('bold')
    expect(createCaptionStyle('bold').size).toBe(before)
  })
})
