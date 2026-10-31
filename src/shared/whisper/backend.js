let backendSelection

/**
 * Selects WebGPU only when the injected navigator exposes an available adapter.
 *
 * @param {{gpu?: {requestAdapter?: () => Promise<unknown>}} | undefined} navigatorLike Browser navigator or a test double.
 * @returns {Promise<'webgpu' | 'wasm'>} The usable ONNX execution backend.
 */
export async function selectWhisperBackend(navigatorLike) {
  const gpu = navigatorLike?.gpu
  if (typeof gpu?.requestAdapter !== 'function') return 'wasm'

  try {
    return (await gpu.requestAdapter()) ? 'webgpu' : 'wasm'
  } catch {
    return 'wasm'
  }
}

/**
 * Detects and caches the best backend for this worker's lifetime.
 *
 * @returns {Promise<'webgpu' | 'wasm'>} The usable ONNX execution backend.
 */
export function getWhisperBackend() {
  backendSelection ??= selectWhisperBackend(globalThis.navigator)
  return backendSelection
}
