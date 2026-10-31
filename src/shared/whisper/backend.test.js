import { describe, expect, it, vi } from 'vitest'
import { selectWhisperBackend } from './backend.js'

describe('selectWhisperBackend', () => {
  it('chooses WASM when WebGPU is missing', async () => {
    expect(await selectWhisperBackend({})).toBe('wasm')
  })

  it('chooses WASM when no GPU adapter is available', async () => {
    const navigatorLike = {
      gpu: { requestAdapter: vi.fn().mockResolvedValue(null) },
    }

    expect(await selectWhisperBackend(navigatorLike)).toBe('wasm')
    expect(navigatorLike.gpu.requestAdapter).toHaveBeenCalledOnce()
  })

  it('chooses WebGPU when an adapter is available', async () => {
    const navigatorLike = {
      gpu: { requestAdapter: vi.fn().mockResolvedValue({}) },
    }

    expect(await selectWhisperBackend(navigatorLike)).toBe('webgpu')
    expect(navigatorLike.gpu.requestAdapter).toHaveBeenCalledOnce()
  })
})
