import { describe, expect, it } from 'vitest'
import {
  getPreviewProxySize,
  getPreviewSize,
  shouldCreatePreviewProxy,
} from './previewProxy.js'

describe('preview proxy decisions', () => {
  it('creates a proxy for an undecodable frame or a long edge above 2000px', () => {
    expect(shouldCreatePreviewProxy({ width: 1080, height: 1920 })).toBe(false)
    expect(shouldCreatePreviewProxy({ width: 2160, height: 3840 })).toBe(true)
    expect(
      shouldCreatePreviewProxy({
        width: 1920,
        height: 1080,
        frameAvailable: false,
      }),
    ).toBe(true)
  })

  it('fits landscape and portrait dimensions without stretching', () => {
    expect(getPreviewProxySize(3840, 2160)).toEqual({ width: 960, height: 540 })
    expect(getPreviewProxySize(2160, 3840)).toEqual({ width: 540, height: 960 })
    expect(getPreviewSize(2160, 3840, 400, 500)).toEqual({ width: 280, height: 500 })
  })

  it('returns empty dimensions for invalid sizes', () => {
    expect(getPreviewSize(0, 100, 400, 500)).toEqual({ width: 0, height: 0 })
  })
})
