let capabilitiesPromise

async function checkEncoderSupport(encoder, config) {
  if (!encoder || typeof encoder.isConfigSupported !== 'function') {
    return false
  }

  try {
    const support = await encoder.isConfigSupported(config)
    return support.supported === true
  } catch {
    return false
  }
}

/**
 * Checks and caches browser support for H.264 video and AAC audio encoding.
 *
 * @returns {Promise<{h264: boolean, aac: boolean}>} Supported WebCodecs encoders.
 */
export function getMediaCapabilities() {
  if (!capabilitiesPromise) {
    capabilitiesPromise = Promise.all([
      checkEncoderSupport(globalThis.VideoEncoder, {
        codec: 'avc1.42001f',
        width: 640,
        height: 480,
      }),
      checkEncoderSupport(globalThis.AudioEncoder, {
        codec: 'mp4a.40.2',
        sampleRate: 48000,
        numberOfChannels: 2,
      }),
    ]).then(([h264, aac]) => ({ h264, aac }))
  }

  return capabilitiesPromise
}
