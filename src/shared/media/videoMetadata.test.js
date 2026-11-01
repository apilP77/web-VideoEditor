import { describe, expect, it } from 'vitest'
import { resolveVideoMetadata } from './videoMetadata.js'

const fileInfo = { width: 1080, height: 1920, duration: 60.7 }

describe('resolveVideoMetadata', () => {
  it('uses the video element when it reports a picture and duration', () => {
    expect(
      resolveVideoMetadata({ videoWidth: 1280, videoHeight: 720, duration: 12 }, fileInfo),
    ).toEqual({ valid: true, width: 1280, height: 720, duration: 12, pictureVisible: true })
  })

  it('falls back to file metadata when the picture cannot be decoded', () => {
    expect(
      resolveVideoMetadata({ videoWidth: 0, videoHeight: 0, duration: 60.7 }, fileInfo),
    ).toEqual({ valid: true, width: 1080, height: 1920, duration: 60.7, pictureVisible: false })
  })

  it('uses the file duration when the element reports an infinite one', () => {
    const result = resolveVideoMetadata(
      { videoWidth: 640, videoHeight: 360, duration: Infinity },
      { width: 640, height: 360, duration: 9.5 },
    )
    expect(result.valid).toBe(true)
    expect(result.duration).toBe(9.5)
  })

  it('works from file metadata alone before the video element loads', () => {
    expect(resolveVideoMetadata(null, fileInfo)).toEqual({
      valid: true,
      width: 1080,
      height: 1920,
      duration: 60.7,
      pictureVisible: null,
    })
  })

  it('is invalid only when neither source has usable values', () => {
    expect(
      resolveVideoMetadata({ videoWidth: 0, videoHeight: 0, duration: NaN }, { hasAudio: 'unknown' })
        .valid,
    ).toBe(false)
  })
})
