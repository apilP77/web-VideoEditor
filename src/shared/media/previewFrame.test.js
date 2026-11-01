import { describe, expect, it } from 'vitest'
import { classifyFramePixels, describeCodec } from './previewFrame.js'

describe('classifyFramePixels', () => {
  it('reports a visible picture when any opaque pixel is not black', () => {
    expect(classifyFramePixels([0, 0, 0, 255, 120, 80, 40, 255])).toBe('visible')
  })

  it('reports black when every opaque pixel is black', () => {
    expect(classifyFramePixels([0, 0, 0, 255, 3, 2, 1, 255])).toBe('black')
  })

  it('reports unknown for transparent pixels read mid-seek', () => {
    expect(classifyFramePixels([0, 0, 0, 0, 0, 0, 0, 0])).toBe('unknown')
  })
})

describe('describeCodec', () => {
  it('names common codecs', () => {
    expect(describeCodec('hevc')).toBe('HEVC (H.265)')
    expect(describeCodec('hvc1.1.6.L153.B0')).toBe('HEVC (H.265)')
    expect(describeCodec('avc')).toBe('H.264')
    expect(describeCodec(null)).toBe('')
  })
})
