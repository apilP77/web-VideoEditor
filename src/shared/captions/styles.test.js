import { describe, expect, it } from 'vitest'
import {
  CAPTION_ANIMATIONS,
  CAPTION_PRESETS,
  createCaptionStyle,
  getCaptionAnimationState,
  getContrastingTextColor,
} from './styles.js'

describe('caption styles and animation easing', () => {
  it('provides eight presets and eight animations', () => {
    expect(CAPTION_PRESETS).toHaveLength(8)
    expect(CAPTION_ANIMATIONS).toHaveLength(8)
    expect(createCaptionStyle('neon')).toMatchObject({
      preset: 'neon',
      glow: true,
      animation: 'shake-on-emphasis',
    })
  })

  it('calculates easing states from elapsed time', () => {
    expect(getCaptionAnimationState('fade', 0).opacity).toBe(0)
    expect(getCaptionAnimationState('fade', 1).opacity).toBe(1)
    expect(getCaptionAnimationState('reveal', 0.1, { wordIndex: 2 }).visible).toBe(false)
    expect(getCaptionAnimationState('reveal', 0.3, { wordIndex: 2 }).visible).toBe(true)
    expect(getCaptionAnimationState('typewriter', 0, { characterIndex: 5 }).visible).toBe(false)
    expect(getCaptionAnimationState('none', 0)).toMatchObject({ opacity: 1, scale: 1 })
    expect(getCaptionAnimationState('bounce', 0.1).offsetY).not.toBe(0)
    expect(getCaptionAnimationState('pop', 0.1).scale).not.toBe(1)
    expect(getCaptionAnimationState('slide-up', 0).offsetY).toBeGreaterThan(0)
    expect(getCaptionAnimationState('shake-on-emphasis', 0.05).rotation).not.toBe(0)
  })

  it('selects readable black or white text for the Pill highlight', () => {
    expect(getContrastingTextColor('#ffffff')).toBe('#101014')
    expect(getContrastingTextColor('#34215f')).toBe('#ffffff')
  })
})
