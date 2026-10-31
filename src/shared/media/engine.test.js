import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMediaCapabilities: vi.fn(),
  trimFast: vi.fn(),
  trimFallback: vi.fn(),
}))

vi.mock('./capabilities.js', () => ({
  getMediaCapabilities: mocks.getMediaCapabilities,
}))

vi.mock('./webcodecsEngine.js', () => ({
  trimVideo: mocks.trimFast,
}))

vi.mock('../ffmpeg/ffmpegClient.js', () => ({
  trimVideo: mocks.trimFallback,
}))

import { trimVideo } from './engine.js'

describe('engine selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMediaCapabilities.mockResolvedValue({ h264: true, aac: true })
    mocks.trimFast.mockResolvedValue({ blob: new Blob(), filename: 'fast.mp4' })
    mocks.trimFallback.mockResolvedValue({ blob: new Blob(), filename: 'fallback.mp4' })
  })

  it('uses WebCodecs when H.264 encoding is supported', async () => {
    const result = await trimVideo({ name: 'clip.mp4' }, 1, 3)

    expect(mocks.trimFast).toHaveBeenCalledOnce()
    expect(mocks.trimFallback).not.toHaveBeenCalled()
    expect(result.processedWith).toBe('Fast mode (hardware)')
  })

  it('uses FFmpeg when the browser does not support H.264 encoding', async () => {
    mocks.getMediaCapabilities.mockResolvedValue({ h264: false, aac: false })

    const result = await trimVideo({ name: 'clip.mp4' }, 1, 3)

    expect(mocks.trimFast).not.toHaveBeenCalled()
    expect(mocks.trimFallback).toHaveBeenCalledOnce()
    expect(result.processedWith).toBe('Compatible mode')
  })

  it('falls back to FFmpeg when WebCodecs cannot read or process the input', async () => {
    mocks.trimFast.mockRejectedValue(new Error('Unsupported input format.'))

    const result = await trimVideo({ name: 'clip.unknown' }, 1, 3)

    expect(mocks.trimFallback).toHaveBeenCalledOnce()
    expect(result.processedWith).toBe('Compatible mode')
  })

  it('does not retry a cancelled WebCodecs operation in FFmpeg', async () => {
    const controller = new AbortController()
    const error = new Error('Video processing was cancelled.')
    error.name = 'AbortError'
    mocks.trimFast.mockRejectedValue(error)

    await expect(
      trimVideo({ name: 'clip.mp4' }, 1, 3, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.trimFallback).not.toHaveBeenCalled()
  })
})
