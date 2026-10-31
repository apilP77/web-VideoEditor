import { afterEach, describe, expect, it, vi } from 'vitest'

describe('WebCodecs capabilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('checks H.264 and AAC support once and caches the result', async () => {
    const videoSupport = vi.fn().mockResolvedValue({ supported: true })
    const audioSupport = vi.fn().mockResolvedValue({ supported: false })
    vi.stubGlobal('VideoEncoder', { isConfigSupported: videoSupport })
    vi.stubGlobal('AudioEncoder', { isConfigSupported: audioSupport })

    const { getMediaCapabilities } = await import('./capabilities.js')
    await expect(getMediaCapabilities()).resolves.toEqual({
      h264: true,
      aac: false,
    })
    await expect(getMediaCapabilities()).resolves.toEqual({
      h264: true,
      aac: false,
    })

    expect(videoSupport).toHaveBeenCalledOnce()
    expect(videoSupport).toHaveBeenCalledWith({
      codec: 'avc1.42001f',
      width: 640,
      height: 480,
    })
    expect(audioSupport).toHaveBeenCalledOnce()
  })

  it('reports unsupported encoders when WebCodecs is unavailable', async () => {
    vi.stubGlobal('VideoEncoder', undefined)
    vi.stubGlobal('AudioEncoder', undefined)
    const { getMediaCapabilities } = await import('./capabilities.js')

    await expect(getMediaCapabilities()).resolves.toEqual({
      h264: false,
      aac: false,
    })
  })
})
